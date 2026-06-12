import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_STORAGE_ROOT = path.join(PROJECT_ROOT, '..', 'storage');

export const STORAGE_ROOT = path.resolve(process.env.APP_STORAGE_DIR || DEFAULT_STORAGE_ROOT);
export const DATA_DIR = path.join(STORAGE_ROOT, 'data');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const LOGS_DIR = path.join(STORAGE_ROOT, 'logs');
export const SUBMISSIONS_DIR = path.join(UPLOADS_DIR, 'submissions');
export const TEMP_DIR = path.join(UPLOADS_DIR, 'assignment-temp');

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function toStoredPath(filepath: string): string {
  if (!filepath) return '';
  const absolutePath = path.resolve(filepath);
  const relativePath = path.relative(STORAGE_ROOT, absolutePath);
  if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) return relativePath;
  return filepath;
}

export function resolveStoredPath(filepath: string): string {
  if (!filepath) return '';
  return path.isAbsolute(filepath) ? filepath : path.join(STORAGE_ROOT, filepath);
}

[DATA_DIR, LOGS_DIR, UPLOADS_DIR, SUBMISSIONS_DIR, TEMP_DIR].forEach(ensureDir);
