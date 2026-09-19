const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const pty = require('node-pty');
const { pathToFileURL } = require('url');
const defaultHomeShortcuts = require('./config/home-shortcuts.json');

const HOME = os.homedir();
const ROOTS = {
  org: path.join(HOME, 'org'),
  hopkins: path.join(HOME, 'Documents', 'hopkins'),
  documents: path.join(HOME, 'Documents'),
  desktop_inbox: path.join(HOME, 'Desktop', 'inbox'),

  // Hidden catch-all root used when the integrated terminal
  // navigates somewhere outside the normal shortcut roots.
  local: path.parse(HOME).root
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

function homeShortcutsPath() {
  return path.join(app.getPath('userData'), 'home-shortcuts.json');
}

async function ensureHomeShortcuts() {
  const file = homeShortcutsPath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  try {
    await fsp.writeFile(file, JSON.stringify(defaultHomeShortcuts, null, 2) + '\n', { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return file;
}

function validHomeShortcut(shortcut) {
  if (!shortcut || typeof shortcut.label !== 'string' || !shortcut.label.trim() || typeof shortcut.path !== 'string') return false;
  try { resolveVirtual(shortcut.path); return true; } catch { return false; }
}

function homeCardsFromConfig(config) {
  const hero = config.hero === undefined ? defaultHomeShortcuts.hero : config.hero;
  if (!hero || ['kicker', 'title', 'description', 'badgeTop', 'badgeBottom'].some(key =>
    typeof hero[key] !== 'string' || hero[key].length > 2000
  )) throw new Error('Invalid Home header');
  if (Array.isArray(config.cards)) {
    if (config.cards.length > 30 || !config.cards.every(card =>
      card && typeof card.label === 'string' && card.label.trim() &&
      typeof card.title === 'string' && card.title.trim() &&
      (card.note === undefined || typeof card.note === 'string') &&
      (card.showAgenda === undefined || typeof card.showAgenda === 'boolean') &&
      (card.showRecentNotes === undefined || typeof card.showRecentNotes === 'boolean') &&
      (card.style === undefined || ['links', 'chips'].includes(card.style)) &&
      Array.isArray(card.links) && card.links.length <= 100 &&
      card.links.every(link => validHomeShortcut(link) && ['file', 'dir'].includes(link.kind))
    )) throw new Error('Invalid Home cards');
    return { hero, cards: config.cards.map(card => ({
      ...card,
      showRecentNotes: card.showRecentNotes ?? card.links.some(link => link.path.startsWith('org:/library/'))
    })) };
  }
  if (!Array.isArray(config.projects) || !config.projects.every(validHomeShortcut) || !validHomeShortcut(config.course)) {
    throw new Error('Invalid Home shortcuts');
  }
  const cards = structuredClone(defaultHomeShortcuts.cards);
  cards[1].links = config.projects.map(item => ({ ...item, kind: 'dir' }));
  cards[2].links = [{ ...config.course, kind: 'dir' }];
  return { hero, cards };
}

ipcMain.handle('home-shortcuts:get', async () => {
  const file = await ensureHomeShortcuts();
  const raw = await fsp.readFile(file, 'utf8');
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  try {
    return { config: homeCardsFromConfig(JSON.parse(raw)), sha256 };
  } catch {
    return { config: defaultHomeShortcuts, sha256, warning: 'Home settings are invalid; showing defaults. Use Customize Home to save a new layout.' };
  }
});

ipcMain.handle('home-shortcuts:save', async (_event, { config, expectedHash }) => {
  const checked = homeCardsFromConfig(config);
  const file = await ensureHomeShortcuts();
  if (expectedHash !== await hashFile(file)) throw new Error('Home settings changed outside Workbench. Reopen Customize Home before saving.');
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    await fsp.writeFile(temp, JSON.stringify(checked, null, 2) + '\n', { flag: 'wx' });
    await fsp.rename(temp, file);
  } catch (err) {
    await fsp.unlink(temp).catch(() => {});
    throw err;
  }
  return { config: checked, sha256: await hashFile(file) };
});

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
    if (rootName === 'local') continue;

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


// -----------------------------------------------------------------------------
// Live Org Agenda
// -----------------------------------------------------------------------------

ipcMain.handle('org-agenda:get', async () => {
  const orgFiles = [
    path.join(process.env.HOME, 'org', 'master.org'),
    path.join(process.env.HOME, 'org', 'inbox.org')
  ];

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 59);

  const entries = [];

  function dateFromString(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function inWindow(date) {
    return date >= startDate && date <= endDate;
  }

  for (const file of orgFiles) {
    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    let currentHeading = '';
    let currentHeadingLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const headingMatch =
        line.match(/^(\*+)\s+(?:(TODO|DONE|NEXT|WAITING|CANCELLED)\s+)?(.*)$/);

      if (headingMatch) {
        currentHeading = headingMatch[3].trim();
        currentHeadingLine = i + 1;
      }

      if (!currentHeading) continue;

      const timestampRegex = /<(\d{4}-\d{2}-\d{2})(?:\s+[^>]*)?>/g;

      let match;

      while ((match = timestampRegex.exec(line)) !== null) {
        const dateString = match[1];
        const date = dateFromString(dateString);

        if (!inWindow(date)) continue;

        let kind = 'Scheduled';

        if (/DEADLINE:/.test(line)) {
          kind = 'Deadline';
        } else if (/SCHEDULED:/.test(line)) {
          kind = 'Scheduled';
        } else {
          kind = 'Date';
        }

        entries.push({
          type: 'item',
          date: dateString,
          kind,
          text: currentHeading,
          file,
          line: currentHeadingLine
        });
      }
    }
  }

  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.text.localeCompare(b.text);
  });

  const rows = [];
  let lastDate = null;

  for (const item of entries) {
    if (item.date !== lastDate) {
      const d = dateFromString(item.date);

      rows.push({
        type: 'date',
        text: new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        }).format(d)
      });

      lastDate = item.date;
    }

    rows.push({
      type: 'item',
      text: item.text,
      file: item.file,
      line: item.line
    });
  }

  return rows;
});



