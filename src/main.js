const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const pty = require('node-pty');
const { pathToFileURL } = require('url');

const HOME = os.homedir();
const ROOTS = {
  org: path.join(HOME, 'org'),
  hopkins: path.join(HOME, 'Documents', 'hopkins'),
  documents: path.join(HOME, 'Documents'),
  desktop_inbox: path.join(HOME, 'Desktop', 'inbox')
};

const TEXT_EXTS = new Set([
  '.org','.md','.txt','.py','.r','.tex','.bib','.el','.sh','.bash','.zsh',
  '.json','.yaml','.yml','.toml','.csv','.tsv','.html','.css','.js','.m',
  '.c','.h','.cpp','.hpp','.rs','.java','.sql'
]);

const NOTE_CATEGORIES = new Set([
  'logs','meetings','lab_notebook','reference','personal','household','teaching','archive'
]);
const CHRONO = new Set(['logs','meetings','lab_notebook']);

let mainWindow = null;
const terminals = new Map();
const watchers = [];

function ensureRoots() {
  for (const p of Object.values(ROOTS)) {
    try { fs.mkdirSync(p, { recursive: true }); } catch {}
  }
}

function isWithin(candidate, root) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function resolveVirtual(vpath) {
  if (typeof vpath !== 'string' || !vpath.includes(':/')) throw new Error('Invalid Workbench path');
  const idx = vpath.indexOf(':/');
  const rootName = vpath.slice(0, idx);
  const rel = vpath.slice(idx + 2);
  const root = ROOTS[rootName];
  if (!root) throw new Error(`Unknown root: ${rootName}`);
  const candidate = path.resolve(root, rel);
  if (!isWithin(candidate, root)) throw new Error('Path escapes allowed root');
  return candidate;
}

function virtualize(absPath) {
  const resolved = path.resolve(absPath);
  for (const [name, root] of Object.entries(ROOTS)) {
    if (isWithin(resolved, root)) {
      const rel = path.relative(root, resolved).split(path.sep).join('/');
      return `${name}:/${rel}`;
    }
  }
  return null;
}

async function statSafe(p) {
  try { return await fsp.stat(p); } catch { return null; }
}

async function hashFile(p) {
  const data = await fsp.readFile(p);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'“”"`]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'note';
}

function quoteShell(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function findExecutable(names) {
  const extra = ['/Library/TeX/texbin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  for (const n of names) {
    if (path.isAbsolute(n) && fs.existsSync(n)) return n;
    for (const dir of extra) {
      const c = path.join(dir, n);
      if (fs.existsSync(c)) return c;
    }
  }
  return names[0];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#f6f8fa',
    title: 'Norcini Workbench',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.maximize();

  mainWindow.on('closed', () => {
    for (const term of terminals.values()) {
      try { term.kill(); } catch {}
    }
    terminals.clear();
  });
}

function startWatchers() {
  for (const [rootName, rootPath] of Object.entries(ROOTS)) {
    try {
      const watcher = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('fs:changed', {
          root: rootName,
          eventType,
          filename: filename ? String(filename) : ''
        });
      });
      watchers.push(watcher);
    } catch {}
  }
}

app.whenReady().then(() => {
  ensureRoots();
  createWindow();
  startWatchers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const w of watchers) { try { w.close(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('roots', async () =>
  Object.entries(ROOTS).map(([name, abs]) => ({ name, abs }))
);

ipcMain.handle('list-dir', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  const st = await fsp.stat(abs);
  if (!st.isDirectory()) throw new Error('Not a directory');
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  const items = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(abs, e.name);
    const virt = virtualize(p);
    if (!virt) continue;
    items.push({
      name: e.name,
      path: virt,
      type: e.isDirectory() ? 'dir' : 'file'
    });
  }
  items.sort((a,b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return { path: vpath, items };
});

ipcMain.handle('read-file', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  const st = await fsp.stat(abs);
  if (!st.isFile()) throw new Error('Not a file');
  const ext = path.extname(abs).toLowerCase();
  const binary = !TEXT_EXTS.has(ext) && ext !== '.ipynb';
  const content = binary ? '' : await fsp.readFile(abs, 'utf8');
  return {
    path: vpath,
    abs,
    ext,
    binary,
    content,
    sha256: await hashFile(abs),
    mtimeMs: st.mtimeMs,
    fileUrl: pathToFileURL(abs).href
  };
});

ipcMain.handle('save-file', async (_event, { path: vpath, content, expectedHash }) => {
  const abs = resolveVirtual(vpath);
  const st = await statSafe(abs);
  if (st && expectedHash) {
    const currentHash = await hashFile(abs);
    if (currentHash !== expectedHash) {
      return { ok: false, conflict: true, currentHash };
    }
  }
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, content, 'utf8');
  const newStat = await fsp.stat(abs);
  return { ok: true, sha256: await hashFile(abs), mtimeMs: newStat.mtimeMs };
});

ipcMain.handle('file-info', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  const st = await fsp.stat(abs);
  const ext = path.extname(abs).toLowerCase();
  let siblingPdf = null;
  if (ext === '.tex') {
    const pdf = abs.slice(0, -4) + '.pdf';
    if (fs.existsSync(pdf)) siblingPdf = pathToFileURL(pdf).href;
  }
  return {
    abs,
    ext,
    isDir: st.isDirectory(),
    fileUrl: pathToFileURL(abs).href,
    siblingPdf
  };
});

ipcMain.handle('rename', async (_event, { path: vpath, name }) => {
  const abs = resolveVirtual(vpath);
  const clean = String(name || '').trim();
  if (!clean || clean.includes('/') || clean === '.' || clean === '..') throw new Error('Invalid name');
  const dest = path.join(path.dirname(abs), clean);
  if (!virtualize(dest)) throw new Error('Destination outside Workbench roots');
  await fsp.rename(abs, dest);
  return { ok: true, path: virtualize(dest) };
});

ipcMain.handle('trash', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  await shell.trashItem(abs);
  return { ok: true };
});

