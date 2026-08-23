/**
 * Document/RAG Routes — Round 2
 *
 * Upload, list, query, and delete documents for RAG pipeline.
 */
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { ragService } from '../services/ragService.js';
import { badRequest, notFound } from '../utils/errors.js';

const router = Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/json',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/** POST /documents/upload — upload a document */
router.post('/upload', upload.single('file'), async (req, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;

    if (!req.file) {
      throw badRequest('NO_FILE', 'No file uploaded. Use multipart form with field name "file"', requestId);
    }

    const { missionId, uploadedBy } = req.body;

    const result = await ragService.uploadDocument(
      {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
      missionId || undefined,
      uploadedBy || 'default',
    );

    res.status(201).json(result);
  } catch (err) { next(err); }
});

/** GET /documents — list all documents */
router.get('/', async (_req, res: Response, next: NextFunction) => {
  try {
    const docs = await ragService.listDocuments();
    res.json({ documents: docs, count: docs.length });
  } catch (err) { next(err); }
});

/** GET /documents/:id — get document details with chunks */
router.get('/:id', async (req, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const doc = await ragService.getDocument(req.params.id);
    res.json(doc);
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json(notFound('DOC_NOT_FOUND', err.message, requestId).toJSON());
      return;
    }
    next(err);
  }
});

/** POST /documents/query — query against documents */
router.post('/query', async (req, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { query, topK } = req.body;

    if (!query || typeof query !== 'string') {
      throw badRequest('VALIDATION_ERROR', '"query" field is required', requestId);
    }

    const result = await ragService.queryDocuments(query, topK || 5);
    res.json(result);
  } catch (err) { next(err); }
});

/** DELETE /documents/:id — delete a document and its chunks */
router.delete('/:id', async (req, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    await ragService.deleteDocument(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json(notFound('DOC_NOT_FOUND', err.message, requestId).toJSON());
      return;
    }
    next(err);
  }
});

export default router;
