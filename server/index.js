import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { GoogleGenAI } from '@google/genai';
import db, { initDatabase } from './database.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Load dotenv dengan override dan path opsional dari process.env.DOTENV_CONFIG_PATH
if (process.env.DOTENV_CONFIG_PATH) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH, override: true });
} else {
  dotenv.config({ override: true });
}

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// CORS setup yang mendukung dev dan Electron
app.use(cors({
  origin: (origin, callback) => {
    // Izinkan jika tidak ada origin (misal mobile/electron file:// atau curl)
    if (!origin) return callback(null, true);
    // Izinkan localhost dev ports dan file:// atau electron origin
    if (
      origin.startsWith('http://localhost:') || 
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('file://') ||
      origin.startsWith('devtools://')
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Inisialisasi Database SQLite & Seeding
initDatabase();

// Inisialisasi Google GenAI Client secara helper agar bisa reload saat key diupdate
let primaryModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
let fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

function getAIClient() {
  const currentKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey: currentKey });
}

// Endpoint Config API Key & Status
app.get('/api/config', (req, res) => {
  const key = process.env.GEMINI_API_KEY || '';
  const configured = key.trim() !== '' && key !== 'your_gemini_api_key_here';
  res.json({ configured });
});

app.post('/api/config', (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return res.status(400).json({ error: 'API Key tidak valid.' });
    }

    const trimmedKey = apiKey.trim();
    if (trimmedKey.length < 10) {
      return res.status(400).json({ error: 'API Key terlalu pendek.' });
    }

    // Tentukan path .env tujuan (di Electron env.DOTENV_CONFIG_PATH atau server/.env)
    const envPath = process.env.DOTENV_CONFIG_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
    
    // Pastikan direktori ada
    const dir = path.dirname(envPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Baca atau buat file .env
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (envContent.includes('GEMINI_API_KEY=')) {
      envContent = envContent.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${trimmedKey}`);
    } else {
      envContent += `\nGEMINI_API_KEY=${trimmedKey}\n`;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');

    // Reload dotenv di runtime
    dotenv.config({ path: envPath, override: true });

    res.json({ success: true, message: 'API Key berhasil disimpan.' });
  } catch (error) {
    console.error('Save Config Error:', error);
    res.status(500).json({ error: 'Gagal menyimpan konfigurasi.' });
  }
});

// Konfigurasi Multer untuk Upload Materi (Memory Storage, Max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    // Perbaikan encoding nama file latin1 ke utf-8 jika diperlukan
    if (file.originalname) {
      try {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch (e) {
        // fallback
      }
    }
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const ext = file.originalname.toLowerCase();
    if (allowedMimeTypes.includes(file.mimetype) || ext.endsWith('.pdf') || ext.endsWith('.docx')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file .pdf dan .docx yang diizinkan!'));
    }
  }
});

// Endpoint Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint Get Courses
app.get('/api/courses', (req, res) => {
  try {
    const courses = db.prepare('SELECT * FROM courses ORDER BY id ASC').all();
    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Gagal mengambil daftar mata kuliah' });
  }
});

// --- API MATERI & TUGAS (FASE 1) ---

const VALID_COURSES = [
  'Basis Data Terdistribusi',
  'Manajemen Resiko dan Audit SI',
  'Komunikasi Bisnis dan Teknis',
  'Kewirausahaan TI'
];

// Endpoint POST /api/materi/upload
app.post('/api/materi/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Ukuran file terlalu besar. Maksimal 10 MB.' });
      }
      return res.status(400).json({ error: err.message || 'Gagal mengunggah file.' });
    }

    try {
      const { mata_kuliah, jenis } = req.body;
      const file = req.file;

      if (!mata_kuliah || !VALID_COURSES.includes(mata_kuliah)) {
        return res.status(400).json({ error: 'Mata kuliah tidak valid.' });
      }

      if (!jenis || !['materi', 'tugas'].includes(jenis)) {
        return res.status(400).json({ error: 'Jenis harus "materi" atau "tugas".' });
      }

      if (!file) {
        return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
      }

      let extractedText = '';
      const originalNameLower = file.originalname.toLowerCase();

      if (originalNameLower.endsWith('.pdf') || file.mimetype === 'application/pdf') {
        try {
          const pdfData = await pdfParse(file.buffer);
          extractedText = pdfData.text || '';
        } catch (pdfErr) {
          console.error('PDF Parse Error:', pdfErr);
          return res.status(400).json({ error: 'Gagal membaca file PDF. Pastikan file tidak korup.' });
        }
      } else if (originalNameLower.endsWith('.docx') || file.mimetype.includes('wordprocessingml')) {
        try {
          const docxResult = await mammoth.extractRawText({ buffer: file.buffer });
          extractedText = docxResult.value || '';
        } catch (docxErr) {
          console.error('DOCX Parse Error:', docxErr);
          return res.status(400).json({ error: 'Gagal membaca file Word (.docx). Pastikan file tidak korup.' });
        }
      } else {
        return res.status(400).json({ error: 'Format file tidak didukung. Hanya .pdf dan .docx.' });
      }

      const trimmedText = extractedText.trim();
      if (trimmedText.length === 0) {
        return res.status(400).json({ error: 'File ini kayaknya hasil scan/gambar, teksnya nggak bisa dibaca.' });
      }

      const charCount = trimmedText.length;
      const insertStmt = db.prepare(`
        INSERT INTO materi (mata_kuliah, jenis, nama_file, tipe_file, isi_teks, jumlah_karakter)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = insertStmt.run(
        mata_kuliah,
        jenis,
        file.originalname,
        file.mimetype || 'application/octet-stream',
        trimmedText,
        charCount
      );

      res.status(201).json({
        success: true,
        id: result.lastInsertRowid,
        nama_file: file.originalname,
        jenis: jenis,
        jumlah_karakter: charCount
      });

    } catch (error) {
      console.error('Upload Materi Error:', error);
      res.status(500).json({ error: 'Terjadi kesalahan internal pada server saat memproses file.' });
    }
  });
});

// Endpoint GET /api/materi?mata_kuliah=... (WAJIB mengecualikan isi_teks)
app.get('/api/materi', (req, res) => {
  try {
    const { mata_kuliah } = req.query;
    if (!mata_kuliah) {
      return res.status(400).json({ error: 'Parameter mata_kuliah diperlukan.' });
    }

    const stmt = db.prepare(`
      SELECT id, mata_kuliah, jenis, nama_file, tipe_file, jumlah_karakter, dibuat_pada
      FROM materi
      WHERE mata_kuliah = ?
      ORDER BY id DESC
    `);
    const materiList = stmt.all(mata_kuliah);
    res.json(materiList);
  } catch (error) {
    console.error('Get Materi Error:', error);
    res.status(500).json({ error: 'Gagal mengambil daftar materi.' });
  }
});

// Endpoint DELETE /api/materi/:id (Balikin 404 kalau id nggak ada)
app.delete('/api/materi/:id', (req, res) => {
  try {
    const { id } = req.params;
    const checkStmt = db.prepare('SELECT id FROM materi WHERE id = ?');
    const existing = checkStmt.get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Materi tidak ditemukan.' });
    }

    const deleteStmt = db.prepare('DELETE FROM materi WHERE id = ?');
    deleteStmt.run(id);

    res.json({ success: true, message: 'Materi berhasil dihapus.' });
  } catch (error) {
    console.error('Delete Materi Error:', error);
    res.status(500).json({ error: 'Gagal menghapus materi.' });
  }
});

