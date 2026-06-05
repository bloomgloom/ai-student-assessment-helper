import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_STORAGE_ROOT = path.join(PROJECT_ROOT, 'storage');

function resolveStorageRoot() {
  return path.resolve(process.env.APP_STORAGE_DIR || DEFAULT_STORAGE_ROOT);
}

export const STORAGE_ROOT = resolveStorageRoot();
export const DATA_DIR = path.join(STORAGE_ROOT, 'data');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const LOG_DIR = path.join(STORAGE_ROOT, 'logs');
export const LEGACY_UPLOADS_DIR = path.join(PROJECT_ROOT, 'server', 'uploads');
export const STORAGE_CONFIG_SOURCE = process.env.APP_STORAGE_DIR ? 'env' : 'default';

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function storagePath(...parts: string[]) {
  return path.join(STORAGE_ROOT, ...parts);
}

export function toStoredPath(filepath: string): string {
  if (!filepath) return '';
  const absolutePath = path.resolve(filepath);
  const relativePath = path.relative(STORAGE_ROOT, absolutePath);
  if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) return relativePath;

  const marker = `${path.sep}uploads${path.sep}`;
  const markerIndex = absolutePath.indexOf(marker);
  if (markerIndex >= 0) {
    return path.join('uploads', absolutePath.slice(markerIndex + marker.length));
  }
  return filepath;
}

export function resolveStoredPath(filepath: string): string {
  if (!filepath) return '';
  if (!path.isAbsolute(filepath)) return path.join(STORAGE_ROOT, filepath);

  const marker = `${path.sep}uploads${path.sep}`;
  const markerIndex = path.resolve(filepath).indexOf(marker);
  if (markerIndex >= 0) {
    return path.join(UPLOADS_DIR, path.resolve(filepath).slice(markerIndex + marker.length));
  }
  return filepath;
}

export function getStorageSettings() {
  return {
    currentRoot: STORAGE_ROOT,
    defaultRoot: path.resolve(DEFAULT_STORAGE_ROOT),
    source: process.env.APP_STORAGE_DIR ? 'env' : 'default',
    envLocked: !!process.env.APP_STORAGE_DIR,
  };
}
