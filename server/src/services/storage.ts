import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const STORAGE_CONFIG_PATH = path.join(PROJECT_ROOT, 'storage.config.json');
const DEFAULT_STORAGE_ROOT = path.join(PROJECT_ROOT, 'storage');

interface StorageConfig {
  storageRoot?: string;
}

function readStorageConfig(): StorageConfig {
  if (!fs.existsSync(STORAGE_CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORAGE_CONFIG_PATH, 'utf8')) as StorageConfig;
  } catch {
    return {};
  }
}

function configuredStorageRoot() {
  const config = readStorageConfig();
  return config.storageRoot?.trim() || '';
}

function resolveStorageRoot() {
  return path.resolve(process.env.APP_STORAGE_DIR || configuredStorageRoot() || DEFAULT_STORAGE_ROOT);
}

export const STORAGE_ROOT = resolveStorageRoot();
export const DATA_DIR = path.join(STORAGE_ROOT, 'data');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const LOG_DIR = path.join(STORAGE_ROOT, 'logs');
export const LEGACY_UPLOADS_DIR = path.join(PROJECT_ROOT, 'server', 'uploads');
export const STORAGE_CONFIG_SOURCE = process.env.APP_STORAGE_DIR
  ? 'env'
  : configuredStorageRoot()
    ? 'config'
    : 'default';

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function storagePath(...parts: string[]) {
  return path.join(STORAGE_ROOT, ...parts);
}

export function getStorageSettings() {
  const configuredRoot = configuredStorageRoot();
  const source = process.env.APP_STORAGE_DIR
    ? 'env'
    : configuredRoot
      ? 'config'
      : 'default';
  return {
    currentRoot: STORAGE_ROOT,
    configuredRoot: configuredRoot ? path.resolve(configuredRoot) : '',
    defaultRoot: path.resolve(DEFAULT_STORAGE_ROOT),
    source,
    envLocked: !!process.env.APP_STORAGE_DIR,
    configPath: STORAGE_CONFIG_PATH,
  };
}

export function saveStorageSettings(storageRoot: string) {
  if (process.env.APP_STORAGE_DIR) {
    throw new Error('APP_STORAGE_DIR 환경변수가 설정되어 있어 화면에서 저장 경로를 변경할 수 없습니다.');
  }

  const trimmed = storageRoot.trim();
  if (!trimmed || path.resolve(trimmed) === path.resolve(DEFAULT_STORAGE_ROOT)) {
    if (fs.existsSync(STORAGE_CONFIG_PATH)) fs.unlinkSync(STORAGE_CONFIG_PATH);
    return getStorageSettings();
  }

  const resolved = path.resolve(trimmed);
  fs.writeFileSync(STORAGE_CONFIG_PATH, `${JSON.stringify({ storageRoot: resolved }, null, 2)}\n`, 'utf8');
  return getStorageSettings();
}