// Endpoint GET Riwayat Chat per Mata Kuliah
app.get('/api/chat', (req, res) => {
  try {
    const { mata_kuliah } = req.query;
    if (!mata_kuliah) {
      return res.status(400).json({ error: 'Parameter mata_kuliah diperlukan.' });
    }

    // Cari course_id berdasarkan nama mata kuliah
    const courseStmt = db.prepare('SELECT id FROM courses WHERE name = ?');
    const course = courseStmt.get(mata_kuliah);

    if (!course) {
      return res.json([]);
    }

    const messagesStmt = db.prepare(`
      SELECT id, role, content, created_at 
      FROM chat_messages 
      WHERE course_id = ? 
      ORDER BY id ASC
    `);
    const messages = messagesStmt.all(course.id);
    res.json(messages);
  } catch (error) {
    console.error('Get Chat Error:', error);
    res.status(500).json({ error: 'Gagal mengambil riwayat chat.' });
  }
});

// Endpoint POST Kirim Pesan Live Chat
app.post('/api/chat', async (req, res) => {
  try {
    const { mata_kuliah, message } = req.body;

    if (!mata_kuliah || !message || message.trim() === '') {
      return res.status(400).json({ error: 'Mata kuliah dan pesan tidak boleh kosong.' });
    }

    const currentApiKey = process.env.GEMINI_API_KEY || '';
    if (!currentApiKey || currentApiKey.trim() === '' || currentApiKey === 'your_gemini_api_key_here') {
      return res.status(400).json({ error: 'API Key belum dikonfigurasi. Harap isi GEMINI_API_KEY melalui menu pengaturan aplikasi.' });
    }
    const ai = getAIClient();

    // Ambil atau buat course_id
    let courseStmt = db.prepare('SELECT id FROM courses WHERE name = ?');
    let course = courseStmt.get(mata_kuliah);

    if (!course) {
      const insertCourse = db.prepare('INSERT INTO courses (name) VALUES (?)');
      const info = insertCourse.run(mata_kuliah);
      course = { id: info.lastInsertRowid };
    }

    // 1. Simpan pesan user ke database
    const insertMsg = db.prepare('INSERT INTO chat_messages (course_id, mode, role, content) VALUES (?, ?, ?, ?)');
    insertMsg.run(course.id, 'standard', 'user', message);

    // 2. Ambil konteks materi & tugas yang sudah diupload untuk mata kuliah ini
    let contextText = '';
    try {
      const materiRows = db.prepare('SELECT nama_file, jenis, isi_teks FROM materi WHERE mata_kuliah = ?').all(mata_kuliah);
      if (materiRows.length > 0) {
        contextText = '\n\n--- DOKUMEN & MATERI KULIAH TERKAIT ---\n' + 
          materiRows.map(m => `[${m.jenis.toUpperCase()}: ${m.nama_file}]\n${m.isi_teks}`).join('\n\n') +
          '\n------------------------------------------\n';
      }
    } catch (dbErr) {
      console.warn('Gagal memuat konteks materi:', dbErr.message);
    }

    // 3. Ambil riwayat chat sebelumnya untuk mempertahankan percakapan
    const historyStmt = db.prepare('SELECT role, content FROM chat_messages WHERE course_id = ? ORDER BY id ASC');
    const historyRows = historyStmt.all(course.id);

    // Format percakapan untuk Gemini
    let fullPrompt = contextText ? `${contextText}\nInstruksi: Bertindaklah sebagai Asisten Belajar AI yang ramah, membantu mahasiswa mendalami materi perkuliahan di atas.\n\n` : '';
    
    for (const h of historyRows) {
      const speaker = h.role === 'user' ? 'Mahasiswa' : 'Asisten';
      fullPrompt += `${speaker}: ${h.content}\n`;
    }
    fullPrompt += 'Asisten:';

    let responseText = '';
    let usedModel = primaryModel;

    try {
      const response = await ai.models.generateContent({
        model: primaryModel,
        contents: fullPrompt,
      });
      responseText = response.text;
    } catch (primaryError) {
      console.warn(`Model utama ${primaryModel} gagal. Mencoba fallback ke ${fallbackModel}...`, primaryError.message);
      usedModel = fallbackModel;
      const fallbackResponse = await ai.models.generateContent({
        model: fallbackModel,
        contents: fullPrompt,
      });
      responseText = fallbackResponse.text;
    }

    // 4. Simpan balasan AI ke database
    insertMsg.run(course.id, 'standard', 'model', responseText);

    res.json({
      success: true,
      modelUsed: usedModel,
      reply: responseText,
      contextIncluded: contextText.length > 0
    });

  } catch (error) {
    console.error('Live Chat Error:', error);
    let errorMessage = error.message || 'Terjadi kesalahan saat memproses chat.';
    if (error.status === 429 || errorMessage.includes('429')) {
      errorMessage = 'Rate limit terlampaui (429) pada model AI.';
    } else if (error.status === 404 || errorMessage.includes('404')) {
      errorMessage = 'Model AI tidak ditemukan (404). Periksa konfigurasi nama model di .env.';
    }
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// Endpoint DELETE Bersihkan Riwayat Chat
app.delete('/api/chat', (req, res) => {
  try {
    const { mata_kuliah } = req.query;
    if (!mata_kuliah) {
      return res.status(400).json({ error: 'Parameter mata_kuliah diperlukan.' });
    }

    const courseStmt = db.prepare('SELECT id FROM courses WHERE name = ?');
    const course = courseStmt.get(mata_kuliah);

    if (course) {
      const deleteStmt = db.prepare('DELETE FROM chat_messages WHERE course_id = ?');
      deleteStmt.run(course.id);
    }

    res.json({ success: true, message: 'Riwayat chat berhasil dibersihkan.' });
  } catch (error) {
    console.error('Clear Chat Error:', error);
    res.status(500).json({ error: 'Gagal membersihkan riwayat chat.' });
  }
});

// Endpoint POST /api/ai/test
app.post('/api/ai/test', async (req, res) => {
  const { prompt, mata_kuliah } = req.body;

    const currentApiKey = process.env.GEMINI_API_KEY || '';
    if (!currentApiKey || currentApiKey.trim() === '' || currentApiKey === 'your_gemini_api_key_here') {
      return res.status(400).json({ 
        error: 'API Key belum dikonfigurasi. Harap isi GEMINI_API_KEY melalui menu pengaturan aplikasi.' 
      });
    }
    const ai = getAIClient();

  let contextText = '';
  if (mata_kuliah) {
    try {
      const materiRows = db.prepare('SELECT nama_file, jenis, isi_teks FROM materi WHERE mata_kuliah = ?').all(mata_kuliah);
      if (materiRows.length > 0) {
        contextText = '\n\n--- DOKUMEN & MATERI KULIAH TERKAIT ---\n' + 
          materiRows.map(m => `[${m.jenis.toUpperCase()}: ${m.nama_file}]\n${m.isi_teks}`).join('\n\n') +
          '\n------------------------------------------\n';
      }
    } catch (dbErr) {
      console.warn('Gagal memuat konteks materi:', dbErr.message);
    }
  }

  const testPrompt = prompt || 'Halo, berikan sapaan singkat dan konfirmasi bahwa koneksi Asisten Belajar berfungsi!';
  const fullPrompt = contextText ? `${contextText}\nPertanyaan/Instruksi Mahasiswa: ${testPrompt}` : testPrompt;

  try {
    let responseText = '';
    let usedModel = primaryModel;

    try {
      console.log(`Mencoba memanggil model utama: ${primaryModel}`);
      const response = await ai.models.generateContent({
        model: primaryModel,
        contents: fullPrompt,
      });
      responseText = response.text;
    } catch (primaryError) {
      console.warn(`Model utama ${primaryModel} gagal/rate-limit. Mencoba fallback ke ${fallbackModel}...`, primaryError.message);
      
      usedModel = fallbackModel;
      const fallbackResponse = await ai.models.generateContent({
        model: fallbackModel,
        contents: fullPrompt,
      });
      responseText = fallbackResponse.text;
    }

    res.json({
      success: true,
      modelUsed: usedModel,
      response: responseText,
      contextIncluded: contextText.length > 0
    });

  } catch (error) {
    console.error('AI Test Error:', error);
    let errorMessage = error.message || 'Terjadi kesalahan saat memanggil Gemini API';
    if (error.status === 429 || errorMessage.includes('429')) {
      errorMessage = 'Rate limit terlampaui (429) pada model utama maupun fallback.';
    } else if (error.status === 404 || errorMessage.includes('404')) {
      errorMessage = 'Model AI tidak ditemukan (404). Periksa konfigurasi nama model di .env.';
    }
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// Serve static frontend build jika tersedia (untuk produksi / Electron)
const clientDistPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/(.*)/, (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, HOST || 'localhost', () => {
  console.log(`🚀 Server Asisten Belajar berjalan di http://${HOST || 'localhost'}:${PORT}`);
});
