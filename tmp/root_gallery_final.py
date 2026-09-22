from pathlib import Path

ROOT = Path.home() / "Software/norcini_workbench"

MAIN = ROOT / "src/main.js"
PRELOAD = ROOT / "src/preload.js"
APP = ROOT / "src/renderer/app.js"
HTML = ROOT / "src/renderer/index.html"

main = MAIN.read_text()
preload = PRELOAD.read_text()
app = APP.read_text()
html = HTML.read_text()


# ============================================================
# BACKEND: return all PDF/image outputs beside a ROOT macro
# ============================================================

if "ipcMain.handle('generated-outputs'" not in main:

    marker = "ipcMain.handle('latest-generated-output'"

    pos = main.find(marker)

    if pos == -1:
        marker = "ipcMain.handle('terminal-ping'"
        pos = main.find(marker)

    if pos == -1:
        raise RuntimeError("Could not find main.js insertion point")

    handler = """
ipcMain.handle('generated-outputs', async (_event, vpath) => {
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

  const outputs = [];  const outputs = [];  const outp{
    if (!entry.isFile()) continue;

    const ext = path.extname(    const ext = path.extname   if (!allowed.has(ext)    const ext = path.e ful    const ext = path.extname(    const ext = path.extname   await fsp.stat(full);
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

"""

    main = main[:pos] + handler + main[pos:]


# ============================================================
# PRELOAD
# ============================================================

if "generatedOutputs:" not in preload:

    marker = "  buildCommand: (p) => ipcRenderer.invoke('build-command', p),"

    if marker not in preload:
        raise RuntimeError("Could not find preload insertion point")

    preload = preload.replace(
        marker,
        marker +
        "\n  generatedOutputs: (p) => ipcRenderer.invoke('generated-outputs', p),",
        1
    )


# ============================================================
# RENDERER: ROOT output gallery
# ============================================================

if "async function renderRootOutputs()" not in app:

    marker = "async function refreshPreview(){"

    pos = app.find(marker)

    if pos == -1:
        raise RuntimeError("Could not find refreshPreview()")

    helper = """
async function renderRootOutputs(){
  const outputs =
    await window.workbench.generatedOutputs(currentPath);

  if(!outputs.length){
    return previewShell(`
      <article class="doc">
        <h1>ROOT outputs</h1>
        <p>No PDF or image outputs found yet.</p>
        <p>Run the macro to generate plots.</p>
      </article>
    `);
  }

  const cards=outputs.map((item,index)=>{
    const name=esc(item.name);
    const url=esc(item.fileUrl);
    const newest=index===0
      ? '<span style="font-size:11px;color:#656d76">Newest</span>'
      : '';

    if(item.ext==='.pdf'){
      return `
        <section style="
          margin-bottom:28px;
          border:1px solid #d8dee4;
          border-radius:8px;
          overflow:hidden;
          background:white;
        ">
          <div style="
            padding:10px 14px;
            background:#f6f8fa;
            border-bottom:1px solid #d8dee4;
            display:flex;
            justify-content:space-between;
          ">
            <strong>${name}</strong>
            ${newest}
          </div>

          <iframe
            src="${url}?v=${item.mtimeMs}#view=FitH&navpanes=0&toolbar=0"
            style="
              display:block;
              width:100%;
              height:720px;
              border:0;
            "
          ></iframe>
        </section>
      `;
    }

    return `
      <section style="
        margin-bottom:28px;
        border:1px solid #d8dee4;
        border-radius:8px;
        overflow:hidden;
        background:white;
      ">
        <div style="
          padding:10px 14px;
          background:#f6f8fa;
          border-bottom:1px solid #d8dee4;
          display:flex;
          justify-content:space-between;
        ">
          <strong>${name}</strong>
          ${newest}
        </div>

        <img
          src="${url}?v=${item.mtimeMs}"
          alt="${name}"
          style="
            display:block;
            max-width:100%;
            height:auto;
            margin:0 auto;
            padding:16px;
            box-sizing:border-box;
          "
        >
      </section>
    `;
  }).join('');

  return previewShell(`
    <article class="doc" style="max-width:1100px;margin:0 auto">
      <h1>ROOT outputs</h1>
      <p style="color:#656d76;margin-bottom:22px">
        ${outputs.length} generated output${outputs.length===1?'':'s'}
      </p>
      ${cards}
    </article>
  `);
}

"""

    app = app[:pos] + helper + app[pos:]


# ============================================================
# RENDERER: use gallery for uppercase .C
# ============================================================

special = """  if(currentPath && currentPath.endsWith('.C')){
    preview.removeAttribute('src');
    preview.srcdoc=await renderRootOutputs();
    return;
  }"""

if special not in app:

    marker = "  const ext=extOf(currentPath);"

    # Only patch the occurrence inside refreshPreview().
    refresh_pos = app.find("async function refreshPreview(){")
    marker_pos = app.find(marker, refresh_pos)

    if marker_pos == -1:
        raise RuntimeError("Could not find ext line inside refreshPreview")

    insert_pos = marker_pos + len(marker)

    app = (
        app[:insert_pos] +
        "\n\n" +
        special +
        app[insert_pos:]
    )


# ============================================================
# HELP BUTTON: match the normal toolbar controls
# ============================================================

if 'id="helpButtonFinalStyle"' not in html:

    marker = "</head>"

    if marker not in html:
        raise RuntimeError("Could not find </head>")

    css = """
<style id="helpButtonFinalStyle">
.help-menu summary{
  box-sizing:border-box !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  height:32px !important;
  min-height:32px !important;
  margin:0 !important;
  padding:4px 10px !important;
  border:1px solid #d0d7de !important;
  border-radius:6px !important;
  background:#ffffff !important;
  color:#24292f !important;
  font-family:inherit !important;
  font-size:13px !important;
  font-weight:400 !important;
  line-height:20px !important;
  cursor:pointer !important;
  list-style:none !important;
  box-shadow:none !important;
  appearance:none !important;
  -webkit-appearance:none !important;
}

.help-menu summary::-webkit-details-marker{
  display:none !important;
}

.help-menu summary:hover{
  background:#f6f8fa !important;
}

.help-menu[open] summary{
  background:#f6f8fa !important;
}
</style>
"""

    html = html.replace(
        marker,
        css + "\n" + marker,
        1
    )


# ============================================================
# WRITE
# ============================================================

MAIN.write_text(main)
PRELOAD.write_text(preload)
APP.write_text(app)
HTML.write_text(html)

print("ROOT gallery and Help-button cleanup installed.")
