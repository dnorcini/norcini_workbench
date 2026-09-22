from pathlib import Path
import re

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
# MAIN: preserve case-sensitive extension for ROOT .C macros
# ============================================================

old = """  const abs = resolveVirtual(vpath);
  const ext = path.extname(abs).toLowerCase();
  const dir = path.dirname(abs);
  const name = path.basename(abs);"""

new = """  const abs = resolveVirtual(vpath);
  const rawExt = path.extname(abs);
  const ext = rawExt.toLowerCase();
  const dir = path.dirname(abs);
                                              in                                             li                = path.extname(abs);" not in main:
    r    r    r    r    r    r    r  ate build-command extension block")


########################################################======
# MAIN: ROOT macro Run
################################===###############============

root_mroot_mroot_mroot_mroot_mroot_mroot_mrif "rawExt === '.C'" not in main:
    root_block = r'''
  // ROOT convention: uppercase .C is a ROOT C/C++ macro.
  // Let the interactive shell resolve `root`, since us  // Let the interactive shell resolve `root`, since us  //nt  // Let the interactive shell resolve `root`, since us  // L&&   // Let the interactive shell resolve `roo     // Let the interactive shell resolveaise Runt  // Let the interactive shell d   // Let the interactive shell res(
                                            ot_ma                             =======                               =====                          est ROO                                            ot_ma                             =======                               =====                        not in main:
    marker = "ipcMain.handle('terminal-ping'"

    pos = main.find(marker)

    if pos == -1:
        raise RuntimeError("Could not find terminal-ping")

    handler = r'''
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

    const full = path.join(dir, entry.name);
    const ext = path.extname(entry.name).toLowerCase();

    if (!allowed.has(ext)) continue;

    try {
      const stat = await fsp.stat(full);

      candidates.push({
        path: full,
        mtimeMs: stat.mtimeMs
      });
    } catch {}
  }

  candidates.sort(
    (a, b) => b.mtimeMs - a.mtimeMs
  );

  if (!candidates.length) {
    return {
      found: false
    };
  }

  const newest = candidates[0];
  const virt = virtualize(newest.path);

  if (!virt) {
    return {
      found: false
    };
  }

  return {
    found: true,
    path: virt,
    name: path.basename(newest.path),
    mtimeMs: newest.mtimeMs
  };
});

'''

    main = main[:pos] + handler + main[pos:]


# ============================================================
# PRELOAD
# ============================================================

if "latestGeneratedOutput:" not in preload:
    marker = "  buildCommand: (p) => ipcRenderer.invoke('build-command', p),"

    if marker not in preload:
        raise RuntimeError("Could not find buildCommand in preload")

    preload = preload.replace(
        marker,
        marker + "\n  latestGeneratedOutput: (p) => ipcRenderer.invoke('latest-generated-output', p),",
        1
    )


# ============================================================
# HTML: Latest plot button
# ============================================================

if 'id="latestOutputBtn"' not in html:
    match = re.search(
        r'(<button[^>]*id="runBtn"[^>]*>.*?</button>)',
        html,
        flags=re.S
    )

    if not match:
        raise RuntimeError("Could not find Run button in index.html")

    button = '''
<button id="latestOutputBtn" hidden title="Open newest PDF or image generated beside this macro">Latest plot</button>'''

    html = (
        html[:match.end()] +
        button +
        html[match.end():]
    )


# ============================================================
# RENDERER: reference Latest plot button
# ============================================================

if "const latestOutputBtn" not in app:
    marker = "const runBtn = document.getElementById('runBtn');"

    if marker not in app:
        raise RuntimeError("Could not find runBtn reference")

    app = app.replace(
        marker,
        marker + "\nconst latestOutputBtn = document.getElementById('latestOutputBtn');",
        1
    )


# ============================================================
# RENDERER: show Latest plot only for uppercase .C macros
# ============================================================

marker = "  buildBtn.hidden=ext!=='.tex';"

if "latestOutputBtn.hidden" not in app:
    if marker not in app:
        raise RuntimeError("Could not find updateContextActions buildBtn line")

    app = app.replace(
        marker,
        marker + "\n  latestOutputBtn.hidden=!(currentPath && currentPath.endsWith('.C'));",
        1
    )


# ============================================================
# RENDERER: Latest plot action
# ============================================================

if "latestOutputBtn.onclick" not in app:
    marker = """runBtn.onclick=sendBuildCommand;buildBtn.onclick=sendBuildCommand;runNotebookBtn.onclick=sendBuildCommand;"""

    if marker not in app:
        raise RuntimeError("Could not find Run/Build button handlers")

    addition = marker + r'''

latestOutputBtn.onclick=async()=>{
  if(!currentPath)return;

  try{
    const result=
      await window.workbench.latestGeneratedOutput(currentPath);

    if(!result.found){
      showToast(
        'No PDF or image output found in this directory.',
        true
      );
      return;
    }

    await openFile(result.path);
    showToast(`Opened ${result.name}`);
  }catch(err){
    showToast(err.message||String(err),true);
  }
};'''

    app = app.replace(
        marker,
        addition,
        1
    )


# ============================================================
# HELP: replace vague Run / Build section with real commands
# ============================================================

pattern = re.compile(
    r'''<div class="help-section">\s*
            <strong>Run / build</strong>.*?
          </div>''',
    flags=re.S
)

replacement = '''<div class="help-section">
            <strong>Terminal commands</strong>

            <div><code>python3 analysis.py</code><span>Run Python</span></div>

            <div><code>gcc test.c -o test</code><span>Compile C</span></div>
            <div><code>./test</code><span>Run compiled program</span></div>

            <div><code>g++ test.cpp -o test</code><span>Compile C++</span></div>
            <div><code>./test</code><span>Run compiled program</span></div>

            <div><code>root -l -q analysis.C</code><span>Run ROOT macro</span></div>
            <div><code>root -l -q 'analysis.C+'</code><span>Compile ROOT macro with ACLiC</span></div>

            <div><code>latexmk -pdf paper.tex</code><span>Build LaTeX PDF</span></div>
            <div><code>pdflatex paper.tex</code><span>Single pdflatex pass</span></div>
          </div>'''

if pattern.search(html):
    html = pattern.sub(
        replacement,
        html,
        count=1
    )
else:
    print("NOTE: Could not replace old Run/build help section; leaving existing help intact.")


# ============================================================
# Slightly widen Help so commands fit.
# Full visual cleanup waits for 0.9.
# ============================================================

html = html.replace(
    "width:390px;",
    "width:520px;",
    1
)

html = html.replace(
    "grid-template-columns:150px 1fr;",
    "grid-template-columns:230px 1fr;",
    1
)


MAIN.write_text(main)
PRELOAD.write_text(preload)
APP.write_text(app)
HTML.write_text(html)

print()
print("Final 0.8.3 ROOT/output/help batch installed.")
print()
