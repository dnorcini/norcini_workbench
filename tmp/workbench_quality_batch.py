from pathlib import Path

ROOT = Path.home() / "Documents/tools/norcini_workbench"

main = ROOT / "src/main.js"
preload = ROOT / "src/preload.js"
renderer = ROOT / "src/renderer/app.js"


# ============================================================
# PRELOAD
# ============================================================

text = preload.read_text()

marker = "  buildCommand: (p) => ipcRenderer.invoke('build-command', p),"

if "buildLatex:" not in text:
    if marker not in text:
        raise RuntimeError("Could not find buildCommand in preload.js")

    text = text.replace(
        marker,
        marker + "\n  buildLatex: (p) => ipcRenderer.invoke('build-latex', p),",
        1
    )

marker = "  onTerminalExit: (cb) => ipcRenderer.on('terminal-exit', (_e, data) => cb(data)),"

if "onWorkbenchOpenPath:" not in text:
    if marker not in text:
        raise RuntimeError("Could not find terminal listeners in preload.js")

    text = text.replace(
        marker,
        marker + "\n  onWorkbenchOpenPath: (cb) => ipcRenderer.on('workbench-open-path', (_e, data) => cb(data)),",
        1
    )

preload.write_text(text)


# ============================================================
# MAIN: live LaTeX builder
# ============================================================

text = main.read_text()

if "ipcMain.handle('build-latex'" not in text:
    marker = "ipcMain.handle('build-command'"

    pos = text.find(marker)

    if pos == -1:
        raise RuntimeError("Could not find build-command in main.js")

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

    text = text[:pos] + handler + text[pos:]


# ============================================================
# MAIN: make wb available in integrated Bash
# ============================================================

old_env = """      SHELL: '/bin/bash'
    };"""

new_env = r"""      SHELL: '/bin/bash',
      PROMPT_COMMAND:
        `wb(){ ` +
        `if [ "$#" -eq 0 ]; then set -- .; fi; ` +
        `case "$1" in /*) _wb_path="$1" ;; *) _wb_path="$PWD/$1" ;; esac; ` +
        `printf '\\033]777;workbench-open;%s\\007' "$_wb_path"; ` +
        `unset _wb_path; }; ` +
        (process.env.PROMPT_COMMAND || '')
    };"""

if "workbench-open" not in text:
    if old_env not in text:
        raise RuntimeError("Could not find terminal env block")

    text = text.replace(old_env, new_env, 1)


old_terminal_data = """    term.onData(data => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-data', { id, data });
      }
    });"""

new_terminal_data = r"""    let terminalOutputBuffer = '';

    term.onData(data => {
      terminalOutputBuffer += data;

      const marker = /\x1b\]777;workbench-open;([^\x07]*)\x07/g;

      let clean = '';
      let last = 0;
      let match;

      while ((match = marker.exec(terminalOutputBuffer)) !== null) {
        clean += terminalOutputBuffer.slice(last, match.index);

        try {
          const requested = path.resolve(match[1]);
          const virt = virtualize(requested);

          if (virt && fs.existsSync(requested) &&
              mainWindow && !mainWindow.isDestroyed()) {

            const st = fs.statSync(requested);

            mainWindow.webContents.send('workbench-open-path', {
              path: virt,
              type: st.isDirectory() ? 'dir' : 'file'
            });
          }
        } catch {}

        last = marker.lastIndex;
      }

      const remainder = terminalOutputBuffer.slice(last);
      const partialStart =
        remainder.lastIndexOf('\x1b]777;workbench-open;');

      if (partialStart >= 0) {
        clean += remainder.slice(0, partialStart);
        terminalOutputBuffer = remainder.slice(partialStart);
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
          { id, data: clean }
        );
      }
    });"""

if old_terminal_data in text:
    text = text.replace(
        old_terminal_data,
        new_terminal_data,
        1
    )
elif "terminalOutputBuffer" not in text:
    raise RuntimeError("Could not find terminal onData block")

main.write_text(text)


# ============================================================
# RENDERER
# ============================================================

text = renderer.read_text()


# ------------------------------------------------------------
# Upgrade saveCurrent so autosave can be quiet
# ------------------------------------------------------------

old = """async function saveCurrent(){
  if(!currentPath||editor.readOnly)return true;
  const result=await window.workbench.saveFile({path:currentPath,content:editor.value,expectedHash:currentHash});
  if(result.conflict){
    showToast('File changed outside Workbench. Reload or compare before saving.',true);
    return false;
  }
  currentHash=result.sha256;markDirty(false);showToast('Saved');
  await refreshPreview();
  return true;
}"""

new = """async function saveCurrent(options={}){
  const quiet=!!options.quiet;
  const refresh=options.refresh!==false;

  if(!currentPath||editor.readOnly)return true;

  const result=await window.workbench.saveFile({
    path:currentPath,
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
  if(refresh)await refreshPreview();

  return true;
}"""

if old not in text:
    raise RuntimeError("Could not find saveCurrent()")

text = text.replace(old, new, 1)


