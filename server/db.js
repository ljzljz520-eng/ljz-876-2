// 极简 JSON 文件数据库：零依赖，支持集合 / 自增 ID / 变更后落盘
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');
const DB_FILE = join(DATA_DIR, 'db.json');
export { DB_FILE };

const COLLECTIONS = [
  'users',          // {id, name, role: student|coach, username}
  'bankVersions',   // {id, code, name, releasedAt, active}
  'chapters',       // {id, code, name, order}
  'questions',      // {id, qcode, versionId, chapterId, type, stem, options[], answer[], analysis, law, tags[], active}
  'sessions',       // {id, userId, kind: chapter|wrong|mock, chapterId, versionId, total, createdAt, startedAt, finishedAt, score, passed}
  'answers',        // {id, sessionId, userId, qcode, versionId, chapterId, picked[], correct, snapshot{...}, answeredAt}
  'wrongBook',      // {id, userId, qcode, versionId, chapterId, lastSnapshot, lastAt, status: open|mastered, resolvedAt, source, openVersionId}
];

class DB {
  constructor() {
    this.data = {};
    this._nextId = 1;
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(DB_FILE)) {
      this.data = JSON.parse(readFileSync(DB_FILE, 'utf-8'));
      this._nextId = this.data._nextId || 1;
    } else {
      for (const c of COLLECTIONS) this.data[c] = [];
      this.data._nextId = 1;
    }
  }

  all(col) { return this.data[col]; }

  find(col, predicate) { return this.data[col].find(predicate); }

  filter(col, predicate) { return predicate ? this.data[col].filter(predicate) : this.data[col].slice(); }

  insert(col, row) {
    const id = this._nextId++;
    const record = { id, ...row };
    this.data[col].push(record);
    this.save();
    return record;
  }

  update(col, id, patch) {
    const row = this.find(col, (r) => r.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    this.save();
    return row;
  }

  // 批量操作后统一落盘（种子/统计重算场景）
  save() {
    this.data._nextId = this._nextId;
    writeFileSync(DB_FILE, JSON.stringify(this.data, null, 1));
  }
}

export const db = new DB();