app.whenReady().then(() => {
  app.setName('Norcini Workbench');
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }

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

ipcMain.handle('files:parent', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  return virtualize(path.dirname(abs));
});

ipcMain.handle('files:home', async () => virtualize(HOME));

ipcMain.handle('recent-notes:get', async () => {
  const library = path.join(ROOTS.org, 'library');
  const pending = [library];
  const notes = [];
  while (pending.length) {
    const dir = pending.pop();
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { pending.push(abs); continue; }
      if (!entry.isFile() || !['.org', '.md'].includes(path.extname(entry.name).toLowerCase())) continue;
      try {
        const stat = await fsp.stat(abs);
        notes.push({ path: virtualize(abs), name: path.relative(library, abs), mtimeMs: stat.mtimeMs });
      } catch {}
    }
  }
  notes.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return notes.slice(0, 5);
});

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


ipcMain.handle('new-file', async (_event, { parent, name }) => {
  const dir = resolveVirtual(parent);

  const clean = String(name || '').trim();

  if (
    !clean ||
    clean.includes('/') ||
    clean === '.' ||
    clean === '..'
  ) {
    throw new Error('Invalid file name');
  }

  const dest = path.join(dir, clean);

  if (!isWithin(dest, dir)) {
    throw new Error('Invalid destination');
  }

  if (fs.existsSync(dest)) {
    throw new Error('A file or folder with that name already exists');
  }

  await fsp.writeFile(dest, '', 'utf8');

  const virt = virtualize(dest);

  if (!virt) {
    throw new Error('Created file is outside Workbench roots');
  }

  return {
    ok: true,
    path: virt
  };
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


ipcMain.handle('build-latex', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);

  if (path.extname(abs).toLowerCase() !== '.tex') {
    throw new Error('Not a LaTeX file');
  }

  const dir = path.dirname(abs);
  const name = path.basename(abs);

  const latexmk = findExecutable(['latexmk']);
  const pdflatex = findExecutable(['pdflatex']);

  let exe;
  let args;

  if (fs.existsSync(latexmk)) {
    exe = latexmk;
    args = [
      '-pdf',
      '-interaction=nonstopmode',
      '-file-line-error',
      name
    ];
  } else if (fs.existsSync(pdflatex)) {
    exe = pdflatex;
    args = [
      '-interaction=nonstopmode',
      '-file-line-error',
      name
    ];
  } else {
    throw new Error('No latexmk or pdflatex found');
  }

  return await new Promise(resolve => {
    const child = spawn(exe, args, {
      cwd: dir,
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => stdout += String(d));
    child.stderr.on('data', d => stderr += String(d));

    child.on('close', code => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr
      });
    });

    child.on('error', err => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: String(err)
      });
    });
  });
});