# ------------------------------------------------------------
# Autosave + live LaTeX build
# ------------------------------------------------------------

old = """editor.addEventListener('input',()=>{
  markDirty(true);
  if(!['.pdf','.ipynb'].includes(extOf(currentPath))) debouncePreview();
});
let previewTimer=null;
function debouncePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(refreshPreview,300)}"""

new = r"""let autoSaveTimer=null;
let latexBuildGeneration=0;

editor.addEventListener('input',()=>{
  markDirty(true);

  const ext=extOf(currentPath);

  if(!['.pdf','.ipynb','.tex'].includes(ext)){
    debouncePreview();
  }

  clearTimeout(autoSaveTimer);

  autoSaveTimer=setTimeout(async()=>{
    if(!dirty || !currentPath || editor.readOnly)return;

    const pathBeingSaved=currentPath;
    const extBeingSaved=extOf(pathBeingSaved);

    const saved=await saveCurrent({
      quiet:true,
      refresh:extBeingSaved!=='.tex'
    });

    if(!saved)return;

    if(extBeingSaved==='.tex'){
      const generation=++latexBuildGeneration;

      try{
        const result=await window.workbench.buildLatex(pathBeingSaved);

        if(
          generation===latexBuildGeneration &&
          currentPath===pathBeingSaved &&
          result.ok
        ){
          await refreshPreview();
        }
      }catch{}
    }
  },1000);
});

let previewTimer=null;
function debouncePreview(){
  clearTimeout(previewTimer);
  previewTimer=setTimeout(refreshPreview,300);
}"""

if old not in text:
    raise RuntimeError("Could not find editor input/debounce block")

text = text.replace(old, new, 1)


# ------------------------------------------------------------
# List continuation on Enter
# ------------------------------------------------------------

if "Workbench list continuation" not in text:
    marker = "function orgInline(s,current){"

    handler = r'''
// Workbench list continuation
editor.addEventListener('keydown',e=>{
  if(e.key!=='Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey)return;

  const ext=extOf(currentPath);
  if(!['.org','.md','.txt'].includes(ext))return;

  const start=editor.selectionStart;
  const end=editor.selectionEnd;

  if(start!==end)return;

  const before=editor.value.slice(0,start);
  const lineStart=before.lastIndexOf('\n')+1;
  const line=before.slice(lineStart);

  let continuation=null;

  let m=line.match(/^(\s*[-+*]\s+\[[ Xx]\]\s+)(.*)$/);

  if(m){
    if(!m[2].trim())return;
    const indent=(m[1].match(/^\s*/)||[''])[0];
    const bullet=(m[1].match(/[-+*]/)||['-'])[0];
    continuation=`\n${indent}${bullet} [ ] `;
  }

  if(!continuation){
    m=line.match(/^(\s*[-+*]\s+)(.*)$/);

    if(m){
      if(!m[2].trim())return;
      continuation=`\n${m[1]}`;
    }
  }

  if(!continuation){
    m=line.match(/^(\s*)(\d+)([.)]\s+)(.*)$/);

    if(m){
      if(!m[4].trim())return;

      continuation=
        `\n${m[1]}${Number(m[2])+1}${m[3]}`;
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

    if marker not in text:
        raise RuntimeError("Could not find orgInline()")

    text = text.replace(marker, handler + marker, 1)


# ------------------------------------------------------------
# wb file opening from terminal
# ------------------------------------------------------------

if "onWorkbenchOpenPath" not in text:
    marker = """window.workbench.onTerminalExit(({id})=>{if(id===terminalId){term.write('\\r\\n[terminal exited]\\r\\n');terminalId=null}});"""

    addition = marker + r"""

window.workbench.onWorkbenchOpenPath(async ({path,type})=>{
  try{
    if(type==='dir'){
      await loadDir(path);
    }else{
      await openFile(path);
      setEditorVisible(true);
    }
  }catch(err){
    showToast(err.message,true);
  }
});"""

    if marker not in text:
        raise RuntimeError("Could not find terminal exit listener")

    text = text.replace(marker, addition, 1)


# ------------------------------------------------------------
# Bust PDF cache so rebuilt LaTeX really refreshes
# ------------------------------------------------------------

old = """    preview.src=info.fileUrl+'#view=FitH&navpanes=0&toolbar=0';"""

new = """    preview.src=info.fileUrl+'?v='+Date.now()+'#view=FitH&navpanes=0&toolbar=0';"""

if old in text:
    text = text.replace(old, new, 1)

old = """    preview.src=info.siblingPdf+'#view=FitH&navpanes=0&toolbar=0';"""

new = """    preview.src=info.siblingPdf+'?v='+Date.now()+'#view=FitH&navpanes=0&toolbar=0';"""

if old in text:
    text = text.replace(old, new, 1)


renderer.write_text(text)

print()
print("Workbench quality batch installed.")
print()
print("Added:")
print("  wb <file> / wb .")
print("  1-second autosave")
print("  list continuation on Enter")
print("  live LaTeX save/build/PDF refresh")
print()
