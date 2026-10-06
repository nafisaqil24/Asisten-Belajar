import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, 'asisten_belajar.db');
const db = new Database(dbPath);

// Mengaktifkan foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // 1. Tabel courses
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);

  // Tabel materi (Fase 1: Upload PDF dan Word)
  db.exec(`
    CREATE TABLE IF NOT EXISTS materi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mata_kuliah TEXT NOT NULL,
      jenis TEXT NOT NULL,
      nama_file TEXT NOT NULL,
      tipe_file TEXT NOT NULL,
      isi_teks TEXT NOT NULL,
      jumlah_karakter INTEGER NOT NULL,
      dibuat_pada DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Tabel documents
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  // 3. Tabel chunks
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  // 4. Tabel virtual FTS5 untuk pencarian chunks
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      content='chunks',
      content_rowid='id',
      tokenize='porter'
    );
  `);

  // Trigger agar chunks_fts otomatis sinkron dengan tabel chunks
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);

  // 5. Tabel chat_messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  // Seed otomatis 4 mata kuliah jika tabel courses masih kosong
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM courses');
  const { count } = countStmt.get();

  if (count === 0) {
    const seedCourses = [
      'Basis Data Terdistribusi',
      'Manajemen Resiko dan Audit SI',
      'Komunikasi Bisnis dan Teknis',
      'Kewirausahaan TI'
    ];

    const insertCourse = db.prepare('INSERT INTO courses (name) VALUES (?)');
    const insertMany = db.transaction((courses) => {
      for (const course of courses) {
        insertCourse.run(course);
      }
    });

    insertMany(seedCourses);
    console.log('✅ Seeding 4 mata kuliah berhasil dijalankan.');
  }
}

export default db;
