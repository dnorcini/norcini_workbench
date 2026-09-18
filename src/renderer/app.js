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

const workspace = document.getElementById('workspace');
const tree = document.getElementById('fileTree');
const breadcrumbs = document.getElementById('breadcrumbs');
const editor = document.getElementById('editor');
const editorTitle = document.getElementById('editorTitle');
const dirtyDot = document.getElementById('dirtyDot');
const preview = document.getElementById('preview');
const toastEl = document.getElementById('toast');
const dialogNote = document.getElementById('newNoteDialog');
const contextMenu = document.getElementById('contextMenu');

const runBtn = document.getElementById('runBtn');
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
  runBtn.hidden=!['.py','.r','.sh','.bash','.zsh'].includes(ext);
  buildBtn.hidden=ext!=='.tex';
  runNotebookBtn.hidden=ext!=='.ipynb';
}
function updateNavigation(){
  backBtn.disabled=navIndex<=0;
  forwardBtn.disabled=navIndex<0||navIndex>=navHistory.length-1;
  activePath.textContent=currentPath||currentDir||'Norcini Workbench';
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
  try{const item=navHistory[navIndex];if(item.type==='dir')await loadDir(item.path,false);else await openFile(item.path,false)}
  finally{navigatingHistory=false;updateNavigation()}
}
async function loadDir(vpath,record=true){
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
async function saveCurrent(){
  if(!currentPath||editor.readOnly)return true;
  const result=await window.workbench.saveFile({path:currentPath,content:editor.value,expectedHash:currentHash});
  if(result.conflict){
    showToast('File changed outside Workbench. Reload or compare before saving.',true);
    return false;
  }
  currentHash=result.sha256;markDirty(false);showToast('Saved');
  await refreshPreview();
  return true;
}
editor.addEventListener('input',()=>{
  markDirty(true);
  if(!['.pdf','.ipynb'].includes(extOf(currentPath))) debouncePreview();
});
let previewTimer=null;
function debouncePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(refreshPreview,300)}

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
      out.push(`<div class="check-row"><button class="task-toggle" data-line="${i}" data-kind="checkbox">${done?'☑':'☐'}</button><span class="${done?'done-text':''}">${orgInline(m[2])}</span></div>`);return;
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
function previewShell(body){
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#fff;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  .doc{max-width:920px;margin:0 auto;padding:28px 36px 90px}h1,h2,h3,h4{line-height:1.25;margin:24px 0 12px}h1{font-size:2em;border-bottom:1px solid #d8dee4;padding-bottom:.3em}h2{font-size:1.5em;border-bottom:1px solid #d8dee4;padding-bottom:.3em}
  p,.bullet,.check-row,.task-row{font-size:15px;line-height:1.6;margin:6px 0}.spacer{height:6px}.bullet{padding-left:14px}
  pre{background:#f6f8fa;border:1px solid #d8dee4;border-radius:6px;padding:14px;overflow:auto;font:12.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#eff1f3;border-radius:4px;padding:.1em .25em}pre code{background:transparent;padding:0}
  a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}.task-row,.check-row{display:flex;align-items:flex-start;gap:8px}.task-toggle{border:0;background:transparent;font-size:18px;line-height:1;padding:2px;color:#57606a;cursor:pointer}.task-status{font-size:11px;border:1px solid #d0d7de;border-radius:999px;padding:1px 6px;margin-top:3px}.task-status.done{color:#1a7f37;background:#dafbe1}.task-status.todo{color:#9a6700;background:#fff8c5}.done-text{text-decoration:line-through;color:#8c959f}.timestamp{color:#6e7781;font-size:12px;margin:3px 0 8px}.nb-output{margin:8px 0 18px;padding-left:16px;border-left:3px solid #d8dee4}.nb-output img{max-width:100%}.nb-error{border-left-color:#cf222e}
  .pdf{position:fixed;inset:0;border:0;width:100%;height:100%}.image{max-width:100%;height:auto;display:block;margin:20px auto}
  </style></head><body>${body}<script>
  document.addEventListener('click',e=>{
    const t=e.target.closest('.task-toggle');if(t){e.preventDefault();parent.postMessage({type:'toggleTask',line:Number(t.dataset.line),kind:t.dataset.kind},'*');return}
    const w=e.target.closest('a[data-web]');if(w){e.preventDefault();parent.postMessage({type:'openWeb',url:w.dataset.web},'*');return}
    const f=e.target.closest('.org-file-link');if(f){e.preventDefault();parent.postMessage({type:'openOrgLink',target:f.dataset.target},'*');return}
  });
  <\/script></body></html>`;
}
async function refreshPreview(){
  if(!currentPath){preview.srcdoc=previewShell('<article class="doc"><h1>Norcini Workbench</h1><p>Select a file.</p></article>');return}
  const ext=extOf(currentPath);
  const info=await window.workbench.fileInfo(currentPath);
  if(ext==='.pdf'){
    preview.removeAttribute('srcdoc');
    preview.src=info.fileUrl+'#view=FitH&navpanes=0&toolbar=0';
    return;
  }
  if(['.png','.jpg','.jpeg','.gif','.webp','.svg'].includes(ext)){preview.removeAttribute('src');preview.srcdoc=previewShell(`<article class="doc"><img class="image" src="${info.fileUrl}"></article>`);return}
  if(ext==='.tex' && info.siblingPdf){
    preview.removeAttribute('srcdoc');
    preview.src=info.siblingPdf+'#view=FitH&navpanes=0&toolbar=0';
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
    const res=await window.workbench.toggleOrgLine({path:currentPath,lineIndex:e.data.line,kind:e.data.kind});
    editor.value=res.content;currentHash=res.sha256;markDirty(false);await refreshPreview();
  }else if(e.data.type==='openWeb'){
    window.workbench.openExternal(e.data.url);
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
window.addEventListener('resize',()=>setTimeout(resizeTerminal,50));

async function sendBuildCommand(){
  if(!currentPath)return;
  if(dirty && !(await saveCurrent()))return;
  try{
    const cmd=await window.workbench.buildCommand(currentPath);
    if(!terminalId)await createTerminal();
    await window.workbench.terminalWrite({id:terminalId,data:cmd+'\r'});
    showToast('Sent to Bash terminal');
  }catch(e){showToast(e.message,true)}
}
runBtn.onclick=sendBuildCommand;buildBtn.onclick=sendBuildCommand;runNotebookBtn.onclick=sendBuildCommand;

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
document.getElementById('refreshFilesBtn').onclick=()=>loadDir(currentDir,false);
backBtn.onclick=()=>goHistory(-1);
forwardBtn.onclick=()=>goHistory(1);
openDefaultBtn.onclick=async()=>{if(!currentPath)return;try{await window.workbench.openDefault(currentPath)}catch(e){showToast(e.message,true)}};
document.getElementById('toggleEditorBtn').onclick=()=>setEditorVisible(!editorVisible);
document.getElementById('homeBtn').onclick=async()=>{await loadDir('org:/');try{await openFile('org:/home.org')}catch{}};
document.querySelectorAll('.root-tab').forEach(btn=>btn.onclick=async()=>{
  document.querySelectorAll('.root-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');await loadDir(btn.dataset.root)
});
document.getElementById('newFolderBtn').onclick=async()=>{
  const name=prompt('New folder name:');if(!name)return;
  try{await window.workbench.newFolder({parent:currentDir,name});await loadDir(currentDir)}catch(e){showToast(e.message,true)}
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
  clearTimeout(fsTimer);fsTimer=setTimeout(async()=>{
    try{await loadDir(currentDir,false)}catch{}
    if(currentPath && !dirty){try{await openFile(currentPath,false)}catch{}}
  },300)
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
  await loadDir('org:/');
  try{await openFile('org:/home.org')}catch{await refreshPreview()}
  updateNavigation();
  await createTerminal();
})();