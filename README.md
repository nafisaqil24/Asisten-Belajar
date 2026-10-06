# Asisten Belajar - Mahasiswa (Lokal Windows & Desktop Electron)

Aplikasi Asisten Belajar lokal tanpa login untuk membantu mahasiswa mempelajari dan mengerjakan tugas untuk 4 mata kuliah:
1. Basis Data Terdistribusi
2. Manajemen Resiko dan Audit SI
3. Komunikasi Bisnis dan Teknis
4. Kewirausahaan TI

## Struktur Project
- `client/`: React + Vite (Frontend)
- `server/`: Express + SQLite + Gemini AI API (Backend)
- `electron/`: Electron Main Process (Desktop Wrapper)

## Prasyarat
- Node.js (v24 atau versi stabil terbaru)
- npm

## Cara Menjalankan & Build Aplikasi Desktop

1. **Instalasi Dependensi**:
   Jalankan perintah berikut di folder root (`asisten-belajar/`):
   ```bash
   npm install
   ```

2. **Menjalankan Mode Pengembangan Desktop (Electron dev)**:
   ```bash
   npm run desktop:dev
   ```

3. **Membuat Installer Desktop Windows (.exe)**:
   ```bash
   npm run desktop:dist
   ```
   Hasil installer akan berada di folder `dist-desktop/` (`Asisten Belajar Mahasiswa Setup 1.0.0.exe`).
   *Catatan Ikon*: Saat ini menggunakan ikon bawaan Electron. Untuk mengganti ikon, tambahkan properti `win.icon` di konfigurasi `build` pada `package.json` yang mengarah ke file `.ico`.

4. **Menjalankan dalam Mode Web (Dev Mode Tradisional)**:
   ```bash
   npm run dev
   ```
   Client berjalan di `http://localhost:5173` dan server di `http://localhost:3000`.
