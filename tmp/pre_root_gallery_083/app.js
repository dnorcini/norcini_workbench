let currentPath = null;
let currentDir = 'org:/';
let currentHash = null;
let dirty = false;
let editorVisible = false;
let contextTarget = null;
let terminalId = null;
let fsTimer = null;
let navHistory = [];
let navIndex = -1;
let navigatingHistory = false;
let isHome = true;
let suppressFsReloadUntil = 0;

const workspace = document.getElementById('workspace');
const tree = document.getElementById('fileTree');
const breadcrumbs = document.getElementById('breadcrumbs');
const editor = document.getElementById('editor');
const editorTitle = document.getElementById('editorTitle');
const dirtyDot = document.getElementById('dirtyDot');
const preview = document.getElementById('preview');
const toastEl = document.getElementById('toast');
const dialogNote = document.getElementById('newNoteDialog');
const createItemDialog = document.getElementById('createItemDialog');
const createItemForm = document.getElementById('createItemForm');
const createItemType = document.getElementById('createItemType');
const createItemName = document.getElementById('createItemName');
const contextMenu = document.getElementById('contextMenu');

const runBtn = document.getElementById('runBtn');
const latestOutputBtn = document.getElementById('latestOutputBtn');
const buildBtn = document.getElementById('buildBtn');
const runNotebookBtn = document.getElementById('runNotebookBtn');
const terminalStatus = document.getElementById('terminalStatus');
const activePath = document.getElementById('activePath');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const openDefaultBtn = document.getElementById('openDefaultBtn');

const term = new Terminal({
  cursorBlink:true,
  fontFamily:'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize:13,
  theme:{background:'#0d1117',foreground:'#c9d1d9',cursor:'#f0f6fc',selectionBackground:'#264f78'},
  scrollback:5000,
  convertEol:false
});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();

