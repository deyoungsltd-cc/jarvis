/**
 * RAG (Retrieval-Augmented Generation) Service — Round 2
 *
 * Accepts document uploads, extracts text, chunks into ~500 token
 * segments with 50-token overlap, stores in DB, and retrieves via
 * simple keyword matching for the LLM context.
 */
import { db } from '@/lib/api/db';
import { logger } from '@/lib/api/logger';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

// ---- Types ----

export interface UploadResult {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  textHash: string;
}

export interface QueryResult {
  query: string;
  chunks: Array<{
    id: string;
    documentId: string;
    chunkIndex: number;
    content: string;
    tokenCount: number;
    score: number;
  }>;
}

export interface DocumentListItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  uploadedBy: string;
  missionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentDetail extends DocumentListItem {
  textHash: string | null;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    content: string;
    tokenCount: number;
    createdAt: Date;
  }>;
}

// ---- Constants ----

const CHUNK_SIZE_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4; // rough approximation
const CHUNK_SIZE_CHARS = CHUNK_SIZE_TOKENS * CHARS_PER_TOKEN;
const CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN;

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// ---- Text Extraction ----

/** Extract text content from a file buffer based on its MIME type. */
async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  switch (mimeType) {
    case 'text/plain':
      return buffer.toString('utf-8');

    case 'text/markdown':
      return buffer.toString('utf-8');

    case 'application/json':
      return buffer.toString('utf-8');

    case 'application/pdf': {
      try {
        // Dynamic import for pdf-parse (CJS module)
        const pdfParse = (await import('pdf-parse')).default;
        const result = await pdfParse(buffer);
        return result.text || '';
      } catch (err) {
        logger.error('rag', `Failed to parse PDF ${filename}: ${err}`);
        throw new Error(`PDF parsing failed for ${filename}`);
      }
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      // For DOCX: attempt basic extraction. In MVP, we extract text from
      // the XML inside the docx zip. A full implementation would use mammoth.
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(buffer);
        const docXml = zip.file('word/document.xml');
        if (!docXml) return '[DOCX: No document.xml found]';
        const xmlContent = await docXml.async('string');
        // Strip XML tags to get plain text
        const text = xmlContent
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return text || '[DOCX: No text content extracted]';
      } catch {
        // JSZip not installed — return a placeholder
        return `[DOCX file: ${filename}. Install jszip for full DOCX support.]`;
      }
    }

    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

// ---- Chunking ----

/** Split text into overlapping chunks of ~500 tokens (~2000 chars). */
function chunkText(text: string): Array<{ content: string; tokenCount: number }> {
  const chunks: Array<{ content: string; tokenCount: number }> = [];
  if (!text || text.trim().length === 0) return chunks;

  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE_CHARS, normalized.length);

    // Try to break at a paragraph or sentence boundary
    if (end < normalized.length) {
      // Look for paragraph break
      const paragraphBreak = normalized.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + CHUNK_SIZE_CHARS / 2) {
        end = paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceBreak = normalized.lastIndexOf('. ', end);
        if (sentenceBreak > start + CHUNK_SIZE_CHARS / 2) {
          end = sentenceBreak + 2;
        } else {
          // Look for space
          const spaceBreak = normalized.lastIndexOf(' ', end);
          if (spaceBreak > start) {
            end = spaceBreak + 1;
          }
        }
      }
    }

    const content = normalized.slice(start, end).trim();
    if (content.length > 0) {
      const tokenCount = Math.ceil(content.length / CHARS_PER_TOKEN);
      chunks.push({ content, tokenCount });
    }

    // Move forward with overlap
    start = end - CHUNK_OVERLAP_CHARS;
    if (start >= normalized.length) break;
    if (end >= normalized.length) break;

    index++;
    // Safety: prevent infinite loop
    if (index > 10000) break;
  }

  return chunks;
}

// ---- Hashing ----

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ---- Public API ----

/**
 * Upload and process a document.
 *
 * @param file - { buffer, originalname, mimetype, size }
 * @param missionId - optional mission association
 * @param uploadedBy - who uploaded
 */
