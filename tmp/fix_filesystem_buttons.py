from pathlib import Path
import re

ROOT = Path.home() / "Documents/tools/norcini_workbench"

main = ROOT / "src/main.js"
preload = ROOT / "src/preload.js"
app = ROOT / "src/renderer/app.js"


# ============================================================
# PRELOAD: expose newFile()
# ============================================================

text = preload.read_text()

if "newFile:" not in text:
    marker = "newFolder: (payload) => ipcRenderer.invoke('new-folder', payload),"

    if marker not in text:
        raise RuntimeError("Could not find newFolder in preload.js")

    text = text.replace(
        marker,
        marker + "\n  newFile: (payload) => ipcRenderer.invoke('new-file', payload),",
        1
    )

preload.write_text(text)


# ============================================================
# MAIN: add new-file IPC handler
# ============================================================

text = main.read_text()

if "ipcMain.handle('new-file'" not in text:

    marker = "ipcMain.handle('new-folder'"

    pos = text.find(marker)

    if pos == -1:
        raise RuntimeError("Could not find new-folder handler in main.js")

    handler = r'''
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

'''

    text = text[:pos] + handler + text[pos:]

main.write_text(text)


# ============================================================
# RENDERER
# ============================================================

text = app.read_text()


# Remove any crude handlers appended by previous patch.
text = re.sub(
    r'''
// ------------------------------------------------------------
// Filesystem toolbar buttons
// ------------------------------------------------------------

document\.getElementById\('refreshFilesBtn'\)\.onclick.*?
(?=\Z)
''',
    '',
    text,
    flags=re.S | re.X
)


# Replace existing refresh handler if it exists.
text = re.sub(
    r"""document\.getElementById\('refreshFilesBtn'\)\.onclick\s*=\s*[^;]+;""",
    """document.getElementById('refreshFilesBtn').onclick=async()=>{
  try{
    await loadDir(currentDir,false);
    showToast('Filesystem refreshed');
  }catch(e){
    showToast(e.message,true);
  }
};""",
    text,
    count=1
)


# If no refresh handler exists, insert before newFolder handler.
if "document.getElementById('refreshFilesBtn').onclick" not in text:
    marker = "document.getElementById('newFolderBtn').onclick"

    if marker not in text:
        raise RuntimeError("Could not find newFolderBtn handler")

    refresh = """document.getElementById('refreshFilesBtn').onclick=async()=>{
  try{
    await loadDir(currentDir,false);
    showToast('Filesystem refreshed');
  }catch(e){
    showToast(e.message,true);
  }
};

"""

    text = text.replace(marker, refresh + marker, 1)


# Replace + button behavior.
start = text.find("document.getElementById('newFolderBtn').onclick")

if start == -1:
    raise RuntimeError("Could not find newFolderBtn handler")

# Find next top-level handler after this one.
next_handler = re.search(
    r"\ndocument\.getElementById\('[^']+'\)",
    text[start + 20:]
)

if next_handler:
    end = start + 20 + next_handler.start() + 1
else:
    end = len(text)

new_button = r'''document.getElementById('newFolderBtn').onclick=async()=>{
  const choice=prompt(
    'Create in this folder:\n\n' +
    'f = new file\n' +
    'd = new folder\n\n' +
    'Enter f or d:'
  );

  if(!choice)return;

  const type=choice.trim().toLowerCase();

  if(type!=='f' && type!=='d'){
    showToast('Enter f for file or d for folder',true);
    return;
  }

  const name=prompt(
    type==='f'
      ? 'New file name (include extension, e.g. notes.org):'
      : 'New folder name:'
  );

  if(!name)return;

  try{
    if(type==='f'){
      const result=await window.workbench.newFile({
        parent:currentDir,
        name
      });

      await loadDir(currentDir,false);
      await openFile(result.path);
    }else{
      await window.workbench.newFolder({
        parent:currentDir,
        name
      });

      await loadDir(currentDir,false);
    }
  }catch(e){
    showToast(e.message,true);
  }
};

'''

text = text[:start] + new_button + text[end:]

app.write_text(text)

print()
print("Filesystem controls fixed.")
print()
print("+ now creates:")
print("  f = file")
print("  d = folder")
print()
print("Refresh reloads the current directory.")
print()