ipcMain.handle('new-folder', async (_event, { parent, name }) => {
  const parentAbs = resolveVirtual(parent);
  const clean = String(name || '').trim();
  if (!clean || clean.includes('/')) throw new Error('Invalid folder name');
  const dest = path.join(parentAbs, clean);
  await fsp.mkdir(dest, { recursive: false });
  return { ok: true, path: virtualize(dest) };
});

ipcMain.handle('move', async (_event, { path: vpath, destinationDir }) => {
  const abs = resolveVirtual(vpath);
  const destDir = resolveVirtual(destinationDir);
  const dest = path.join(destDir, path.basename(abs));
  await fsp.rename(abs, dest);
  return { ok: true, path: virtualize(dest) };
});

ipcMain.handle('reveal', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  shell.showItemInFolder(abs);
  return { ok: true };
});

ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('open-default', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  const error = await shell.openPath(abs);
  if (error) throw new Error(error);
  return { ok: true };
});

ipcMain.handle('new-note', async (_event, { category, title, dated, date }) => {
  if (!NOTE_CATEGORIES.has(category)) throw new Error('Unknown category');
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new Error('Title is required');

  const dt = date ? new Date(`${date}T12:00:00`) : new Date();
  const yyyy = String(dt.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');

  let dir = path.join(ROOTS.org, 'library', category);
  if (dated && CHRONO.has(category)) dir = path.join(dir, yyyy);
  await fsp.mkdir(dir, { recursive: true });

  const prefix = dated ? `${yy}${mm}${dd}_` : '';
  const base = `${prefix}${slugify(cleanTitle)}`;
  let candidate = path.join(dir, `${base}.org`);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}_${i}.org`);
    i += 1;
  }
  let content = `#+TITLE: ${cleanTitle}\n`;
  if (dated) content += `#+DATE: ${yyyy}-${mm}-${dd}\n`;
  content += '\n';
  await fsp.writeFile(candidate, content, 'utf8');
  return { ok: true, path: virtualize(candidate) };
});

ipcMain.handle('toggle-org-line', async (_event, { path: vpath, lineIndex, kind }) => {
  const abs = resolveVirtual(vpath);
  const text = await fsp.readFile(abs, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) throw new Error('Line changed; refresh first');

  let line = lines[lineIndex];
  if (kind === 'todo') {
    if (/^(\*+\s+)TODO(\s+)/.test(line)) line = line.replace(/^(\*+\s+)TODO(\s+)/, '$1DONE$2');
    else if (/^(\*+\s+)DONE(\s+)/.test(line)) line = line.replace(/^(\*+\s+)DONE(\s+)/, '$1TODO$2');
    else throw new Error('Task line changed; refresh first');
  } else if (kind === 'checkbox') {
    if (/\[ \]/.test(line)) line = line.replace('[ ]', '[X]');
    else if (/\[[Xx]\]/.test(line)) line = line.replace(/\[[Xx]\]/, '[ ]');
    else throw new Error('Checkbox line changed; refresh first');
  } else {
    throw new Error('Unknown toggle type');
  }

  lines[lineIndex] = line;
  await fsp.writeFile(abs, lines.join('\n'), 'utf8');
  return { ok: true, content: lines.join('\n'), sha256: await hashFile(abs) };
});


