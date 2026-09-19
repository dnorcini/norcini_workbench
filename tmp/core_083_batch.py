from pathlib import Path

ROOT = Path.home() / "Documents/tools/norcini_workbench"

MAIN = ROOT / "src/main.js"
PRELOAD = ROOT / "src/preload.js"
APP = ROOT / "src/renderer/app.js"

main = MAIN.read_text()
preload = PRELOAD.read_text()
app = APP.read_text()


# ============================================================
# PRELOAD
# ============================================================

if "buildLatex:" not in preload:
    marker = "  buildCommand: (p) => ipcRenderer.invoke('build-command', p),"
    if marker not in preload:
        raise RuntimeError("Could not find buildCommand in preload.js")

    preload = preload.replace(
        marker,
        marker + "\n  buildLatex: (p) => ipcRenderer.invoke('build-latex', p),",
        1
    )

if "onWorkbenchOpenPath:" not in preload:
    marker = "  onTerminalExit: (cb) => ipcRenderer.on('terminal-exit', (_e, data) => cb(data)),"
    if marker not in preload:
        raise RuntimeError("Could not find onTerminalExit in preload.js")

    preload = preload.replace(
        marker,
        marker + "\n  onWorkbenchOpenPath: (cb) => ipcRenderer.on('workbench-open-path', (_e, data) => cb(data)),",
        1
    )


# ============================================================
# MAIN: direct LaTeX build
# ============================================================

if "ipcMain.handle('build-latex'" not in main:
    pos = main.find("ipcMain.handle('build-command'")
    if pos == -1:
        raise RuntimeError("Could not find build-command handler")

    handler = r'''
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

'''

    main = main[:pos] + handler + main[pos:]


# ============================================================
# MAIN: C / C++ support
# ============================================================

if "norcini-workbench-cpp-" not in main:
    marker = "  if (ext === '.ipynb') {"

    if marker not in main:
        raise RuntimeError("Could not find ipynb build section")

    cpp = r'''
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

'''

    main = main.replace(marker, cpp + marker, 1)


# ============================================================
# MAIN: wb shell command
# ============================================================

if "function ensureWorkbenchBashRc()" not in main:
    pos = main.find("ipcMain.handle('terminal-ping'")
    if pos == -1:
        raise RuntimeError("Could not find terminal-ping")

    helper = r'''
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
`;

  fs.writeFileSync(rcPath, rc, 'utf8');
  return rcPath;
}

'''

    main = main[:pos] + helper + main[pos:]


old_spawn = "    const term = pty.spawn('/bin/bash', ['-l'], {"

if old_spawn in main:
    main = main.replace(
        old_spawn,
        """    const bashRc = ensureWorkbenchBashRc();

    const term = pty.spawn('/bin/bash', ['--rcfile', bashRc, '-i'], {""",
        1
    )


old_data = """    term.onData(data => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-data', { id, data });
      }
    });"""

if old_data in main:
    new_data = r'''    let wbBuffer = '';

    term.onData(data => {
      wbBuffer += data;

      const pattern =
        /\x1b\]777;workbench-open;([^\x07]*)\x07/g;

      let match;

      while ((match = pattern.exec(wbBuffer)) !== null) {
        try {
          const requested = path.resolve(match[1]);

          if (!fs.existsSync(requested)) {
            mainWindow.webContents.send(
              'workbench-open-path',
              { error: `Path does not exist: ${requested}` }
            );
            continue;
          }

          const virt = virtualize(requested);

          if (!virt) {
            mainWindow.webContents.send(
              'workbench-open-path',
              { error: 'Path is outside Workbench roots' }
            );
            continue;
          }

          const st = fs.statSync(requested);

          mainWindow.webContents.send(
            'workbench-open-path',
            {
              path: virt,
              type: st.isDirectory() ? 'dir' : 'file'
            }
          );
        } catch (err) {
          mainWindow.webContents.send(
            'workbench-open-path',
            { error: String(err.message || err) }
          );
        }
      }

      if (wbBuffer.length > 8192) {
        wbBuffer = wbBuffer.slice(-4096);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          'terminal-data',
          { id, data }
        );
      }
    });'''

    main = main.replace(old_data, new_data, 1)

elif "terminalOutputBuffer" in main:
    # Existing Workbench OSC terminal-open handler is already installed.
    pass
elif "wbBuffer" not in main:
    raise RuntimeError("Could not find terminal data block")


# ============================================================
# APP: C/C++ Run button
# ============================================================

old = "  runBtn.hidden=!['.py','.r','.sh','.bash','.zsh'].includes(ext);"

new = """  runBtn.hidden=![
    '.py','.r','.sh','.bash','.zsh',
    '.c','.cpp','.cc','.cxx'
  ].includes(ext);"""

if old in app:
    app = app.replace(old, new, 1)


# ============================================================
# APP: replace save/autosave section
# ============================================================

start = app.find("async function saveCurrent(")
end = app.find("function orgInline(", start)

if start == -1 or end == -1:
    raise RuntimeError("Could not find save/input section")

