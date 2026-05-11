import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const STORAGE_ROOT = path.resolve(process.env.APP_STORAGE_DIR || path.join(PROJECT_ROOT, 'storage'));
export const DATA_DIR = path.join(STORAGE_ROOT, 'data');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const LOG_DIR = path.join(STORAGE_ROOT, 'logs');
export const LEGACY_UPLOADS_DIR = path.join(PROJECT_ROOT, 'server', 'uploads');

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function storagePath(...parts: string[]) {
  return path.join(STORAGE_ROOT, ...parts);
}
