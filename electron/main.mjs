import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import net from 'net';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLogPath() {
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    return path.join(userDataPath, 'app.log');
  } catch (e) {
    return path.join(process.cwd(), 'app.log');
  }
}

function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    const logPath = getLogPath();
    fs.appendFileSync(logPath, logMessage, 'utf8');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
  console.log(message);
}

// Global Exception Handlers
process.on('uncaughtException', (err) => {
  const errMsg = `Uncaught Exception: ${err.stack || err.message || err}`;
  logToFile(errMsg);
  try {
    dialog.showErrorBox('Fatal Error (Uncaught Exception)', errMsg);
  } catch (e) {}
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const errMsg = `Unhandled Rejection: ${reason instanceof Error ? reason.stack || reason.message : reason}`;
  logToFile(errMsg);
  try {
    dialog.showErrorBox('Fatal Error (Unhandled Rejection)', errMsg);
  } catch (e) {}
  app.exit(1);
});

logToFile('Application starting...');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logToFile('Second instance detected. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    logToFile('Second instance event received.');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    logToFile('Searching for available port...');
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      logToFile(`Found available port: ${port}`);
      srv.close(() => resolve(port));
    });
    srv.on('error', (err) => {
      logToFile(`Port search error: ${err.message}`);
      reject(err);
    });
  });
}

async function startServer(port) {
  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'asisten_belajar.db');
    const envConfigPath = path.join(userDataPath, '.env');

    process.env.PORT = port;
    process.env.HOST = '127.0.0.1';
    process.env.DB_PATH = dbPath;
    process.env.DOTENV_CONFIG_PATH = envConfigPath;

    logToFile('Importing server/index.js dynamically...');
    const serverPath = path.join(__dirname, '../server/index.js');
    const serverUrl = pathToFileURL(serverPath).href;
    logToFile(`Server URL: ${serverUrl}`);
    
    await import(serverUrl);
    logToFile(`Express server started successfully on port ${port}`);
  } catch (err) {
    const errDetails = `Failed to start Express server: ${err.stack || err.message || err}`;
    logToFile(errDetails);
    dialog.showErrorBox(
      'Gagal Memulai Server',
      `Gagal memuat server backend:\n${err.message}\n\nStack:\n${err.stack || ''}`
    );
    throw err;
  }
}

async function createWindow() {
  logToFile('Creating BrowserWindow...');
  const preloadPath = path.join(__dirname, 'preload.cjs');
  logToFile(`Preload path: ${preloadPath}`);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    },
    autoHideMenuBar: true
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logToFile(`WebContents did-fail-load: ${errorCode} - ${errorDescription} (${validatedURL})`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logToFile(`Render process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  app.on('child-process-gone', (event, details) => {
    logToFile(`Child process gone: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}, name=${details.name}`);
  });

  try {
    const port = await getAvailablePort();
    process.env.VITE_API_BASE = `http://127.0.0.1:${port}`;

    await startServer(port);

    logToFile('Waiting for server readiness...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const targetUrl = `http://127.0.0.1:${port}`;
    logToFile(`Loading URL: ${targetUrl}`);
    await mainWindow.loadURL(targetUrl);
    logToFile('MainWindow loaded URL successfully.');
  } catch (err) {
    const errMsg = `Initialization error in createWindow: ${err.stack || err.message || err}`;
    logToFile(errMsg);
    dialog.showErrorBox(
      'Gagal Memulai Aplikasi',
      `Terjadi kesalahan saat memulai server lokal atau jendela:\n${err.message}`
    );
    app.quit();
  }

  mainWindow.on('closed', () => {
    logToFile('MainWindow closed.');
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  logToFile('App ready event fired.');
  createWindow();
});

app.on('window-all-closed', () => {
  logToFile('All windows closed.');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
