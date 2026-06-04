import { createClient, type Client, type InValue } from '@libsql/client';
import path from 'path';
import { DATA_DIR, LEGACY_UPLOADS_DIR, UPLOADS_DIR, ensureDir } from './storage';

ensureDir(DATA_DIR);

const DB_PATH = path.join(DATA_DIR, 'assessment.db');

let client: Client | null = null;
let initialized = false;

export function getClient(): Client {
  if (!client) {
    client = createClient({ url: `file:${DB_PATH}` });
  }
  return client;
}

export function closeDb(): void {
  client?.close();
  client = null;
  initialized = false;
}

// 동기 인터페이스를 흉내낸 헬퍼들을 위해 초기화는 서버 시작 시 한 번 수행
export async function initDb(): Promise<void> {
  if (initialized) return;
  const db = getClient();

  await db.execute('PRAGMA journal_mode = WAL');
  await db.execute('PRAGMA foreign_keys = ON');

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- (기존 기준관리 테이블은 레거시로 남겨두거나 향후 삭제)
    CREATE TABLE IF NOT EXISTS criteria_sets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT    DEFAULT '',
      mode        TEXT    NOT NULL CHECK(mode IN ('세특', '평가')),
      created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments_criteria (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id     INTEGER NOT NULL REFERENCES criteria_sets(id) ON DELETE CASCADE,
      type       TEXT    NOT NULL DEFAULT '항목',
      title      TEXT    NOT NULL DEFAULT '',
      prompt     TEXT    NOT NULL DEFAULT '',
      extensions TEXT    NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS eval_domains (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id        INTEGER NOT NULL REFERENCES criteria_sets(id) ON DELETE CASCADE,
      name          TEXT    NOT NULL,
      common_prompt TEXT    DEFAULT '',
      is_used       INTEGER NOT NULL DEFAULT 1,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS eval_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id  INTEGER NOT NULL REFERENCES eval_domains(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      excel_col  TEXT    NOT NULL DEFAULT '',
      item_type  TEXT    NOT NULL DEFAULT 'llm' CHECK(item_type IN ('llm', 'formula')),
      rubric     TEXT    NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- [신규] 커스텀 수행평가 영역 (세특용)
    CREATE TABLE IF NOT EXISTS custom_domains (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      year       INTEGER NOT NULL,
      semester   INTEGER NOT NULL,
      grade      INTEGER NOT NULL,
      subject    TEXT    NOT NULL,
      name       TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    );

    -- [신규] 도메인별 세특 기준
    CREATE TABLE IF NOT EXISTS domain_comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL,
      semester    INTEGER NOT NULL,
      grade       INTEGER NOT NULL,
      subject     TEXT    NOT NULL,
      domain_name TEXT    NOT NULL,
      type        TEXT    NOT NULL DEFAULT '항목',
      title       TEXT    NOT NULL DEFAULT '',
      prompt      TEXT    NOT NULL DEFAULT '',
      extensions  TEXT    NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    -- [신규] 도메인별 평가 기준
    CREATE TABLE IF NOT EXISTS domain_eval (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL,
      semester    INTEGER NOT NULL,
      grade       INTEGER NOT NULL,
      subject     TEXT    NOT NULL,
      domain_name TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      score       TEXT    NOT NULL DEFAULT '',
      item_type   TEXT    NOT NULL DEFAULT 'llm' CHECK(item_type IN ('llm', 'formula')),
      rubric      TEXT    NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS domain_ai_prompts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL,
      semester    INTEGER NOT NULL,
      grade       INTEGER NOT NULL,
      subject     TEXT    NOT NULL,
      domain_name TEXT    NOT NULL,
      prompt_key  TEXT    NOT NULL,
      prompt      TEXT    NOT NULL DEFAULT '',
      updated_at  TEXT    DEFAULT (datetime('now')),
      UNIQUE(year, semester, grade, subject, domain_name, prompt_key)
    );

    -- 수업 관리: 채점 파일 업로드 단위
    CREATE TABLE IF NOT EXISTS classes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      year       INTEGER NOT NULL,
      semester   INTEGER NOT NULL,
      grade      INTEGER NOT NULL,
      subject    TEXT    NOT NULL,
      room       TEXT    NOT NULL,
      filename   TEXT    NOT NULL DEFAULT '',
      scoring_filename TEXT NOT NULL DEFAULT '',
      scoring_filepath TEXT NOT NULL DEFAULT '',
      comments_filename TEXT NOT NULL DEFAULT '',
      comments_filepath TEXT NOT NULL DEFAULT '',
      created_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subject_domains (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL,
      semester    INTEGER NOT NULL,
      grade       INTEGER NOT NULL,
      subject     TEXT    NOT NULL,
      credit      REAL    NOT NULL DEFAULT 0,
      eval_type   TEXT    NOT NULL DEFAULT '',
      name        TEXT    NOT NULL,
      reflected   TEXT    NOT NULL DEFAULT '',
      ratio       REAL    NOT NULL DEFAULT 0,
      max_score   REAL    NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      source_filename TEXT NOT NULL DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS achievement_standards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL,
      semester    INTEGER NOT NULL,
      grade       INTEGER NOT NULL,
      subject     TEXT    NOT NULL,
      credit      REAL    NOT NULL DEFAULT 0,
      domain_name TEXT    NOT NULL DEFAULT '',
      code        TEXT    NOT NULL DEFAULT '',
      content     TEXT    NOT NULL DEFAULT '',
      level       TEXT    NOT NULL DEFAULT '',
      description TEXT    NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      source_filename TEXT NOT NULL DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- 수행평가 영역 (클래스별)
    CREATE TABLE IF NOT EXISTS assessment_domains (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      max_score  INTEGER NOT NULL DEFAULT 0,
      excel_col  TEXT    NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- 학생 명단 (클래스별)
    CREATE TABLE IF NOT EXISTS class_students (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_num INTEGER NOT NULL DEFAULT 0,
      name        TEXT    NOT NULL,
      excel_row   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id  INTEGER NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
      domain      TEXT    NOT NULL DEFAULT '',
      filename    TEXT    NOT NULL,
      filepath    TEXT    NOT NULL,
      mime_type   TEXT    NOT NULL DEFAULT '',
      uploaded_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generated_content (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id   INTEGER NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
      content_type TEXT    NOT NULL CHECK(content_type IN ('scoring', 'comments')),
      domain       TEXT    NOT NULL DEFAULT '',
      content      TEXT    NOT NULL DEFAULT '',
      updated_at   TEXT    DEFAULT (datetime('now')),
      UNIQUE(student_id, content_type, domain)
    );
  `);

  await ensureColumn('classes', 'scoring_filename', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('classes', 'scoring_filepath', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('classes', 'comments_filename', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('classes', 'comments_filepath', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('subject_domains', 'credit', "REAL NOT NULL DEFAULT 0");
  await ensureColumn('achievement_standards', 'credit', "REAL NOT NULL DEFAULT 0");
  await ensureColumn('class_students', 'personal_num', "TEXT NOT NULL DEFAULT ''");

  // domain_eval.excel_col → score 마이그레이션
  await ensureRenameColumn('domain_eval', 'excel_col', 'score');
  await migrateStoredUploadPaths();

  initialized = true;
}

async function migrateStoredUploadPaths(): Promise<void> {
  const legacy = LEGACY_UPLOADS_DIR;
  if (path.resolve(legacy) === path.resolve(UPLOADS_DIR)) return;

  const db = getClient();
  const pairs = [
    ['classes', 'scoring_filepath'],
    ['classes', 'comments_filepath'],
    ['artifacts', 'filepath'],
  ] as const;

  for (const [table, column] of pairs) {
    await db.execute({
      sql: `UPDATE ${table}
            SET ${column} = replace(${column}, ?, ?)
            WHERE ${column} LIKE ?`,
      args: [legacy, UPLOADS_DIR, `${legacy}%`],
    });
  }
}

async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  if (!(await columnExists(table, column))) {
    await getClient().execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await getClient().execute(`PRAGMA table_info(${table})`);
  return rows.rows.some((row) => {
    const obj = row as unknown as Record<string, unknown>;
    return obj.name === column || (Array.isArray(row) && row[1] === column);
  });
}

async function ensureRenameColumn(table: string, oldName: string, newName: string): Promise<void> {
  const rows = await getClient().execute(`PRAGMA table_info(${table})`);
  const hasOld = rows.rows.some((row) => {
    const obj = row as unknown as Record<string, unknown>;
    return obj.name === oldName || (Array.isArray(row) && row[1] === oldName);
  });
  if (hasOld) {
    await getClient().execute(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
  }
}

// 편의 함수: SELECT one
type QueryArgs = InValue[];

export async function queryOne<T>(sql: string, args: QueryArgs = []): Promise<T | null> {
  const rs = await getClient().execute({ sql, args });
  if (rs.rows.length === 0) return null;
  return rowToObject<T>(rs.rows[0], rs.columns);
}

// 편의 함수: SELECT many
export async function queryAll<T>(sql: string, args: QueryArgs = []): Promise<T[]> {
  const rs = await getClient().execute({ sql, args });
  return rs.rows.map((row) => rowToObject<T>(row, rs.columns));
}

// 편의 함수: INSERT / UPDATE / DELETE
export async function execute(sql: string, args: QueryArgs = []): Promise<{ lastInsertRowid: bigint | number; rowsAffected: number }> {
  const rs = await getClient().execute({ sql, args });
  return { lastInsertRowid: rs.lastInsertRowid ?? 0, rowsAffected: rs.rowsAffected };
}

// 트랜잭션
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = getClient();
  await db.execute('BEGIN');
  try {
    const result = await fn();
    await db.execute('COMMIT');
    return result;
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

function rowToObject<T>(row: Record<string, unknown>, columns: string[]): T {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = (row as unknown as unknown[])[i] ?? row[columns[i]];
  }
  return obj as T;
}
