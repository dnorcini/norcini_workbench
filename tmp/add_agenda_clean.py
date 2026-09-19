from pathlib import Path
import re

ROOT = Path.home() / "Documents/tools/norcini_workbench"

main = ROOT / "src/main.js"
preload = ROOT / "src/preload.js"
renderer = ROOT / "src/renderer/app.js"


# ============================================================
# PRELOAD
# ============================================================

text = preload.read_text()

if "getOrgAgenda" not in text:
    m = re.search(
        r"contextBridge\.exposeInMainWorld\((['\"])workbench\1,\s*\{",
        text
    )

    if not m:
        raise RuntimeError("Could not find workbench preload bridge")

    insert_at = m.end()

    text = (
        text[:insert_at]
        + "\n  getOrgAgenda: () => ipcRenderer.invoke('org-agenda:get'),"
        + text[insert_at:]
    )

preload.write_text(text)


# ============================================================
# MAIN
# ============================================================

text = main.read_text()

if "const { execFile } = require('child_process');" not in text:
    text = "const { execFile } = require('child_process');\n" + text


if "ipcMain.handle('org-agenda:get'" not in text:

    handler = r'''
// -----------------------------------------------------------------------------
// Live Org Agenda
// -----------------------------------------------------------------------------

ipcMain.handle('org-agenda:get', async () => {
  const elisp = `
(progn
  (require 'org)
  (require 'org-agenda)
  (require 'json)

  (setq org-agenda-files
        (list
         (expand-file-name "~/org/master.org")
         (expand-file-name "~/org/inbox.org")))

  (setq org-agenda-span 60)
  (setq org-agenda-start-on-weekday nil)
  (setq org-agenda-show-all-dates nil)

  (org-agenda-list)

  (let ((rows '()))
    (with-current-buffer "*Org Agenda*"
      (goto-char (point-min))

      (while (< (point) (point-max))
        (let* ((bol (line-beginning-position))
               (eol (line-end-position))
               (line
                (buffer-substring-no-properties bol eol))
               (marker nil)
               (p bol))

          ;; Agenda markers are text properties. Find one anywhere
          ;; on the current agenda line.
          (while (and (< p eol) (not marker))
            (setq marker
                  (or
                   (get-text-property p 'org-marker)
                   (get-text-property p 'org-hd-marker)))
            (setq p (1+ p)))

          (cond

           ;; Real agenda item
           (marker
            (let ((source-buffer (marker-buffer marker))
                  (source-pos (marker-position marker))
                  source-file
                  source-line
                  heading)

              (when source-buffer
                (with-current-buffer source-buffer
                  (setq source-file (buffer-file-name))

                  (save-excursion
                    (goto-char source-pos)

                    (setq source-line
                          (line-number-at-pos))

                    (setq heading
                          (condition-case nil
                              (org-get-heading t t t t)
                            (error ""))))))

              (push
               (list
                (cons 'type "item")
                (cons 'text line)
                (cons 'file source-file)
                (cons 'line source-line)
                (cons 'heading heading))
               rows)))

           ;; Agenda date header
           ((string-match-p
             "^[[:space:]]*[A-Za-z]+[[:space:]]+[-A-Za-z0-9 ]*[0-9][0-9][0-9][0-9]"
             line)

            (push
             (list
              (cons 'type "date")
              (cons 'text line))
             rows))))

        (forward-line 1)))

    (princ (json-encode (nreverse rows)))))
`;

  const candidates = [
    '/opt/homebrew/bin/emacs',
    '/usr/local/bin/emacs',
    '/Applications/Emacs.app/Contents/MacOS/Emacs',
    '/Applications/Aquamacs.app/Contents/MacOS/Aquamacs',
    'emacs'
  ];

  const tryEmacs = index => new Promise((resolve, reject) => {
    if (index >= candidates.length) {
      reject(new Error(
        'Workbench could not find Emacs. Run "which emacs" in Terminal and check the installed path.'
      ));
      return;
    }

    execFile(
      candidates[index],
      ['--batch', '--eval', elisp],
      {
        env: {
          ...process.env,
          HOME: process.env.HOME
        },
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          tryEmacs(index + 1).then(resolve).catch(reject);
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          reject(new Error(
            'Org Agenda returned invalid data.\n\n'
            + (stderr || '')
            + '\n'
            + stdout
          ));
        }
      }
    );
  });

  return tryEmacs(0);
});

'''

    marker = "app.whenReady()"

    if marker not in text:
        raise RuntimeError("Could not find app.whenReady() in main.js")

    text = text.replace(
        marker,
        handler + "\n" + marker,
        1
    )