ipcMain.handle('build-command', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  const rawExt = path.extname(abs);
  const ext = rawExt.toLowerCase();
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


  if (rawExt === '.C') {
    return `cd ${quoteShell(dir)} && root -l -q ${quoteShell(name)}`;
  }

  if (ext === '.c') {
    const compiler = findExecutable(['clang', 'gcc']);

    if (!fs.existsSync(compiler)) {
      throw new Error('No clang or gcc compiler found');
    }

    const output = path.join(
      os.tmpdir(),
      'norcini-workbench-c-' +
      crypto.createHash('sha1').update(abs).digest('hex').slice(0, 12)
    );

    return `cd ${quoteShell(dir)} && ` +
      `${quoteShell(compiler)} -Wall -Wextra ${quoteShell(name)} -o ${quoteShell(output)} && ` +
      `${quoteShell(output)}`;
  }

  if (['.cpp', '.cc', '.cxx'].includes(ext)) {
    const compiler = findExecutable(['clang++', 'g++']);

    if (!fs.existsSync(compiler)) {
      throw new Error('No clang++ or g++ compiler found');
    }

    const output = path.join(
      os.tmpdir(),
      'norcini-workbench-cpp-' +
      crypto.createHash('sha1').update(abs).digest('hex').slice(0, 12)
    );

    return `cd ${quoteShell(dir)} && ` +
      `${quoteShell(compiler)} -std=c++17 -Wall -Wextra ${quoteShell(name)} -o ${quoteShell(output)} && ` +
      `${quoteShell(output)}`;
  }

  if (ext === '.ipynb') {
    const jupyter = findExecutable(['jupyter']);
    return `cd ${quoteShell(dir)} && ${quoteShell(jupyter)} nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=180 ${quoteShell(name)}`;
  }

  throw new Error('No run/build action for this file type');
});

function ensureWorkbenchBashRc() {
  const rcPath = path.join(
    app.getPath('userData'),
    'workbench-bashrc'
  );

  const rc = `
if [ -f "$HOME/.bash_profile" ]; then
  . "$HOME/.bash_profile"
elif [ -f "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi

wb() {
  if [ "$#" -eq 0 ]; then
    set -- .
  fi

  local target="$1"

  case "$target" in
    /*) ;;
    *) target="$PWD/$target" ;;
  esac

  printf '\\033]777;workbench-open;%s\\007' "$target"
}

# Tell Workbench the terminal's current directory after each
# command, including after cd.
__wb_previous_prompt_command="$PROMPT_COMMAND"

__wb_prompt_command() {
  printf '\\033]778;workbench-cwd;%s\\007' "$PWD"

  if [ -n "$__wb_previous_prompt_command" ]; then
    eval "$__wb_previous_prompt_command"
  fi
}

PROMPT_COMMAND=__wb_prompt_command
`;

  fs.writeFileSync(rcPath, rc, 'utf8');
  return rcPath;
}



ipcMain.handle('generated-outputs', async (_event, payload) => {
  const vpath =
    typeof payload === 'string'
      ? payload
      : payload.path;

  const sinceMs =
    payload && typeof payload === 'object'
      ? Number(payload.sinceMs || 0)
      : 0;

  const abs = resolveVirtual(vpath);
  const dir = path.dirname(abs);

  const allowed = new Set([
    '.pdf',
    '.png',
    '.jpg',
    '.jpeg'
  ]);

  const entries = await fsp.readdir(dir, {
    withFileTypes: true
  });

  const outputs = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!allowed.has(ext)) continue;

    const full = path.join(dir, entry.name);

    try {
      const st = await fsp.stat(full);

      if (sinceMs && st.mtimeMs < sinceMs) continue;

      const virt = virtualize(full);
      if (!virt) continue;

      outputs.push({
        path: virt,
        name: entry.name,
        ext,
        mtimeMs: st.mtimeMs,
        fileUrl: pathToFileURL(full).href
      });
    } catch {}
  }

  outputs.sort((a, b) => b.mtimeMs - a.mtimeMs);

  return outputs;
});