save_block = r'''async function buildLatexLive(vpath,quiet=true){
  suppressFsReloadUntil=Date.now()+5000;

  try{
    const result=await window.workbench.buildLatex(vpath);

    if(!result.ok){
      if(!quiet)showToast('LaTeX build failed',true);
      return false;
    }

    if(currentPath===vpath){
      await refreshPreview();
    }

    return true;
  }catch(err){
    if(!quiet)showToast(err.message||String(err),true);
    return false;
  }
}

async function saveCurrent(options={}){
  const quiet=!!options.quiet;
  const buildLatex=options.buildLatex!==false;

  if(!currentPath||editor.readOnly)return true;

  const savingPath=currentPath;

  suppressFsReloadUntil=Date.now()+1500;

  const result=await window.workbench.saveFile({
    path:savingPath,
    content:editor.value,
    expectedHash:currentHash
  });

  if(result.conflict){
    showToast(
      'File changed outside Workbench. Reload or compare before saving.',
      true
    );
    return false;
  }

  currentHash=result.sha256;
  markDirty(false);

  if(!quiet)showToast('Saved');

  // Do not rebuild normal rendered views here.
  // Rebuilding the iframe was causing scroll-to-top.

  if(
    buildLatex &&
    extOf(savingPath)==='.tex'
  ){
    await buildLatexLive(savingPath,quiet);
  }

  return true;
}

let autoSaveTimer=null;
let previewTimer=null;

editor.addEventListener('input',()=>{
  markDirty(true);

  const ext=extOf(currentPath);

  if(!['.pdf','.ipynb','.tex'].includes(ext)){
    debouncePreview();
  }

  clearTimeout(autoSaveTimer);

  autoSaveTimer=setTimeout(async()=>{
    if(!dirty||!currentPath||editor.readOnly)return;

    const savingPath=currentPath;
    const savingExt=extOf(savingPath);

    const ok=await saveCurrent({
      quiet:true,
      buildLatex:false
    });

    if(
      ok &&
      savingExt==='.tex' &&
      currentPath===savingPath
    ){
      await buildLatexLive(savingPath,true);
    }
  },1000);
});

function debouncePreview(){
  clearTimeout(previewTimer);
  previewTimer=setTimeout(refreshPreview,300);
}


// Smart list continuation
editor.addEventListener('keydown',e=>{
  if(
    e.key!=='Enter' ||
    e.shiftKey ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey
  )return;

  const ext=extOf(currentPath);

  if(!['.org','.md','.txt'].includes(ext))return;

  const start=editor.selectionStart;
  const end=editor.selectionEnd;

  if(start!==end)return;

  const before=editor.value.slice(0,start);
  const lineStart=before.lastIndexOf('\n')+1;
  const line=before.slice(lineStart);

  let continuation=null;
  let m;

  m=line.match(/^(\s*)([-+*])\s+\[([ Xx])\]\s+(.*)$/);

  if(m && m[4].trim()){
    continuation=`\n${m[1]}${m[2]} [ ] `;
  }

  if(!continuation){
    m=line.match(/^(\s*)([-+*])\s+(.*)$/);

    if(m && m[3].trim()){
      continuation=`\n${m[1]}${m[2]} `;
    }
  }

  if(!continuation){
    m=line.match(/^(\s*)(\d+)([.)])\s+(.*)$/);

    if(m && m[4].trim()){
      continuation=
        `\n${m[1]}${Number(m[2])+1}${m[3]} `;
    }
  }

  if(!continuation)return;

  e.preventDefault();

  editor.setRangeText(
    continuation,
    start,
    end,
    'end'
  );

  editor.dispatchEvent(
    new Event('input',{bubbles:true})
  );
});


'''

app = app[:start] + save_block + app[end:]


# ============================================================
# APP: terminal wb listener
# ============================================================

if "window.workbench.onWorkbenchOpenPath" not in app:
    marker = """window.workbench.onTerminalExit(({id})=>{if(id===terminalId){term.write('\\r\\n[terminal exited]\\r\\n');terminalId=null}});"""

    if marker not in app:
        raise RuntimeError("Could not find terminal exit listener")

    addition = marker + r'''

window.workbench.onWorkbenchOpenPath(async data=>{
  if(data.error){
    showToast(data.error,true);
    return;
  }

  try{
    if(data.type==='dir'){
      await loadDir(data.path);
    }else{
      await openFile(data.path);
      setEditorVisible(true);
    }
  }catch(err){
    showToast(err.message||String(err),true);
  }
});'''

    app = app.replace(marker, addition, 1)


# ============================================================
# APP: don't double-build LaTeX on manual Build
# ============================================================

old = "  if(dirty && !(await saveCurrent()))return;"

new = """  if(
    dirty &&
    !(await saveCurrent({buildLatex:false}))
  )return;"""

if old in app:
    app = app.replace(old, new, 1)


# ============================================================
# APP: bust PDF cache
# ============================================================

app = app.replace(
    "preview.src=info.fileUrl+'#view=FitH&navpanes=0&toolbar=0';",
    "preview.src=info.fileUrl+'?v='+Date.now()+'#view=FitH&navpanes=0&toolbar=0';"
)

app = app.replace(
    "preview.src=info.siblingPdf+'#view=FitH&navpanes=0&toolbar=0';",
    "preview.src=info.siblingPdf+'?v='+Date.now()+'#view=FitH&navpanes=0&toolbar=0';"
)


MAIN.write_text(main)
PRELOAD.write_text(preload)
APP.write_text(app)

print("Core 0.8.3 batch installed.")