main.write_text(text)


# ============================================================
# RENDERER
# ============================================================

text = renderer.read_text()


# ------------------------------------------------------------
# Agenda functions
# ------------------------------------------------------------

if "function agendaVirtualPath(" not in text:

    agenda_functions = r'''
function agendaVirtualPath(realPath){
  if(!realPath)return null;

  const orgRoot='/Users/dnorcini/org/';
  const hopkinsRoot='/Users/dnorcini/Documents/hopkins/';

  if(realPath.startsWith(orgRoot)){
    return 'org:/' + realPath.slice(orgRoot.length);
  }

  if(realPath.startsWith(hopkinsRoot)){
    return 'hopkins:/' + realPath.slice(hopkinsRoot.length);
  }

  return null;
}

function renderAgenda(items){
  let html='';

  for(const item of (items||[])){

    if(item.type==='date'){
      html+=`
        <div class="agenda-date">
          ${esc((item.text||'').trim())}
        </div>
      `;
      continue;
    }

    if(item.type==='item'){
      const vpath=agendaVirtualPath(item.file);

      if(vpath){
        html+=`
          <a href="#"
             class="agenda-item agenda-item-link"
             data-agenda-path="${esc(vpath)}"
             data-agenda-line="${Number(item.line||1)}">

            <span>${esc((item.text||'').trim())}</span>
            <span class="agenda-arrow">→</span>

          </a>
        `;
      }else{
        html+=`
          <div class="agenda-item">
            <span>${esc((item.text||'').trim())}</span>
          </div>
        `;
      }
    }
  }

  if(!html){
    html=`
      <div class="agenda-empty">
        Nothing scheduled or due in the next 60 days.
      </div>
    `;
  }

  return `
    <main class="agenda-page">

      <section class="agenda-hero">
        <div>
          <div class="home-kicker">LIVE ORG AGENDA</div>
          <h1>Upcoming 60 days</h1>
          <p>
            Scheduled items and deadlines from master.org and inbox.org.
            Empty dates are hidden.
          </p>
        </div>

        <a href="#" class="agenda-refresh">Refresh</a>
      </section>

      <section class="agenda-list">
        ${html}
      </section>

    </main>
  `;
}

async function showAgenda(){
  if(!(await maybeAbandon()))return;

  isHome=false;
  currentPath=null;
  currentHash=null;

  markDirty(false);

  editor.readOnly=true;
  editor.value='';
  editorTitle.textContent='Quick edit';

  setEditorVisible(false);

  document
    .querySelectorAll('.file-row')
    .forEach(r=>r.classList.remove('selected'));

  updateContextActions();

  preview.removeAttribute('src');

  preview.srcdoc=previewShell(`
    <main class="agenda-page">
      <div class="agenda-loading">
        Loading live Org agenda…
      </div>
    </main>
  `);

  try{
    const items=await window.workbench.getOrgAgenda();
    preview.srcdoc=previewShell(renderAgenda(items));
  }catch(err){
    preview.srcdoc=previewShell(`
      <main class="agenda-page">
        <div class="agenda-error">
          <h2>Could not load Agenda</h2>
          <pre><code>${esc(
            err && err.message
              ? err.message
              : String(err)
          )}</code></pre>
        </div>
      </main>
    `);
  }
}

'''

    marker = "function homeDashboard(){"

    if marker not in text:
        raise RuntimeError("Could not find homeDashboard()")

    text = text.replace(
        marker,
        agenda_functions + "\n" + marker,
        1
    )


# ------------------------------------------------------------
# Agenda card
#
# Put this BELOW the four existing Home cards and ABOVE the
# Org Syntax Guide.
# ------------------------------------------------------------

if 'class="home-card agenda-home-card"' not in text:

    marker = '''    </section>

    <section class="home-card syntax-guide-card">'''

    replacement = '''    </section>

    <section class="home-card agenda-home-card">
      <div class="home-card-label">Planning</div>
      <h2>Agenda</h2>
      <p class="home-card-note">
        Live 60-day view of scheduled items and deadlines.
        Dates with nothing scheduled are hidden.
      </p>
      <a href="#" class="agenda-open">
        Open Agenda <span>→</span>
      </a>
    </section>

    <section class="home-card syntax-guide-card">'''

    if marker not in text:
        raise RuntimeError(
            "Could not find position immediately above Syntax Guide"
        )

    text = text.replace(
        marker,
        replacement,
        1
    )


