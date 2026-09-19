from pathlib import Path
import re

ROOT = Path.home() / "Documents/tools/norcini_workbench"

html = ROOT / "src/renderer/index.html"
app = ROOT / "src/renderer/app.js"
preload = ROOT / "src/preload.js"
main = ROOT / "src/main.js"


# ============================================================
# 1. INDEX.HTML
# Add native Create dialog
# ============================================================

text = html.read_text()

if 'id="createItemDialog"' not in text:
    marker = '''  <dialog id="contextMenu" class="context-dialog">'''

    dialog = '''  <dialog id="createItemDialog">
    <form id="createItemForm">
      <h2>Create</h2>

      <label>Type
        <select id="createItemType">
          <option value="file" selected>File</option>
          <option value="folder">Folder</option>
        </select>
      </label>

      <label>Name
        <input
          id="createItemName"
          placeholder="notes.org"
          autocomplete="off"
          required
        >
      </label>

      <div class="dialog-actions">
        <button type="button" id="cancelCreateItemBtn">Cancel</button>
        <button type="submit" class="primary">Create</button>
      </div>
    </form>
  </dialog>

'''

    if marker not in text:
        raise RuntimeError("Could not find contextMenu in index.html")

    text = text.replace(marker, dialog + marker, 1)

html.write_text(text)


# ============================================================
# 2. PRELOAD
# Ensure newFile API exists
# ============================================================

text = preload.read_text()

if "newFile:" not in text:
    marker = "newFolder: (payload) => ipcRenderer.invoke('new-folder', payload),"

    if marker not in text:
        raise RuntimeError("Could not find newFolder API in preload.js")

    text = text.replace(
        marker,
        marker + "\n  newFile: (payload) => ipcRenderer.invoke('new-file', payload),",
        1
    )

preload.write_text(text)


# ============================================================
# 3. MAIN
# Ensure new-file backend exists
# ============================================================

text = main.read_text()

if "ipcMain.handle('new-file'" not in text:
    marker = "ipcMain.handle('new-folder'"

    pos = text.find(marker)

    if pos == -1:
        raise RuntimeError("Could not find new-folder backend")

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
# 4. APP.JS
# Add dialog reference
# ============================================================

text = app.read_text()

if "const createItemDialog" not in text:
    marker = "const dialogNote = document.getElementById('newNoteDialog');"

    replacement = marker + """
const createItemDialog = document.getElementById('createItemDialog');
const createItemForm = document.getElementById('createItemForm');
const createItemType = document.getElementById('createItemType');
const createItemName = document.getElementById('createItemName');"""

    if marker not in text:
        raise RuntimeError("Could not find newNoteDialog reference")

    text = text.replace(marker, replacement, 1)


# ============================================================
# 5. Replace + button handler
# ============================================================

start = text.find("document.getElementById('newFolderBtn').onclick")

if start == -1:
    raise RuntimeError("Could not find newFolderBtn handler")

next_marker = "document.getElementById('newNoteBtn').onclick"
end = text.find(next_marker, start)

if end == -1:
    raise RuntimeError("Could not find newNoteBtn handler after newFolderBtn")

new_handler = r'''document.getElementById('newFolderBtn').onclick=()=>{
  createItemType.value='file';
  createItemName.value='';
  createItemName.placeholder='notes.org';

  createItemDialog.showModal();

  setTimeout(()=>{
    createItemName.focus();
  },0);
};

document.getElementById('cancelCreateItemBtn').onclick=()=>{
  createItemDialog.close();
};

createItemType.onchange=()=>{
  createItemName.placeholder=
    createItemType.value==='file'
      ? 'notes.org'
      : 'new-folder';

  createItemName.focus();
};

createItemForm.onsubmit=async e=>{
  e.preventDefault();

  const type=createItemType.value;
  const name=createItemName.value.trim();

  if(!name)return;

  try{
    if(type==='file'){
      const result=await window.workbench.newFile({
        parent:currentDir,
        name
      });

      createItemDialog.close();

      await loadDir(currentDir,false);
      await openFile(result.path);
      setEditorVisible(true);

      showToast(`Created ${name}`);
    }else{
      await window.workbench.newFolder({
        parent:currentDir,
        name
      });

      createItemDialog.close();

      await loadDir(currentDir,false);

      showToast(`Created ${name}`);
    }

    createItemName.value='';

  }catch(err){
    showToast(err.message,true);
  }
};

'''

text = text[:start] + new_handler + text[end:]

app.write_text(text)


print()
print("Create dialog installed.")
print()
print("+ now opens a Workbench dialog for:")
print("  - File")
print("  - Folder")
print()
