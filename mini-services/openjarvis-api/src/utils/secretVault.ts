/**
 * Secret Vault — AES-256-GCM encryption for API keys and secrets.
 *
 * Uses Node.js built-in `crypto`. Key derived from `os.hostname()` + a random salt
 * stored in `data/vault.key`. Secrets persisted in `data/secrets.enc.json`.
 */

import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(process.cwd(), 'data');
const VAULT_KEY_PATH = path.join(DATA_DIR, 'vault.key');
const SECRETS_PATH = path.join(DATA_DIR, 'secrets.enc.json');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

interface VaultKeyData {
  salt: string; // hex
  key: string;  // hex
}

let cachedKey: Buffer | null = null;
let cachedSalt: Buffer | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Derive a 256-bit key using PBKDF2 from hostname + salt */
function deriveKey(salt: Buffer): Buffer {
  const passphrase = os.hostname();
  return crypto.pbkdf2Sync(passphrase, salt, 100_000, KEY_LENGTH, 'sha512');
}

/** Load or create the vault key file */
function getOrCreateKey(): { key: Buffer; salt: Buffer } {
  if (cachedKey && cachedSalt) {
    return { key: cachedKey, salt: cachedSalt };
  }

  ensureDataDir();

  if (fs.existsSync(VAULT_KEY_PATH)) {
    try {
      const raw = fs.readFileSync(VAULT_KEY_PATH, 'utf-8');
      const data: VaultKeyData = JSON.parse(raw);
      cachedSalt = Buffer.from(data.salt, 'hex');
      cachedKey = Buffer.from(data.key, 'hex');
      return { key: cachedKey, salt: cachedSalt };
    } catch (err: any) {
      logger.warn('-', `Failed to read vault key, regenerating: ${err.message}`);
    }
  }

  // Generate new key
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);

  const data: VaultKeyData = {
    salt: salt.toString('hex'),
    key: key.toString('hex'),
  };

  ensureDataDir();
  fs.writeFileSync(VAULT_KEY_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });

  cachedSalt = salt;
  cachedKey = key;

  logger.info('-', 'Vault key generated and stored');
  return { key, salt };
}

// ---------------------------------------------------------------------------
// Secrets store (on-disk)
// ---------------------------------------------------------------------------

interface EncryptedSecretEntry {
  iv: string;    // hex
  tag: string;   // hex
  data: string;  // hex
}

type SecretsMap = Record<string, EncryptedSecretEntry>;

function loadSecrets(): SecretsMap {
  ensureDataDir();
  if (!fs.existsSync(SECRETS_PATH)) return {};
  try {
    const raw = fs.readFileSync(SECRETS_PATH, 'utf-8');
    return JSON.parse(raw) as SecretsMap;
  } catch (err: any) {
    logger.warn('-', `Failed to load secrets file: ${err.message}`);
    return {};
  }
}

function saveSecrets(secrets: SecretsMap): void {
  ensureDataDir();
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2), { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Encrypt a plaintext string. Returns { iv (hex), tag (hex), data (hex) } */
export function encrypt(plaintext: string): { iv: string; tag: string; data: string } {
  const { key } = getOrCreateKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

/** Decrypt using the stored vault key. Takes hex strings for iv, tag, data. */
export function decrypt(encrypted: string, ivHex: string, tagHex: string): string {
  const { key } = getOrCreateKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(encrypted, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/** Store a secret encrypted under the given key name */
export function storeSecret(keyName: string, value: string): void {
  if (!keyName || typeof keyName !== 'string') {
    throw new Error('Secret key name is required');
  }
  if (typeof value !== 'string') {
    throw new Error('Secret value must be a string');
  }

  const secrets = loadSecrets();
  const encrypted = encrypt(value);
  secrets[keyName] = encrypted;
  saveSecrets(secrets);

  logger.info('-', `Secret stored: ${keyName}`);
}

/** Retrieve and decrypt a secret by key name. Returns null if not found. */
export function getSecret(keyName: string): string | null {
  const secrets = loadSecrets();
  const entry = secrets[keyName];
  if (!entry) return null;

  try {
    return decrypt(entry.data, entry.iv, entry.tag);
  } catch (err: any) {
    logger.error('-', `Failed to decrypt secret '${keyName}': ${err.message}`);
    return null;
  }
}

/** List all stored secret key names (no values) */
export function listSecretKeys(): string[] {
  const secrets = loadSecrets();
  return Object.keys(secrets);
}

/** Delete a secret by key name. Returns true if it existed. */
export function deleteSecret(keyName: string): boolean {
  const secrets = loadSecrets();
  if (!(keyName in secrets)) return false;

  delete secrets[keyName];
  saveSecrets(secrets);

  logger.info('-', `Secret deleted: ${keyName}`);
  return true;
}