export async function uploadDocument(
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  missionId?: string,
  uploadedBy: string = 'default',
): Promise<UploadResult> {
  const { buffer, originalname, mimetype, size } = file;

  if (!SUPPORTED_MIME_TYPES.has(mimetype)) {
    throw new Error(`Unsupported file type: ${mimetype}. Supported: PDF, TXT, MD, JSON, DOCX`);
  }

  // Extract text
  const fullText = await extractText(buffer, mimetype, originalname);
  const textHash = hashText(fullText);

  // Check for duplicate by hash
  const existing = await db.document.findFirst({ where: { textHash } });
  if (existing) {
    logger.info('rag', `Duplicate document detected: ${originalname} matches ${existing.id}`);
    // Return the existing document info
    return {
      id: existing.id,
      filename: existing.filename,
      mimeType: existing.mimeType,
      sizeBytes: existing.sizeBytes,
      chunkCount: existing.chunkCount,
      textHash: existing.textHash || '',
    };
  }

  // Chunk text
  const chunks = chunkText(fullText);

  // Store document + chunks in a transaction
  const doc = await db.document.create({
    data: {
      filename: originalname,
      mimeType: mimetype,
      sizeBytes: size,
      chunkCount: chunks.length,
      textHash,
      uploadedBy,
      missionId: missionId || null,
      chunks: {
        create: chunks.map((chunk, i) => ({
          chunkIndex: i,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
        })),
      },
    },
  });

  logger.info('rag', `Document uploaded: ${originalname} → ${chunks.length} chunks (${doc.id})`);

  return {
    id: doc.id,
    filename: doc.filename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    chunkCount: doc.chunkCount,
    textHash: doc.textHash || '',
  };
}

/**
 * Query documents using simple keyword matching.
 * Returns top-K chunks ranked by relevance score.
 */
export async function queryDocuments(query: string, topK: number = 5): Promise<QueryResult> {
  // Tokenize query into keywords (lowercase, filter stopwords)
  const stopwords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'or', 'if', 'while', 'that', 'this',
    'it', 'its', 'what', 'which', 'who', 'whom', 'these', 'those', 'i',
    'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
  ]);

  const queryWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopwords.has(w));

  if (queryWords.length === 0) {
    return { query, chunks: [] };
  }

  // Fetch all chunks from DB
  const allChunks = await db.documentChunk.findMany({
    include: { document: true },
  });

  // Score each chunk
  const scored = allChunks.map(chunk => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;

    for (const word of queryWords) {
      // Count occurrences
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    // Boost score if multiple query words appear in same chunk
    const uniqueWordsFound = new Set<string>();
 for (const word of queryWords) {
      if (contentLower.includes(word)) {
        uniqueWordsFound.add(word);
      }
    }
    score += uniqueWordsFound.size * 2; // bonus for coverage

    return {
      id: chunk.id,
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      score,
    };
  });

  // Sort by score descending, take top-K, filter out zero-score
  const results = scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  logger.info('rag', `Query "${query}" → ${results.length} relevant chunks (from ${allChunks.length} total)`);

  return { query, chunks: results };
}

/** Delete a document and all its chunks (cascade). */
export async function deleteDocument(docId: string): Promise<void> {
  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc) {
    throw new Error(`Document not found: ${docId}`);
  }
  await db.document.delete({ where: { id: docId } });
  logger.info('rag', `Document deleted: ${doc.filename} (${docId})`);
}

/** List all uploaded documents (without chunks). */
export async function listDocuments(): Promise<DocumentListItem[]> {
  const docs = await db.document.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(d => ({
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    chunkCount: d.chunkCount,
    uploadedBy: d.uploadedBy,
    missionId: d.missionId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

/** Get a single document with its chunks. */
export async function getDocument(docId: string): Promise<DocumentDetail> {
  const doc = await db.document.findUnique({
    where: { id: docId },
    include: {
      chunks: { orderBy: { chunkIndex: 'asc' } },
    },
  });
  if (!doc) {
    throw new Error(`Document not found: ${docId}`);
  }
  return {
    id: doc.id,
    filename: doc.filename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    chunkCount: doc.chunkCount,
    textHash: doc.textHash,
    uploadedBy: doc.uploadedBy,
    missionId: doc.missionId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    chunks: doc.chunks.map(c => ({
      id: c.id,
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
      createdAt: c.createdAt,
    })),
  };
}