ipcMain.handle('resolve-org-link', async (_event, { currentPath, target }) => {
  const currentAbs = resolveVirtual(currentPath);
  let raw = String(target || '');
  try { raw = decodeURIComponent(raw); } catch {}

  let abs;
  if (raw.startsWith('~/')) {
    abs = path.join(HOME, raw.slice(2));
  } else if (path.isAbsolute(raw)) {
    abs = raw;
  } else {
    abs = path.resolve(path.dirname(currentAbs), raw);
  }

  const virt = virtualize(abs);
  if (!virt) throw new Error('Linked file is outside Workbench roots');
  const st = await fsp.stat(abs);
  return { path: virt, type: st.isDirectory() ? 'dir' : 'file' };
});

ipcMain.handle('build-command', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  const ext = path.extname(abs).toLowerCase();
  const dir = path.dirname(abs);
  const name = path.basename(abs);

  if (ext === '.tex') {
    const latexmk = findExecutable(['latexmk']);
    const pdflatex = findExecutable(['pdflatex']);
    const exe = fs.existsSync(latexmk) ? latexmk : pdflatex;
    if (!fs.existsSync(exe)) throw new Error('No latexmk or pdflatex found');
    if (path.basename(exe) === 'latexmk') {
      return `cd ${quoteShell(dir)} && ${quoteShell(exe)} -pdf -interaction=nonstopmode -file-line-error ${quoteShell(name)}`;
    }
    return `cd ${quoteShell(dir)} && ${quoteShell(exe)} -interaction=nonstopmode -file-line-error ${quoteShell(name)}`;
  }

  if (ext === '.py') {
    const python = findExecutable(['python3']);
    return `cd ${quoteShell(dir)} && ${quoteShell(python)} ${quoteShell(name)}`;
  }

  if (ext === '.r') {
    const rscript = findExecutable(['Rscript']);
    return `cd ${quoteShell(dir)} && ${quoteShell(rscript)} ${quoteShell(name)}`;
  }

  if (['.sh','.bash','.zsh'].includes(ext)) {
    return `cd ${quoteShell(dir)} && /bin/bash ${quoteShell(name)}`;
  }

  if (ext === '.ipynb') {
    const jupyter = findExecutable(['jupyter']);
    return `cd ${quoteShell(dir)} && ${quoteShell(jupyter)} nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=180 ${quoteShell(name)}`;
  }

  throw new Error('No run/build action for this file type');
});


ipcMain.handle('terminal-ping', async () => {
  return {
    ok: true,
    node: process.version,
    electron: process.versions.electron,
    nodePtyLoaded: !!pty && typeof pty.spawn === 'function',
    bashExists: fs.existsSync('/bin/bash')
  };
});

ipcMain.handle('terminal-create', async (event, { cwdVirtual, cols, rows }) => {
  try {
    const cwd = cwdVirtual ? resolveVirtual(cwdVirtual) : ROOTS.org;
    const id = crypto.randomUUID();
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      SHELL: '/bin/bash'
    };
    if (!pty || typeof pty.spawn !== 'function') {
      throw new Error('node-pty did not load correctly');
    }
    if (!fs.existsSync('/bin/bash')) {
      throw new Error('/bin/bash was not found');
    }
    const term = pty.spawn('/bin/bash', ['-l'], {
      name: 'xterm-256color',
      cols: cols || 100,
      rows: rows || 30,
      cwd: fs.existsSync(cwd) ? cwd : HOME,
      env
    });
    terminals.set(id, term);
    term.onData(data => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-data', { id, data });
      }
    });
    term.onExit(({ exitCode, signal }) => {
      terminals.delete(id);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-exit', { id, exitCode, signal });
      }
    });
    // Probe the PTY immediately after spawn.
    setTimeout(() => {
      try {
        term.write("printf '\\n[PTY connected] '; pwd; printf '\\n'\r");
      } catch {}
    }, 150);
    return { id, cwd: fs.existsSync(cwd) ? cwd : HOME };
  } catch (err) {
    return { error: String(err && err.stack ? err.stack : err) };
  }
});

ipcMain.handle('terminal-write', async (_event, { id, data }) => {
  const term = terminals.get(id);
  if (!term) throw new Error('Terminal is not running');
  term.write(data);
  return { ok: true };
});

ipcMain.handle('terminal-resize', async (_event, { id, cols, rows }) => {
  const term = terminals.get(id);
  if (term) term.resize(Math.max(2, cols), Math.max(1, rows));
  return { ok: true };
});

ipcMain.handle('terminal-cwd', async (_event, { id, cwdVirtual }) => {
  const term = terminals.get(id);
  if (!term) throw new Error('Terminal is not running');
  const cwd = resolveVirtual(cwdVirtual);
  const target = fs.statSync(cwd).isDirectory() ? cwd : path.dirname(cwd);
  term.write(`cd ${quoteShell(target)}\r`);
  return { ok: true };
});