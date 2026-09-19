from pathlib import Path

ROOT = Path.home() / "Documents/tools/norcini_workbench"

renderer = ROOT / "src/renderer/app.js"
preload = ROOT / "src/preload.js"
main = ROOT / "src/main.js"

# PRELOAD

text = preload.read_text()

if "getOrgAgenda:" not in text:
    marker = "contextBridge.exposeInMainWorld('workbench', {"

    if marker not in text:
        raise RuntimeError("Could not find workbench contextBridge in src/preload.js")

    text = text.replace(
        marker,
        marker + """
  getOrgAgenda: () => ipcRenderer.invoke('org-agenda:get'),
"""
    )

preload.write_text(text)


# MAIN PROCESS

text = main.read_text()

if "execFile" not in text:
    lines = text.splitlines()

    insert_at = 0
    while insert_at < len(lines) and (
        lines[insert_at].startswith("#!")
        or lines[insert_at].startswith("'use strict'")
        or lines[insert_at].startswith('"use strict"')
        or lines[insert_at].strip() == ""
    ):
        insert_at += 1

    lines.insert(
        insert_at,
        "const { execFile } = require('child_process');"
    )

    text = "\n".join(lines) + "\n"


if "ipcMain.handle('org-agenda:get'" not in text:
    agenda_handler = r'''

// LIVE ORG AGENDA

ipcMain.handle('org-agenda:get', async () => {
  const home = process.env.HOME;

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

  (let ((org-agenda-window-setup 'current-window)
        (results '()))

    (org-agenda-list)

    (with-current-buffer "*Org Agenda*"
      (goto-char (point-min))

      (while (< (point) (point-max))
        (let* ((marker
                (or
                  (get-text-property (point) 'org-marker)
                  (get-text-property (point) 'org-hd-marker)))
               (line
                (buffer-substring-no-properties
                  (line-beginning-position)
                  (line-end-position))))

          (if marker
              (let* ((buffer (marker-buffer marker))
                     (position (marker-position marker))
                     file
                     heading
                     line-number)

                (when buffer
                  (with-current-buffer buffer
                    (setq file (buffer-file-name))

                    (save-excursion
                      (goto-char position)

                      (setq line-number
                            (line-number-at-pos position))

                      (setq heading
                            (condition-case nil
                                (org-get-heading t t t t)
                              (error ""))))))

                (push
                  (list
                    (cons 'type "item")
                    (cons 'text line)
                    (cons 'file file)
                    (cons 'line line-number)
                    (cons 'heading heading))
                  results))

            (when
                (string-match-p
                  "^[[:space:]]*[A-Za-z].*[0-9][0-9][0-9][0-9]"
                  line)

              (push
                (list
                  (cons 'type "date")
                  (cons 'text line))
                results))))

        (forward-line 1)))

    (princ (json-encode (nreverse results)))))
`;

  const candidates = [
    '/opt/homebrew/bin/emacs',
    '/usr/local/bin/emacs',
    '/Applications/Emacs.app/Contents/MacOS/Emacs',
    '/Applications/Aquamacs.app/Contents/MacOS/Aquamacs',
    'emacs'
  ];

  function runEmacs(index) {
    return new Promise((resolve, reject) => {
      if (index >= candidates.length) {
        reject(new Error('Could not find a usable Emacs executable.'));
        return;
      }

      execFile(
        candidates[index],
        ['--batch', '--eval', elisp],
        {
          env: {
            ...process.env,
            HOME: home
          },
          maxBuffer: 10 * 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (error) {
            runEmacs(index + 1).then(resolve).catch(reject);
            return;
          }

          try {
            resolve(JSON.parse(stdout));
          } catch (parseError) {
            reject(
              new Error(
                `Agenda returned invalid data.\n${stderr || ''}\n${stdout}`
              )
            );
          }
        }
      );
    });
  }

  return runEmacs(0);
});

'''

    marker = "app.whenReady()"

    if marker in text:
        text = text.replace(marker, agenda_handler + "\n" + marker, 1)
    else:
        text += agenda_handler

main.write_text(text)


# RENDERER

text = renderer.read_text()

if "function renderAgenda(" not in text:
    marker = "function homeDashboard"

    if marker not in text:
        raise RuntimeError("Could not find homeDashboard() in renderer")

    agenda_functions = r'''
function agendaVirtualPath(realPath){
  if(!realPath)return null;

  const homePrefix='/Users/dnorcini/org/';
  const hopkinsPrefix='/Users/dnorcini/Documents/hopkins/';

  if(realPath.startsWith(homePrefix)){
    return 'org:/' + realPath.slice(homePrefix.length);
  }

  if(realPath.startsWith(hopkinsPrefix)){
    return 'hopkins:/' + realPath.slice(hopkinsPrefix.length);
  }

  return null;
}

function renderAgenda(items){
  const rows=(items||[]).map(item=>{
    if(item.type==='date'){
      return `
        <div class="agenda-date">
          ${esc(item.text.trim())}
        </div>`;
    }

    if(item.type==='item'){
      const vpath=agendaVirtualPath(item.file);

      if(!vpath){
        return `
          <div class="agenda-item">
            <div class="agenda-item-text">${esc(item.text.trim())}</div>
          </div>`;
      }

      return `
        <a href="#"
           class="agenda-item agenda-link"
           data-path="${esc(vpath)}"
           data-line="${Number(item.line||1)}"
           data-heading="${esc(item.heading||'')}">
          <div class="agenda-item-text">${esc(item.text.trim())}</div>
          <div class="agenda-arrow">→</div>
        </a>`;
    }

    return '';
  }).join('');

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
        ${rows || `
          <div class="agenda-empty">
            Nothing scheduled in the next 60 days.
          </div>
        `}
      </section>

    </main>`;
}

async function showAgenda(record=true){
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
      <div class="agenda-loading">Loading live agenda…</div>
    </main>
  `);

  try{
    const items=await window.workbench.getOrgAgenda();

    preview.srcdoc=previewShell(renderAgenda(items));

    if(record){
      recordLocation('agenda','agenda');
    }else{
      updateNavigation();
    }
  }catch(err){
    preview.srcdoc=previewShell(`
      <main class="agenda-page">
        <div class="agenda-error">
          <h2>Could not load Agenda</h2>
          <pre><code>${esc(err && err.message ? err.message : String(err))}</code></pre>
        </div>
      </main>
    `);
  }
}

'''

    text = text.replace(
        marker,
        agenda_functions + "\n" + marker,
        1
    )

