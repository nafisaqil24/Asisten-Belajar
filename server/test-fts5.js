import Database from 'better-sqlite3';

try {
  console.log('Membuka database SQLite in-memory...');
  const db = new Database(':memory:');
  
  console.log('Membuat tabel virtual FTS5 (chunks_fts)...');
  db.exec(`
    CREATE VIRTUAL TABLE chunks_fts USING fts5(
      content,
      tokenize='porter'
    );
  `);
  console.log('Tabel virtual FTS5 berhasil dibuat.');

  console.log('Memasukkan data contoh ke dalam FTS5...');
  const insert = db.prepare('INSERT INTO chunks_fts (content) VALUES (?)');
  insert.run('Basis Data Terdistribusi menggunakan replikasi data dan fragmentasi untuk performa tinggi.');
  insert.run('Manajemen Resiko mencakup identifikasi, analisis, dan mitigasi resiko pada sistem informasi.');
  insert.run('Komunikasi Bisnis mengajarkan cara membuat laporan teknis dan presentasi yang efektif.');
  insert.run('Kewirausahaan TI memandu mahasiswa membangun startup teknologi dengan model bisnis valid.');

  console.log('Melakukan pencarian dengan MATCH...');
  const query = db.prepare("SELECT rowid, content FROM chunks_fts WHERE content MATCH ?");
  
  // Mencari kata "replikasi"
  const keyword = 'replikasi';
  const results = query.all(keyword);
  
  console.log(`\nHasil pencarian kata kunci "${keyword}":`);
  results.forEach(row => {
    console.log(`- [RowID: ${row.rowid}] ${row.content}`);
  });

  if (results.length > 0) {
    console.log('\n✅ VERIFIKASI FTS5 BERHASIL: Fitur FTS5 didukung sepenuhnya dan berjalan lancar!');
  } else {
    throw new Error('Pencarian tidak mengembalikan hasil yang diharapkan.');
  }
} catch (error) {
  console.error('\n❌ VERIFIKASI FTS5 GAGAL:', error.message);
  process.exit(1);
}
