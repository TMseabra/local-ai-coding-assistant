// Electron shell: runs the local server in-process and shows it in a native
// window, so the assistant feels like a desktop app instead of "open your
// browser and type an address". Everything still runs on 127.0.0.1 only.
import { app, BrowserWindow, dialog, Menu, ipcMain } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconPath = path.join(__dirname, '..', 'public', 'icon.png');
const preloadPath = path.join(__dirname, 'preload.cjs');

// "Save code to a file" — the page asks for this over IPC; we show a native
// Save dialog (defaulting to the Desktop) and write the file ourselves, so
// the sandboxed page never gets direct filesystem access.
ipcMain.handle('save-file', async (_event, { suggestedName, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save code',
    defaultPath: path.join(app.getPath('desktop'), suggestedName || 'snippet.txt'),
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    await fsp.writeFile(filePath, content, 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// The folder the assistant reads project files from. Defaults to wherever the
// app was launched from; pass a path as the first CLI arg to open a different
// project (e.g. from a shortcut's "Target").
const projectRoot = process.argv[1] && !process.argv[1].startsWith('--')
  ? path.resolve(process.argv[1])
  : process.cwd();

let mainWindow;

async function createWindow() {
  let port;
  try {
    ({ port } = await startServer({ root: projectRoot, port: 0 }));
  } catch (err) {
    dialog.showErrorBox('Local AI Coding Assistant', `Could not start the local server:\n${err.message}`);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'Local AI Coding Assistant',
    backgroundColor: '#151518',
    autoHideMenuBar: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });

  Menu.setApplicationMenu(null);
  // Surface renderer/preload problems in this terminal instead of them being
  // silently swallowed inside the window.
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('[preload error]', preloadPath, error);
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`);
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