ipcMain.handle('latest-generated-output', async (_event, vpath) => {
  const abs = resolveVirtual(vpath);
  const dir = path.dirname(abs);

  const allowed = new Set([
    '.pdf',
    '.png',
    '.jpg',
    '.jpeg'
  ]);

  const entries = await fsp.readdir(dir, {
    withFileTypes: true
  });

  const candidates = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!allowed.has(ext)) continue;

    const full = path.join(dir, entry.name);

    try {
      const st = await fsp.stat(full);

      candidates.push({
        full,
        mtimeMs: st.mtimeMs
      });
    } catch {}
  }

  candidates.sort((a,b) => b.mtimeMs - a.mtimeMs);

  if (!candidates.length) {
    return { found:false };
  }

  const newest = candidates[0];
  const virt = virtualize(newest.full);

  if (!virt) {
    return { found:false };
  }

  return {
    found:true,
    path:virt,
    name:path.basename(newest.full)
  };
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
      SHELL: '/bin/bash',
      PROMPT_COMMAND:
        `wb(){ ` +
        `if [ "$#" -eq 0 ]; then set -- .; fi; ` +
        `case "$1" in /*) _wb_path="$1" ;; *) _wb_path="$PWD/$1" ;; esac; ` +
        `printf '\\033]777;workbench-open;%s\\007' "$_wb_path"; ` +
        `unset _wb_path; }; ` +
        (process.env.PROMPT_COMMAND || '')
    };
    if (!pty || typeof pty.spawn !== 'function') {
      throw new Error('node-pty did not load correctly');
    }
    if (!fs.existsSync('/bin/bash')) {
      throw new Error('/bin/bash was not found');
    }
    const bashRc = ensureWorkbenchBashRc();

    const term = pty.spawn('/bin/bash', ['--rcfile', bashRc, '-i'], {
      name: 'xterm-256color',
      cols: cols || 100,
      rows: rows || 30,
      cwd: fs.existsSync(cwd) ? cwd : HOME,
      env
    });
    terminals.set(id, term);
    let terminalOutputBuffer = '';

    term.onData(data => {
      terminalOutputBuffer += data;

      const marker =
        /\x1b\](777;workbench-open|778;workbench-cwd);([^\x07]*)\x07/g;

      let clean = '';
      let last = 0;
      let match;

      while ((match = marker.exec(terminalOutputBuffer)) !== null) {
        clean += terminalOutputBuffer.slice(last, match.index);

        try {
          const kind = match[1];
          const requested = path.resolve(match[2]);
          const virt = virtualize(requested);

          if (
            virt &&
            fs.existsSync(requested) &&
            mainWindow &&
            !mainWindow.isDestroyed()
          ) {
            const st = fs.statSync(requested);

            if (
              kind === '778;workbench-cwd' &&
              st.isDirectory()
            ) {
              mainWindow.webContents.send(
                'workbench-open-path',
                {
                  path: virt,
                  type: 'dir',
                  source: 'cwd'
                }
              );
            }

            if (kind === '777;workbench-open') {
              mainWindow.webContents.send(
                'workbench-open-path',
                {
                  path: virt,
                  type: st.isDirectory() ? 'dir' : 'file',
                  source: 'wb'
                }
              );
            }
          }
        } catch {}

        last = marker.lastIndex;
      }

      const remainder =
        terminalOutputBuffer.slice(last);

      const openPartial =
        remainder.lastIndexOf(
          '\x1b]777;workbench-open;'
        );

      const cwdPartial =
        remainder.lastIndexOf(
          '\x1b]778;workbench-cwd;'
        );

      const partialStart =
        Math.max(openPartial, cwdPartial);

      if (partialStart >= 0) {
        clean += remainder.slice(0, partialStart);
        terminalOutputBuffer =
          remainder.slice(partialStart);
      } else {
        clean += remainder;
        terminalOutputBuffer = '';
      }

      if (
        clean &&
        mainWindow &&
        !mainWindow.isDestroyed()
      ) {
        mainWindow.webContents.send(
          'terminal-data',
          {
            id,
            data: clean
          }
        );
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