function showToast(msg, error=false){
  toastEl.textContent=msg;
  toastEl.style.background=error?'#cf222e':'#24292f';
  toastEl.hidden=false;
  clearTimeout(showToast._t);
  showToast._t=setTimeout(()=>toastEl.hidden=true,2600);
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dirname(v){
  const no=v.endsWith('/')?v.slice(0,-1):v;
  const i=no.lastIndexOf('/');
  return i>=0?no.slice(0,i+1):v;
}
function extOf(v){
  const n=(v||'').split('/').pop()||'';
  const i=n.lastIndexOf('.');
  return i>=0?n.slice(i).toLowerCase():'';
}
function markDirty(value){
  dirty=value; dirtyDot.hidden=!dirty;
}
function setEditorVisible(show){
  editorVisible=show;
  workspace.classList.toggle('editor-hidden',!show);
  document.getElementById('toggleEditorBtn').textContent=show?'Hide quick edit':'Quick edit';
  setTimeout(()=>{fitAddon.fit(); resizeTerminal();},50);
}
function updateContextActions(){
  const ext=extOf(currentPath);
  runBtn.hidden=![
    '.py','.r','.sh','.bash','.zsh',
    '.c','.cpp','.cc','.cxx'
  ].includes(ext);
  buildBtn.hidden=ext!=='.tex';
  latestOutputBtn.hidden=!(currentPath && currentPath.endsWith('.C'));
  runNotebookBtn.hidden=ext!=='.ipynb';
  openDefaultBtn.disabled=!currentPath;
  document.getElementById('toggleEditorBtn').disabled=!currentPath;
}
function updateNavigation(){
  backBtn.disabled=navIndex<=0;
  forwardBtn.disabled=navIndex<0||navIndex>=navHistory.length-1;
  activePath.textContent=isHome?'Home':(currentPath||currentDir||'Norcini Workbench');
  activePath.title=activePath.textContent;
}
function recordLocation(type,path){
  if(navigatingHistory)return;
  const prev=navHistory[navIndex];
  if(prev&&prev.type===type&&prev.path===path){updateNavigation();return}
  navHistory=navHistory.slice(0,navIndex+1);
  navHistory.push({type,path});
  navIndex=navHistory.length-1;
  updateNavigation();
}
async function goHistory(delta){
  const next=navIndex+delta;if(next<0||next>=navHistory.length)return;
  if(!(await maybeAbandon()))return;
  navigatingHistory=true;navIndex=next;
  try{const item=navHistory[navIndex];if(item.type==='home')await showHome(false);else if(item.type==='dir')await loadDir(item.path,false);else await openFile(item.path,false)}
  finally{navigatingHistory=false;updateNavigation()}
}
async function loadDir(vpath,record=true){
  isHome=false;
  const data=await window.workbench.listDir(vpath);
  currentDir=data.path.endsWith('/')?data.path:data.path+'/';
  if(record) recordLocation('dir',currentDir); else updateNavigation();
  breadcrumbs.textContent=currentDir;
  tree.innerHTML='';
  if(!/^[^:]+:\/$/.test(currentDir)){
    const up=document.createElement('div');
    up.className='file-row';up.innerHTML='<span class="file-icon">↩</span><span class="file-name">..</span>';
    up.onclick=()=>loadDir(dirname(currentDir));
    tree.appendChild(up);
  }
  for(const item of data.items){
    const row=document.createElement('div');
    row.className='file-row';row.dataset.path=item.path;
    row.innerHTML=`<span class="file-icon">${item.type==='dir'?'▸':'•'}</span><span class="file-name">${esc(item.name)}</span><button class="file-more">•••</button>`;
    row.onclick=(e)=>{
      if(e.target.classList.contains('file-more')) return;
      item.type==='dir'?loadDir(item.path):openFile(item.path);
    };
    row.oncontextmenu=(e)=>{e.preventDefault();openContext(item.path)};
    row.querySelector('.file-more').onclick=(e)=>{e.stopPropagation();openContext(item.path)};
    tree.appendChild(row);
  }
}
async function maybeAbandon(){
  if(!dirty)return true;
  return confirm('You have unsaved changes. Discard them?');
}
async function openFile(vpath,record=true){
  isHome=false;
  if(currentPath!==vpath && !(await maybeAbandon()))return;
  const data=await window.workbench.readFile(vpath);
  currentPath=vpath;currentHash=data.sha256;markDirty(false);
  if(record) recordLocation('file',vpath); else updateNavigation();
  document.querySelectorAll('.file-row').forEach(r=>r.classList.toggle('selected',r.dataset.path===vpath));
  editorTitle.textContent=vpath;
  editor.readOnly=data.binary;
  editor.value=data.binary?'(Binary file: use rendered view)':''+data.content;
  currentDir=dirname(vpath);
  updateContextActions();
  await refreshPreview();
}
async function buildLatexLive(vpath,quiet=true){
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


function orgInline(s,current){
  let x=esc(s);
  x=x.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g,(_,target,label)=>{
    const raw=target.replace(/&amp;/g,'&');
    if(raw.startsWith('http://')||raw.startsWith('https://')) return `<a href="${esc(raw)}" data-web="${esc(raw)}">${label}</a>`;
    if(raw.startsWith('file:')) return `<a href="#" class="org-file-link" data-target="${esc(raw.slice(5))}">${label}</a>`;
    return `<span>${label}</span>`;
  });
  x=x.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g,'<strong>$1</strong>');
  x=x.replace(/~([^~\n]+)~/g,'<code>$1</code>');
  return x;
}
function renderOrg(text){
  const lines=text.split(/\r?\n/);const out=['<article class="doc">'];let inSrc=false,src=[],lang='';
  lines.forEach((line,i)=>{
    if(inSrc){
      if(/^\s*#\+end_src/i.test(line)){out.push(`<pre><code>${esc(src.join('\n'))}</code></pre>`);inSrc=false;src=[];return}
      src.push(line);return;
    }
    let m=line.match(/^\s*#\+begin_src\s*([A-Za-z0-9_+-]*)/i);
    if(m){inSrc=true;lang=m[1]||'';return}
    m=line.match(/^#\+TITLE:\s*(.*)$/i);if(m){out.push(`<h1>${orgInline(m[1])}</h1>`);return}
    if(/^#\+/.test(line))return;
    m=line.match(/^(\*+)\s+(TODO|DONE)\s+(.*)$/);
    if(m){
      const done=m[2]==='DONE';
      out.push(`<div class="task-row task-level-${Math.min(m[1].length,5)}"><button class="task-toggle" data-line="${i}" data-kind="todo">${done?'☑':'☐'}</button><span class="task-status ${done?'done':'todo'}">${m[2]}</span><span class="task-text ${done?'done-text':''}">${orgInline(m[3])}</span></div>`);
      return;
    }
    m=line.match(/^(\*+)\s+(.*)$/);if(m){const l=Math.min(m[1].length+1,6);out.push(`<h${l}>${orgInline(m[2])}</h${l}>`);return}
    m=line.match(/^\s*[-+]\s+\[([ Xx])\]\s+(.*)$/);if(m){
      const done=m[1].toLowerCase()==='x';
      out.push(`<div class="check-row checkbox-toggle-row" data-line="${i}"><button type="button" class="task-toggle" data-line="${i}" data-kind="checkbox">${done?'☑':'☐'}</button><span class="${done?'done-text':''}">${orgInline(m[2])}</span></div>`);return;
    }
    m=line.match(/^\s*[-+]\s+(.*)$/);if(m){out.push(`<div class="bullet">• ${orgInline(m[1])}</div>`);return}
    if(/^\s*\[[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(line)){out.push(`<div class="timestamp">${esc(line.trim())}</div>`);return}
    if(!line.trim()){out.push('<div class="spacer"></div>');return}
    out.push(`<p>${orgInline(line)}</p>`);
  });
  out.push('</article>');return out.join('\n');
}
function renderMarkdown(text){
  const out=['<article class="doc">'];let code=false,buf=[];
  for(const line of text.split(/\r?\n/)){
    if(line.startsWith('```')){if(code){out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);buf=[]}code=!code;continue}
    if(code){buf.push(line);continue}
    const m=line.match(/^(#{1,6})\s+(.*)$/);if(m){out.push(`<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`);continue}
    if(/^\s*[-*+]\s+/.test(line)){out.push(`<div class="bullet">• ${esc(line.replace(/^\s*[-*+]\s+/,''))}</div>`);continue}
    out.push(line.trim()?`<p>${esc(line)}</p>`:'<div class="spacer"></div>');
  }
  out.push('</article>');return out.join('\n');
}
function renderNotebook(text){
  let nb;try{nb=JSON.parse(text)}catch{return '<article class="doc"><h1>Invalid notebook JSON</h1></article>'}
  const out=['<article class="doc notebook">'];
  for(const cell of nb.cells||[]){
    const source=(cell.source||[]).join('');
    if(cell.cell_type==='markdown'){out.push(renderMarkdown(source).replace(/^<article class="doc">|<\/article>$/g,''));continue}
    if(cell.cell_type==='code'){
      out.push(`<div class="nb-cell"><pre><code>${esc(source)}</code></pre>`);
      for(const o of cell.outputs||[]){
        if(o.output_type==='stream')out.push(`<div class="nb-output"><pre><code>${esc((o.text||[]).join(''))}</code></pre></div>`);
        else if(['display_data','execute_result'].includes(o.output_type)){
          const d=o.data||{};
          if(d['image/png'])out.push(`<div class="nb-output"><img src="data:image/png;base64,${Array.isArray(d['image/png'])?d['image/png'].join(''):d['image/png']}"></div>`);
          else if(d['text/html'])out.push(`<div class="nb-output">${Array.isArray(d['text/html'])?d['text/html'].join(''):d['text/html']}</div>`);
          else if(d['text/plain'])out.push(`<div class="nb-output"><pre><code>${esc(Array.isArray(d['text/plain'])?d['text/plain'].join(''):d['text/plain'])}</code></pre></div>`);
        } else if(o.output_type==='error')out.push(`<div class="nb-output nb-error"><pre><code>${esc((o.traceback||[]).join('\n').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,''))}</code></pre></div>`);
      }
      out.push('</div>');
    }
  }
  out.push('</article>');return out.join('');
}


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
          ${esc((item.text||'').trim().replace(/^(Date|Scheduled|Deadline):\s*/,'') )}
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

            <span>${esc((item.text||'').trim().replace(/^(Date|Scheduled|Deadline):\s*/,'') )}</span>
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


async function loadHomeAgendaPreview(){
  try{
    const items=await window.workbench.getOrgAgenda();

    const upcoming=[];
    let currentDate='';

    for(const item of (items||[])){
      if(item.type==='date'){
        currentDate=(item.text||'').trim();
        continue;
      }

      if(item.type==='item'){
        upcoming.push({
          ...item,
          agendaDate:currentDate
        });

        if(upcoming.length>=3)break;
      }
    }

    const doc=preview.contentDocument;
    if(!doc)return;

    const box=doc.getElementById('homeAgendaPreview');
    if(!box)return;

    if(!upcoming.length){
      box.innerHTML=`
        <div class="home-agenda-label">Upcoming</div>
        <div class="home-agenda-empty">Nothing scheduled soon.</div>
      `;
      return;
    }

    box.innerHTML=`
      <div class="home-agenda-label">Upcoming</div>

      ${upcoming.map(item=>`
        <div class="home-agenda-item">
          <span class="home-agenda-date">
            ${esc(item.agendaDate||'')}
          </span>
          <span class="home-agenda-text">
            ${esc((item.text||'').trim())}
          </span>
        </div>
      `).join('')}
    `;
  }catch(err){
    const doc=preview.contentDocument;
    const box=doc && doc.getElementById('homeAgendaPreview');

    if(box){
      box.innerHTML=`
        <div class="home-agenda-label">Upcoming</div>
        <div class="home-agenda-empty">Agenda unavailable.</div>
      `;
    }
  }
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


function homeDashboard(){
  const today=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date());
  return `<main class="home-dashboard">
    <section class="home-hero">
      <div>
        <div class="home-kicker">LOCAL-FIRST ACADEMIC WORKSPACE</div>
        <h1>Norcini Workbench</h1>
        <p>One place to navigate research, teaching, notes, documents, code, and a real Bash terminal without moving the underlying files.</p>
      </div>
      <div class="home-badge">All local.<br><strong>Always yours.</strong></div>
    </section>

    <section class="home-grid">
      <div class="home-card">
        <div class="home-card-label">Today</div>
        <h2>${esc(today)}</h2>

        <a href="#" class="wb-link" data-kind="file" data-path="org:/home.org">Open home.org <span>→</span></a>
        <a href="#" class="wb-link" data-kind="file" data-path="org:/inbox.org">Process Org inbox <span>→</span></a>
        <a href="#" class="wb-link" data-kind="file" data-path="org:/master.org">Open master.org <span>→</span></a>

        <div id="homeAgendaPreview" class="home-agenda-preview">
          <div class="home-agenda-label">Upcoming</div>
          <div class="home-agenda-loading">Loading…</div>
        </div>

        <a href="#" class="agenda-open">
          View 60-day agenda <span>→</span>
        </a>
      </div>

      <div class="home-card">
        <div class="home-card-label">Research projects</div>
        <h2>Projects</h2>
        <a href="#" class="wb-link" data-kind="dir" data-path="hopkins:/projects/damicm/">DAMIC-M <span>→</span></a>
        <a href="#" class="wb-link" data-kind="dir" data-path="hopkins:/projects/ccd_discovery/">CCD Discovery <span>→</span></a>
        <a href="#" class="wb-link" data-kind="dir" data-path="hopkins:/projects/idg/">IDG <span>→</span></a>
        <a href="#" class="wb-link" data-kind="dir" data-path="hopkins:/projects/rxtr_skippers/">RXTR Skippers <span>→</span></a>
      </div>

      <div class="home-card">
        <div class="home-card-label">Teaching</div>
        <h2>Current course</h2>
        <a href="#" class="wb-link" data-kind="dir" data-path="hopkins:/teaching/2026/as_171_301/">AS.171.301 <span>→</span></a>
        <p class="home-card-note">Browse lecture notes, LaTeX, PDFs, figures, code, and course materials directly from the filesystem.</p>
      </div>

      <div class="home-card">
        <div class="home-card-label">Org library</div>
        <h2>Notes & context</h2>
        <div class="home-chip-row">
          <a href="#" class="home-chip wb-link" data-kind="dir" data-path="org:/library/meetings/">Meetings</a>
          <a href="#" class="home-chip wb-link" data-kind="dir" data-path="org:/library/lab_notebook/">Lab notebook</a>
          <a href="#" class="home-chip wb-link" data-kind="dir" data-path="org:/library/reference/">Reference</a>
          <a href="#" class="home-chip wb-link" data-kind="dir" data-path="org:/library/teaching/">Teaching</a>
        </div>
      </div>
    </section>
<section class="home-card syntax-guide-card">
      <div class="home-card-label">Reference</div>

      <details class="syntax-details">
        <summary>
          <span>
            <strong>Org Syntax Guide</strong>
            <small>Headings, tasks, links, formatting, dates, LaTeX, and code blocks.</small>
          </span>
          <span class="syntax-expand">Open guide →</span>
        </summary>

        <div class="syntax-guide">

          <div class="syntax-section">
            <h3>Structure</h3>
            <div class="syntax-row"><code>* Heading</code><span>Heading</span></div>
            <div class="syntax-row"><code>** Subheading</code><span>Subheading</span></div>
            <div class="syntax-row"><code>- item</code><span>Bullet</span></div>
            <div class="syntax-row"><code>- [ ] item</code><span>Checkbox</span></div>
          </div>

          <div class="syntax-section">
            <h3>Tasks</h3>
            <div class="syntax-row"><code>* TODO Task</code><span>Open task</span></div>
            <div class="syntax-row"><code>* DONE Task</code><span>Completed task</span></div>
            <div class="syntax-row"><code>SCHEDULED: &lt;2026-09-21 Mon&gt;</code><span>Scheduled</span></div>
            <div class="syntax-row"><code>DEADLINE: &lt;2026-09-25 Fri&gt;</code><span>Deadline</span></div>
          </div>

          <div class="syntax-section">
            <h3>Formatting</h3>
            <div class="syntax-row"><code>*bold*</code><span>Bold</span></div>
            <div class="syntax-row"><code>/italic/</code><span>Italic</span></div>
            <div class="syntax-row"><code>~code~</code><span>Inline code</span></div>
            <div class="syntax-row"><code>\\( E = mc^2 \\)</code><span>Inline LaTeX</span></div>
          </div>

          <div class="syntax-section">
            <h3>Links</h3>
            <div class="syntax-row"><code>[[file:notes.org][Notes]]</code><span>File link</span></div>
            <div class="syntax-row"><code>[[My heading]]</code><span>Internal link</span></div>
            <div class="syntax-row"><code>[[https://example.com][Site]]</code><span>Web link</span></div>
          </div>

        </div>

        <div class="syntax-extra">
          <div class="syntax-row"><code>&lt;2026-09-21 Mon&gt;</code><span>Active date</span></div>
          <div class="syntax-row"><code>1. item</code><span>Numbered list</span></div>
          <div class="syntax-row"><code>\\[ E = mc^2 \\]</code><span>Display LaTeX</span></div>

          <pre class="syntax-code"><code>#+begin_src python
print("hello")
#+end_src</code></pre>
        </div>
      </details>
    </section>

    <section class="home-shortcuts">
      <div>
        <strong>Filesystem</strong>
        <span>Canonical projects, documents, data, code, and teaching files.</span>
      </div>
      <div>
        <strong>Org</strong>
        <span>Canonical notes, tasks, meetings, logs, and navigation.</span>
      </div>
      <div>
        <strong>Terminal</strong>
        <span>Real Bash PTY for Python, LaTeX, notebooks, Git, and shell tools.</span>
      </div>
    </section>
  


</main>`;
}

async function showHome(record=true){
  if(!(await maybeAbandon())) return;
  isHome=true;
  currentPath=null;
  currentHash=null;
  markDirty(false);
  editor.readOnly=true;
  editor.value='';
  editorTitle.textContent='Quick edit';
  setEditorVisible(false);
  document.querySelectorAll('.file-row').forEach(r=>r.classList.remove('selected'));
  updateContextActions();
  if(record) recordLocation('home','home'); else updateNavigation();
  preview.removeAttribute('src');
  preview.srcdoc=previewShell(homeDashboard());

  preview.onload=()=>{
    loadHomeAgendaPreview();
  };
}

function previewShell(body){
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#fff;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  .doc{max-width:920px;margin:0 auto;padding:28px 36px 90px}h1,h2,h3,h4{line-height:1.25;margin:24px 0 12px}h1{font-size:2em;border-bottom:1px solid #d8dee4;padding-bottom:.3em}h2{font-size:1.5em;border-bottom:1px solid #d8dee4;padding-bottom:.3em}
  p,.bullet,.check-row,.task-row{font-size:15px;line-height:1.6;margin:6px 0}.spacer{height:6px}.bullet{padding-left:14px}
  pre{background:#f6f8fa;border:1px solid #d8dee4;border-radius:6px;padding:14px;overflow:auto;font:12.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#eff1f3;border-radius:4px;padding:.1em .25em}pre code{background:transparent;padding:0}
  a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}.task-row,.check-row{display:flex;align-items:flex-start;gap:8px}.checkbox-toggle-row{cursor:pointer}.checkbox-toggle-row:hover{background:#f6f8fa;border-radius:5px}.task-toggle{border:0;background:transparent;font-size:18px;line-height:1;padding:2px;color:#57606a;cursor:pointer}.task-status{font-size:11px;border:1px solid #d0d7de;border-radius:999px;padding:1px 6px;margin-top:3px}.task-status.done{color:#1a7f37;background:#dafbe1}.task-status.todo{color:#9a6700;background:#fff8c5}.done-text{text-decoration:line-through;color:#8c959f}.timestamp{color:#6e7781;font-size:12px;margin:3px 0 8px}.nb-output{margin:8px 0 18px;padding-left:16px;border-left:3px solid #d8dee4}.nb-output img{max-width:100%}.nb-error{border-left-color:#cf222e}
  .pdf{position:fixed;inset:0;border:0;width:100%;height:100%}.image{max-width:100%;height:auto;display:block;margin:20px auto}
  .home-dashboard{max-width:1080px;margin:0 auto;padding:34px 38px 80px}.home-hero{display:flex;justify-content:space-between;gap:40px;align-items:flex-start;padding:4px 0 28px;border-bottom:1px solid #d8dee4}.home-kicker{font-size:11px;font-weight:700;letter-spacing:.08em;color:#57606a;margin-bottom:8px}.home-hero h1{font-size:34px;border:0;margin:0 0 8px;padding:0}.home-hero p{font-size:16px;line-height:1.55;color:#57606a;max-width:720px;margin:0}.home-badge{font-size:13px;line-height:1.5;color:#57606a;text-align:right;white-space:nowrap;padding-top:4px}.home-badge strong{color:#1f2328}.home-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.home-card{border:1px solid #d8dee4;border-radius:10px;padding:18px;background:#fff;box-shadow:0 1px 0 rgba(31,35,40,.03)}.home-card-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#656d76}.home-card h2{font-size:18px;border:0;padding:0;margin:5px 0 12px}.wb-link{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-top:1px solid #f0f1f2;font-size:14px}.wb-link:first-of-type{border-top:0}.home-card-note{font-size:13px;color:#656d76;margin-top:8px}.home-chip-row{display:flex;flex-wrap:wrap;gap:7px}.home-chip{display:inline-block;border:1px solid #d0d7de;background:#f6f8fa;border-radius:999px;padding:5px 9px;font-size:12px}.home-shortcuts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.home-shortcuts>div{padding:14px 16px;background:#f6f8fa;border-radius:8px}.home-shortcuts strong{display:block;font-size:13px;margin-bottom:4px}.home-shortcuts span{font-size:12px;color:#656d76;line-height:1.45}@media(max-width:800px){.home-grid,.home-shortcuts{grid-template-columns:1fr}.home-hero{display:block}.home-badge{text-align:left;margin-top:14px}}


  .home-agenda-preview{margin-top:14px;padding-top:12px;border-top:1px solid #d8dee4}
  .home-agenda-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#656d76;margin-bottom:5px}
  .home-agenda-date{display:block;font-size:10px;font-weight:600;color:#656d76;margin-bottom:1px}.home-agenda-text{display:block}.home-agenda-item{font-size:12px;line-height:1.45;color:#24292f;padding:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .home-agenda-loading,.home-agenda-empty{font-size:12px;color:#8c959f;padding:3px 0}
  .agenda-open{display:flex;justify-content:space-between;gap:16px;padding:8px 0;margin-top:4px;border-top:1px solid #f0f1f2;font-size:14px}

  .syntax-guide-card{grid-column:auto;margin-top:16px}
  .syntax-guide{display:grid;grid-template-columns:1fr 1fr;gap:20px 32px;margin-top:4px}
  .syntax-section h3{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#656d76}
  .syntax-row{display:grid;grid-template-columns:minmax(165px,auto) 1fr;gap:12px;align-items:center;padding:6px 0;border-top:1px solid #f0f1f2;font-size:13px}
  .syntax-row code{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f6f8fa;border:1px solid #d8dee4;border-radius:5px;padding:3px 6px;white-space:nowrap}
  .syntax-row span{color:#656d76}
  .syntax-more{margin-top:16px;border-top:1px solid #d8dee4;padding-top:12px}
  .syntax-more summary{cursor:pointer;color:#0969da;font-size:13px;font-weight:600}
  .syntax-extra{margin-top:10px;max-width:620px}
  .syntax-code{margin:12px 0 0;padding:12px}
  @media(max-width:800px){.syntax-guide{grid-template-columns:1fr}.syntax-row{grid-template-columns:1fr;gap:3px}.syntax-row code{width:max-content;max-width:100%;white-space:normal}}


  .syntax-guide-card{grid-column:auto;margin-top:16px}
  .syntax-guide-card:has(.syntax-details[open]){grid-column:1/-1}
  .syntax-details summary{display:flex;align-items:center;justify-content:space-between;gap:20px;cursor:pointer;list-style:none;margin-top:5px}
  .syntax-details summary::-webkit-details-marker{display:none}
  .syntax-details summary strong{display:block;font-size:18px;color:#1f2328}
  .syntax-details summary small{display:block;margin-top:6px;font-size:13px;line-height:1.45;color:#656d76;font-weight:400}
  .syntax-expand{font-size:13px;color:#0969da;white-space:nowrap}
  .syntax-details[open] .syntax-expand{font-size:0}
  .syntax-details[open] .syntax-expand:after{content:"Close guide ↑";font-size:13px}
  .syntax-details[open] summary{padding-bottom:16px;border-bottom:1px solid #d8dee4;margin-bottom:18px}
  .syntax-guide{display:grid;grid-template-columns:1fr 1fr;gap:20px 32px}
  .syntax-extra{margin-top:20px;border-top:1px solid #d8dee4;padding-top:14px}


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

  </style></head><body>${body}<script>
  document.addEventListener('click',e=>{
    const t=e.target.closest('.task-toggle');if(t){e.preventDefault();parent.postMessage({type:'toggleTask',line:Number(t.dataset.line),kind:t.dataset.kind},'*');return}
    const c=e.target.closest('.checkbox-toggle-row');if(c){e.preventDefault();parent.postMessage({type:'toggleTask',line:Number(c.dataset.line),kind:'checkbox'},'*');return}
    const w=e.target.closest('a[data-web]');if(w){e.preventDefault();parent.postMessage({type:'openWeb',url:w.dataset.web},'*');return}
    const f=e.target.closest('.org-file-link');if(f){e.preventDefault();parent.postMessage({type:'openOrgLink',target:f.dataset.target},'*');return}
    const p=e.target.closest('.wb-link');if(p){e.preventDefault();parent.postMessage({type:'openWorkbenchPath',path:p.dataset.path,kind:p.dataset.kind},'*');return}
    const a=e.target.closest('.agenda-open');if(a){e.preventDefault();parent.postMessage({type:'openAgenda'},'*');return}
    const r=e.target.closest('.agenda-refresh');if(r){e.preventDefault();parent.postMessage({type:'refreshAgenda'},'*');return}
    const i=e.target.closest('.agenda-item-link');if(i){e.preventDefault();parent.postMessage({type:'openAgendaItem',path:i.dataset.agendaPath,line:Number(i.dataset.agendaLine||1)},'*');return}
  });
  <\/script></body></html>`;
}
async function refreshPreview(){
  if(!currentPath){if(isHome){preview.srcdoc=previewShell(homeDashboard())}else{preview.srcdoc=previewShell('<article class="doc"><h1>Norcini Workbench</h1><p>Select a file.</p></article>')}return}
  const ext=extOf(currentPath);
  const info=await window.workbench.fileInfo(currentPath);
  if(ext==='.pdf'){
    preview.removeAttribute('srcdoc');
    preview.src=info.fileUrl+'?v='+Date.now()+'#view=FitH&navpanes=0&toolbar=0';
    return;
  }
  if(['.png','.jpg','.jpeg','.gif','.webp','.svg'].includes(ext)){preview.removeAttribute('src');preview.srcdoc=previewShell(`<article class="doc"><img class="image" src="${info.fileUrl}"></article>`);return}
  if(ext==='.tex' && info.siblingPdf){
    preview.removeAttribute('srcdoc');
    preview.src=info.siblingPdf+'?v='+Date.now()+'#view=FitH&navpanes=0&toolbar=0';
    return;
  }
  preview.removeAttribute('src');
  let text=editor.value;
  if(!dirty || editor.readOnly){
    try{text=(await window.workbench.readFile(currentPath)).content}catch{}
  }
  let body;
  if(ext==='.org')body=renderOrg(text);
  else if(ext==='.md')body=renderMarkdown(text);
  else if(ext==='.ipynb')body=renderNotebook(text);
  else body=`<article class="doc"><h1>${esc(currentPath.split('/').pop())}</h1><pre><code>${esc(text)}</code></pre></article>`;
  preview.srcdoc=previewShell(body);
}
window.addEventListener('message',async e=>{
  if(!e.data)return;
  if(e.data.type==='toggleTask'){
    let scrollY=0;

    try{
      scrollY=preview.contentWindow.scrollY||0;
    }catch{}

    suppressFsReloadUntil=Date.now()+1000;

    const res=await window.workbench.toggleOrgLine({
      path:currentPath,
      lineIndex:e.data.line,
      kind:e.data.kind
    });

    editor.value=res.content;
    currentHash=res.sha256;
    markDirty(false);

    await refreshPreview();

    const restoreScroll=()=>{
      try{
        preview.contentWindow.scrollTo({
          top:scrollY,
          left:0,
          behavior:'instant'
        });
      }catch{
        try{
          preview.contentWindow.scrollTo(0,scrollY);
        }catch{}
      }
    };

    preview.addEventListener('load',restoreScroll,{once:true});
    setTimeout(restoreScroll,25);
}else if(e.data.type==='openWeb'){
    window.workbench.openExternal(e.data.url);
  }else if(e.data.type==='openWorkbenchPath'){
    try{if(e.data.kind==='dir')await loadDir(e.data.path);else await openFile(e.data.path)}catch(err){showToast(err.message,true)}
  }else if(e.data.type==='openAgenda'){
    await showAgenda();

  }else if(e.data.type==='refreshAgenda'){
    await showAgenda();

  }else if(e.data.type==='openAgendaItem'){
    try{
      await openFile(e.data.path);

      const line=Math.max(1,Number(e.data.line||1));

      setTimeout(()=>{
        try{
          const lines=editor.value.split('\n');

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
  }else if(e.data.type==='openOrgLink'){
    try{
      const resolved=await window.workbench.resolveOrgLink({currentPath,target:e.data.target});
      if(resolved.type==='dir') await loadDir(resolved.path);
      else await openFile(resolved.path);
    }catch(err){showToast(err.message,true)}
  }
});
async function openContext(vpath){
  contextTarget=vpath;contextMenu.showModal();
}
document.getElementById('ctxRename').onclick=async()=>{
  contextMenu.close();const old=contextTarget.split('/').pop();const name=prompt('Rename to:',old);if(!name)return;
  try{const r=await window.workbench.rename({path:contextTarget,name});await loadDir(dirname(r.path));if(currentPath===contextTarget)await openFile(r.path)}catch(e){showToast(e.message,true)}
};
document.getElementById('ctxTrash').onclick=async()=>{
  contextMenu.close();if(!confirm(`Move ${contextTarget.split('/').pop()} to Trash?`))return;
  try{await window.workbench.trash(contextTarget);if(currentPath===contextTarget){currentPath=null;editor.value='';await refreshPreview()}await loadDir(currentDir)}catch(e){showToast(e.message,true)}
};
document.getElementById('ctxReveal').onclick=()=>{contextMenu.close();window.workbench.reveal(contextTarget)};
document.getElementById('ctxMove').onclick=async()=>{
  contextMenu.close();const dest=prompt('Move to Workbench folder (example org:/library/reference/):',currentDir);if(!dest)return;
  try{const r=await window.workbench.move({path:contextTarget,destinationDir:dest});await loadDir(currentDir);showToast(`Moved to ${r.path}`)}catch(e){showToast(e.message,true)}
};

async function createTerminal(){
  terminalStatus.textContent='starting…';
  terminalStatus.classList.remove('ok','bad');

  try{
    const ping=await window.workbench.terminalPing();
    if(!ping.ok || !ping.nodePtyLoaded || !ping.bashExists){
      throw new Error(`Terminal backend unavailable: ${JSON.stringify(ping)}`);
    }

    if(terminalId){
      try{await window.workbench.terminalWrite({id:terminalId,data:'exit\r'})}catch{}
    }

    fitAddon.fit();
    const created=await window.workbench.terminalCreate({
      cwdVirtual:currentDir,
      cols:term.cols,
      rows:term.rows
    });

    if(created.error) throw new Error(created.error);

    terminalId=created.id;
    terminalStatus.textContent='connected';
    terminalStatus.classList.add('ok');

    const host=document.getElementById('terminal');
    host.setAttribute('tabindex','0');
    host.focus();
    term.focus();

    // Force a visible round-trip through the PTY.
    await window.workbench.terminalWrite({
      id:terminalId,
      data:"printf '\\n[Workbench Bash ready] '; pwd; printf '\\n'\r"
    });
  }catch(err){
    terminalId=null;
    terminalStatus.textContent='ERROR';
    terminalStatus.classList.add('bad');
    term.writeln('');
    term.writeln('[Terminal startup failed]');
    term.writeln(String(err && err.message ? err.message : err));
    term.writeln('');
    showToast('Terminal startup failed. See terminal pane.',true);
  }
}
function resizeTerminal(){if(terminalId){fitAddon.fit();window.workbench.terminalResize({id:terminalId,cols:term.cols,rows:term.rows})}}
// Native xterm keyboard forwarding.
// 0.7.3 proved the PTY backend is connected. Let xterm now handle
// normal typing, Tab, arrows, Ctrl-C, Ctrl-D, etc.
term.onData(async data=>{
  if(!terminalId) await createTerminal();
  if(terminalId) await window.workbench.terminalWrite({id:terminalId,data});
});

const terminalHost = document.getElementById('terminal');
terminalHost.addEventListener('mousedown',()=>setTimeout(()=>term.focus(),0));
terminalHost.addEventListener('click',()=>term.focus());

window.workbench.onTerminalData(({id,data})=>{if(id===terminalId)term.write(data)});
window.workbench.onTerminalExit(({id})=>{if(id===terminalId){term.write('\r\n[terminal exited]\r\n');terminalId=null}});

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
});
window.addEventListener('resize',()=>setTimeout(resizeTerminal,50));

async function sendBuildCommand(){
  if(!currentPath)return;
  if(
    dirty &&
    !(await saveCurrent({buildLatex:false}))
  )return;
  try{
    const cmd=await window.workbench.buildCommand(currentPath);
    if(!terminalId)await createTerminal();
    await window.workbench.terminalWrite({id:terminalId,data:cmd+'\r'});
    showToast('Sent to Bash terminal');
  }catch(e){showToast(e.message,true)}
}
runBtn.onclick=sendBuildCommand;buildBtn.onclick=sendBuildCommand;runNotebookBtn.onclick=sendBuildCommand;

latestOutputBtn.onclick=async()=>{
  if(!currentPath)return;

  try{
    const result=
      await window.workbench.latestGeneratedOutput(currentPath);

    if(!result.found){
      showToast(
        'No PDF or image found in this directory.',
        true
      );
      return;
    }

    await openFile(result.path);
    showToast(`Opened ${result.name}`);
  }catch(err){
    showToast(err.message||String(err),true);
  }
};

document.getElementById('terminalHereBtn').onclick=async()=>{
  try{
    if(!terminalId) await createTerminal();
    if(!terminalId) return;
    await window.workbench.terminalCwd({
      id:terminalId,
      cwdVirtual:currentPath||currentDir
    });
    await window.workbench.terminalWrite({
      id:terminalId,
      data:"printf '\\n[Terminal here] '; pwd; printf '\\n'\r"
    });
    const host=document.getElementById('terminal');
    host.setAttribute('tabindex','0');
    host.focus();
    term.focus();
  }catch(err){
    term.writeln('');
    term.writeln('[Terminal here failed] '+String(err.message||err));
    showToast('Terminal here failed',true);
  }
};
document.getElementById('terminalRestartBtn').onclick=createTerminal;

document.getElementById('saveBtn').onclick=saveCurrent;
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveCurrent()}});
document.getElementById('refreshPreviewBtn').onclick=refreshPreview;
backBtn.onclick=()=>goHistory(-1);
forwardBtn.onclick=()=>goHistory(1);
openDefaultBtn.onclick=async()=>{if(!currentPath)return;try{await window.workbench.openDefault(currentPath)}catch(e){showToast(e.message,true)}};
document.getElementById('toggleEditorBtn').onclick=()=>setEditorVisible(!editorVisible);
document.getElementById('homeBtn').onclick=()=>showHome();
document.querySelectorAll('.root-tab').forEach(btn=>btn.onclick=async()=>{
  document.querySelectorAll('.root-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');await loadDir(btn.dataset.root)
});
document.getElementById('newFolderBtn').onclick=()=>{
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

document.getElementById('newNoteBtn').onclick=()=>{
  document.getElementById('noteDate').value=new Date().toISOString().slice(0,10);dialogNote.showModal();document.getElementById('noteTitle').focus()
};
document.getElementById('cancelNoteBtn').onclick=()=>dialogNote.close();
document.getElementById('newNoteForm').onsubmit=async e=>{
  e.preventDefault();
  try{
    const r=await window.workbench.newNote({
      category:document.getElementById('noteCategory').value,
      title:document.getElementById('noteTitle').value,
      dated:document.getElementById('noteDated').checked,
      date:document.getElementById('noteDate').value
    });
    dialogNote.close();document.getElementById('noteTitle').value='';await loadDir(dirname(r.path));await openFile(r.path);setEditorVisible(true)
  }catch(err){showToast(err.message,true)}
};

window.workbench.onFsChanged(()=>{
  clearTimeout(fsTimer);

  fsTimer=setTimeout(async()=>{
    try{
      await loadDir(currentDir,false);
    }catch{}

    if(
      currentPath &&
      !dirty &&
      Date.now()>=suppressFsReloadUntil
    ){
      try{
        await openFile(currentPath,false);
      }catch{}
    }
  },300);
});

function setupResizers(){
  const root=document.documentElement;
  const fv=document.getElementById('filesResize');
  fv.onmousedown=e=>{e.preventDefault();const move=ev=>root.style.setProperty('--files-w',Math.max(180,ev.clientX)+'px');const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);localStorage.filesW=getComputedStyle(root).getPropertyValue('--files-w')};window.addEventListener('mousemove',move);window.addEventListener('mouseup',up)};
  const er=document.getElementById('editorResize');
  er.onmousedown=e=>{e.preventDefault();const start=e.clientX;const pane=document.getElementById('editorPane');const w0=pane.getBoundingClientRect().width;const move=ev=>root.style.setProperty('--editor-w',Math.max(260,w0+ev.clientX-start)+'px');const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);localStorage.editorW=getComputedStyle(root).getPropertyValue('--editor-w')};window.addEventListener('mousemove',move);window.addEventListener('mouseup',up)};
  const tr=document.getElementById('terminalResize');
  tr.onmousedown=e=>{e.preventDefault();const start=e.clientY;const h0=document.getElementById('terminalPane').getBoundingClientRect().height;const move=ev=>{root.style.setProperty('--terminal-h',Math.max(120,h0+start-ev.clientY)+'px');resizeTerminal()};const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);localStorage.termH=getComputedStyle(root).getPropertyValue('--terminal-h')};window.addEventListener('mousemove',move);window.addEventListener('mouseup',up)};
  if(localStorage.filesW)root.style.setProperty('--files-w',localStorage.filesW);
  if(localStorage.editorW)root.style.setProperty('--editor-w',localStorage.editorW);
  if(localStorage.termH)root.style.setProperty('--terminal-h',localStorage.termH);
}

(async()=>{
  setupResizers();setEditorVisible(false);
  await loadDir('org:/',false);
  await showHome();
  updateNavigation();
  await createTerminal();
})();