if 'data-action="agenda"' not in text:
    home_grid = '<div class="home-grid">'

    if home_grid not in text:
        raise RuntimeError("Could not find Home grid")

    agenda_card = '''
        <section class="home-card agenda-home-card">
          <div class="home-card-label">Planning</div>
          <h2>Agenda</h2>
          <p class="home-card-note">
            Live 60-day view of scheduled items and deadlines.
          </p>
          <a href="#"
             class="agenda-open-link"
             data-action="agenda">
            Open Agenda <span>→</span>
          </a>
        </section>

'''

    text = text.replace(
        home_grid,
        home_grid + "\n" + agenda_card,
        1
    )

if "openAgenda" not in text:
    target = """const p=e.target.closest('.wb-link');if(p){e.preventDefault();parent.postMessage({type:'openWorkbenchPath',path:p.dataset.path,kind:p.dataset.kind},'*');return}"""

    replacement = target + """
    const a=e.target.closest('[data-action="agenda"]');if(a){e.preventDefault();parent.postMessage({type:'openAgenda'},'*');return}
    const ai=e.target.closest('.agenda-link');if(ai){e.preventDefault();parent.postMessage({type:'openAgendaItem',path:ai.dataset.path,line:Number(ai.dataset.line),heading:ai.dataset.heading},'*');return}
    const ar=e.target.closest('.agenda-refresh');if(ar){e.preventDefault();parent.postMessage({type:'refreshAgenda'},'*');return}"""

    if target not in text:
        raise RuntimeError("Could not find preview click delegation")

    text = text.replace(target, replacement, 1)

message_anchor = """}else if(e.data.type==='openWorkbenchPath'){
    try{if(e.data.kind==='dir')await loadDir(e.data.path);else await openFile(e.data.path)}catch(err){showToast(err.message,true)}
"""

if "e.data.type==='openAgenda'" not in text:
    replacement = message_anchor + """  }else if(e.data.type==='openAgenda'){
    await showAgenda();
  }else if(e.data.type==='refreshAgenda'){
    await showAgenda(false);
  }else if(e.data.type==='openAgendaItem'){
    try{
      await openFile(e.data.path);

      if(e.data.line){
        setTimeout(()=>{
          try{
            const line=Math.max(1,Number(e.data.line));
            const lines=editor.value.split('\\n');
            let start=0;

            for(let i=0;i<line-1 && i<lines.length;i++){
              start+=lines[i].length+1;
            }

            editor.selectionStart=start;
            editor.selectionEnd=start;
            editor.scrollTop=Math.max(0,(line-5)*20);
          }catch{}
        },50);
      }
    }catch(err){
      showToast(err.message,true);
    }
"""

    if message_anchor not in text:
        raise RuntimeError("Could not find openWorkbenchPath message handler")

    text = text.replace(message_anchor, replacement, 1)

if ".agenda-page{" not in text:
    css_marker = "</style></head><body>${body}"

    agenda_css = r'''
  .agenda-page{max-width:960px;margin:0 auto;padding:34px 38px 90px}
  .agenda-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:30px;padding-bottom:24px;border-bottom:1px solid #d8dee4}
  .agenda-hero h1{font-size:30px;border:0;padding:0;margin:4px 0 7px}
  .agenda-hero p{margin:0;color:#57606a;font-size:14px}
  .agenda-refresh{border:1px solid #d0d7de;border-radius:6px;padding:7px 11px;font-size:13px;color:#24292f;background:#f6f8fa;white-space:nowrap}
  .agenda-list{padding-top:10px}
  .agenda-date{font-weight:700;font-size:15px;margin:24px 0 7px;padding-bottom:7px;border-bottom:1px solid #d8dee4}
  .agenda-item{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:8px 10px;margin:1px -10px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.45}
  .agenda-link{color:#24292f;text-decoration:none}
  .agenda-link:hover{background:#f6f8fa;text-decoration:none}
  .agenda-arrow{color:#8c959f}
  .agenda-empty,.agenda-loading{padding:40px 0;color:#656d76}
  .agenda-error{padding-top:20px}
  .agenda-open-link{display:flex;justify-content:space-between;gap:16px;padding:10px 0 0;margin-top:12px;border-top:1px solid #f0f1f2;font-size:14px}
'''

    if css_marker not in text:
        raise RuntimeError("Could not find previewShell style closing tag")

    text = text.replace(
        css_marker,
        agenda_css + "\n  " + css_marker,
        1
    )

renderer.write_text(text)

print("Agenda patch complete.")
print("Modified:")
print("  src/main.js")
print("  src/preload.js")
print("  src/renderer/app.js")