# ------------------------------------------------------------
# CSS
# ------------------------------------------------------------

if ".agenda-page{" not in text:

    css = r'''
  .agenda-home-card{margin-top:16px}
  .agenda-open{display:flex;justify-content:space-between;gap:16px;padding:10px 0 0;margin-top:12px;border-top:1px solid #f0f1f2;font-size:14px}

  .agenda-page{max-width:960px;margin:0 auto;padding:34px 38px 90px}
  .agenda-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:30px;padding-bottom:24px;border-bottom:1px solid #d8dee4}
  .agenda-hero h1{font-size:30px;border:0;padding:0;margin:4px 0 7px}
  .agenda-hero p{font-size:14px;line-height:1.5;color:#57606a;margin:0}
  .agenda-refresh{border:1px solid #d0d7de;background:#f6f8fa;border-radius:6px;padding:7px 11px;font-size:13px;white-space:nowrap}

  .agenda-list{padding-top:8px}
  .agenda-date{font-size:15px;font-weight:700;margin:25px 0 6px;padding-bottom:7px;border-bottom:1px solid #d8dee4}

  .agenda-item{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:8px 10px;margin:1px -10px;border-radius:6px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#24292f}
  .agenda-item-link{text-decoration:none}
  .agenda-item-link:hover{background:#f6f8fa;text-decoration:none}
  .agenda-arrow{color:#8c959f}

  .agenda-loading,.agenda-empty{padding:40px 0;color:#656d76}
  .agenda-error{padding-top:20px}
'''

    marker = "  </style></head><body>${body}<script>"

    if marker not in text:
        raise RuntimeError("Could not find previewShell CSS ending")

    text = text.replace(
        marker,
        css + "\n" + marker,
        1
    )


# ------------------------------------------------------------
# Inside-preview click routing
# ------------------------------------------------------------

if "type:'openAgenda'" not in text:

    marker = """    const p=e.target.closest('.wb-link');if(p){e.preventDefault();parent.postMessage({type:'openWorkbenchPath',path:p.dataset.path,kind:p.dataset.kind},'*');return}"""

    replacement = marker + """
    const a=e.target.closest('.agenda-open');if(a){e.preventDefault();parent.postMessage({type:'openAgenda'},'*');return}
    const r=e.target.closest('.agenda-refresh');if(r){e.preventDefault();parent.postMessage({type:'refreshAgenda'},'*');return}
    const i=e.target.closest('.agenda-item-link');if(i){e.preventDefault();parent.postMessage({type:'openAgendaItem',path:i.dataset.agendaPath,line:Number(i.dataset.agendaLine||1)},'*');return}"""

    if marker not in text:
        raise RuntimeError("Could not find preview click routing")

    text = text.replace(
        marker,
        replacement,
        1
    )


# ------------------------------------------------------------
# Parent-window message routing
# ------------------------------------------------------------

if "e.data.type==='openAgenda'" not in text:

    marker = """  }else if(e.data.type==='openWorkbenchPath'){
    try{if(e.data.kind==='dir')await loadDir(e.data.path);else await openFile(e.data.path)}catch(err){showToast(err.message,true)}
"""

    replacement = marker + """  }else if(e.data.type==='openAgenda'){
    await showAgenda();

  }else if(e.data.type==='refreshAgenda'){
    await showAgenda();

  }else if(e.data.type==='openAgendaItem'){
    try{
      await openFile(e.data.path);

      const line=Math.max(1,Number(e.data.line||1));

      setTimeout(()=>{
        try{
          const lines=editor.value.split('\\n');

          let offset=0;

          for(let n=0;n<line-1 && n<lines.length;n++){
            offset+=lines[n].length+1;
          }

          editor.focus();
          editor.selectionStart=offset;
          editor.selectionEnd=offset;

          const lineHeight=20;
          editor.scrollTop=Math.max(
            0,
            (line-4)*lineHeight
          );
        }catch{}
      },75);

    }catch(err){
      showToast(err.message,true);
    }
"""

    if marker not in text:
        raise RuntimeError(
            "Could not find parent openWorkbenchPath handler"
        )

    text = text.replace(
        marker,
        replacement,
        1
    )


renderer.write_text(text)


print()
print("Agenda feature installed successfully.")
print()
print("Changed:")
print("  src/main.js")
print("  src/preload.js")
print("  src/renderer/app.js")
print()
