let currentPath = null;
let currentOrgTodoStates = ['TODO','DONE','NEXT','WAITING','CANCELLED','SOMEDAY','ACTIVE','IDEA'];
let currentDir = 'org:/';
let currentHash = null;
let dirty = false;
let editRevision = 0;
let editorVisible = false;
let contextTarget = null;
let terminalId = null;
let fsTimer = null;
let navHistory = [];
let navIndex = -1;
let navigatingHistory = false;
let isHome = true;
let homeShortcuts = {hero:{},cards:[]};
let homeShortcutsHash = null;
let inlineRenderId = 0;
let helpReturnNavIndex = null;
let suppressFsReloadUntil = 0;
let inlineHistory = [];
let inlineHistoryIndex = -1;
let applyingInlineHistory = false;
const lastRunStartedAt = new Map();

const workspace = document.getElementById('workspace');
const tree = document.getElementById('fileTree');
const breadcrumbs = document.getElementById('breadcrumbs');
const editor = document.getElementById('editor');
const editorHighlight = document.getElementById('editorHighlight');
const editorTitle = document.getElementById('editorTitle');
const dirtyDot = document.getElementById('dirtyDot');
const preview = document.getElementById('preview');
const homeSettingsDialog = document.getElementById('homeSettingsDialog');
const homeSettingsForm = document.getElementById('homeSettingsForm');
const homeCardEditor = document.getElementById('homeCardEditor');
const homeSettingsError = document.getElementById('homeSettingsError');
let editingHomeCards = [];
let editingHomeHero = {};
const toastEl = document.getElementById('toast');
const dialogNote = document.getElementById('newNoteDialog');
const createItemDialog = document.getElementById('createItemDialog');
const createItemForm = document.getElementById('createItemForm');
const createItemType = document.getElementById('createItemType');
const createItemName = document.getElementById('createItemName');
const contextMenu = document.getElementById('contextMenu');
const systemCheckDialog = document.getElementById('systemCheckDialog');
const systemCheckResults = document.getElementById('systemCheckResults');

function resetInlineHistory(value){
  inlineHistory=[String(value??'')];
  inlineHistoryIndex=0;
}
function recordInlineHistory(){
  if(applyingInlineHistory)return;
  const value=editor.value;
  if(inlineHistory[inlineHistoryIndex]===value)return;
  inlineHistory=inlineHistory.slice(0,inlineHistoryIndex+1);
  inlineHistory.push(value);
  inlineHistoryIndex+=1;
}
async function moveInlineHistory(delta){
  const target=inlineHistoryIndex+delta;
  if(target<0||target>=inlineHistory.length)return;
  applyingInlineHistory=true;
  editor.value=inlineHistory[target];
  inlineHistoryIndex=target;
  applyingInlineHistory=false;
  markDirty(true);
  scheduleInlineSave();
  await refreshPreview({preserveScroll:true});
}

const helpMenu=document.getElementById('helpMenu');

if(helpMenu){
  const popover=helpMenu.querySelector('.help-popover');
  if(popover){
    popover.innerHTML=`
      <div class="help-section">
        <strong>Workbench commands</strong>
        <div><code>wb FILE</code><span>Open file in Workbench</span></div>
        <div><code>wb .</code><span>Open terminal directory</span></div>
        <div><code>open -n -a "Norcini Workbench"</code><span>Open an independent instance</span></div>
      </div>

      <div class="help-section">
        <strong>Keyboard Shortcuts</strong>
        <div><code>⌘S / Ctrl-S</code><span>Save current file</span></div>
        <div><code>Esc</code><span>Close Help</span></div>
      </div>

      <div class="help-section">
        <strong>Rendered Org / Markdown</strong>
        <div><code>Enter</code><span>Split the current rendered block</span></div>
        <div><code>Backspace / Delete</code><span>Join adjacent blocks at their boundaries</span></div>
        <div><code>⌘S / Ctrl-S</code><span>Save rendered edits</span></div>
      </div>

      <div class="help-section">
        <strong>Quick Edit</strong>
        <div><code>Enter</code><span>Continue a non-empty bullet, checkbox, or numbered list</span></div>
        <div><code>Enter on empty item</code><span>Exit the list</span></div>
      </div>

      <div class="help-section">
        <strong>Terminal Bash</strong>
        <div><code>Tab</code><span>Shell completion</span></div>
        <div><code>↑ / ↓</code><span>Shell command history</span></div>
        <div><code>Ctrl-C</code><span>Interrupt the current command</span></div>
        <div><code>Ctrl-D</code><span>Send EOF or exit a shell</span></div>
      </div>

      <div class="help-section">
        <strong>Run from terminal</strong>
        <div><code>python3 a.py</code><span>Run Python</span></div>
        <div><code>Rscript a.R</code><span>Run R</span></div>
        <div><code>bash a.sh</code><span>Run shell script</span></div>
        <div><code>gcc a.c -o a</code><span>Compile C</span></div>
        <div><code>g++ a.cpp -o a</code><span>Compile C++</span></div>
        <div><code>./a</code><span>Run compiled program</span></div>
        <div><code>root -l -q a.C</code><span>Run ROOT macro</span></div>
        <div><code>root -l -q 'a.C+'</code><span>Compile ROOT macro with ACLiC</span></div>
        <div><code>pdflatex a.tex</code><span>Build a LaTeX PDF directly</span></div>
        <div><code>latexmk -pdf a.tex</code><span>Optional multi-pass LaTeX build</span></div>
      </div>

      <div class="help-section">
        <strong>Org syntax</strong>
        <div><code>* Heading</code><span>Heading</span></div>
        <div><code>* TODO Task</code><span>Task</span></div>
        <div><code>* DONE Task</code><span>Completed task</span></div>
        <div><code>* NEXT Task</code><span>Custom TODO state</span></div>
        <div><code>* WAITING Task</code><span>Custom TODO state</span></div>
        <div><code>* SOMEDAY Task</code><span>Custom TODO state</span></div>
        <div><code>* CANCELLED Task</code><span>Custom TODO state</span></div>
        <div><code>* ACTIVE Task</code><span>Custom TODO state</span></div>
        <div><code>* IDEA Task</code><span>Custom TODO state</span></div>
        <div><code>#+TODO: TODO NEXT | DONE</code><span>Declare file-specific states</span></div>
        <div><code>- [ ] Item</code><span>Checkbox</span></div>
        <div><code>SCHEDULED:</code><span>Scheduled date</span></div>
        <div><code>DEADLINE:</code><span>Deadline</span></div>
        <div><code>[[file:path][Label]]</code><span>File link</span></div>
        <div><a href="#" class="full-org-guide-link">Full Org Syntax Guide →</a><span>Open on Home</span></div>
        <div><a href="#" class="system-check-link">System Check →</a><span>Check this Mac and Workbench setup</span></div>
      </div>
    `;

    popover.querySelector('.full-org-guide-link').addEventListener('click',async e=>{
      e.preventDefault();
      helpMenu.removeAttribute('open');
      helpReturnNavIndex=navIndex;
      await showHome();
      if(!isHome) return;
      const revealGuide=()=>{
        const guide=preview.contentDocument?.querySelector('.syntax-details');
        if(guide){
          guide.open=true;
          guide.scrollIntoView({block:'start'});
        }
      };
      const onHomeLoad=preview.onload;
      preview.onload=event=>{
        onHomeLoad?.(event);
        revealGuide();
      };
      setTimeout(revealGuide,100);
    });

    popover.querySelector('.system-check-link').addEventListener('click',async e=>{
      e.preventDefault();
      helpMenu.removeAttribute('open');
      await showSystemCheck();
    });

  }

  // Clicking anywhere outside closes Help.
  document.addEventListener('click',e=>{
    if(helpMenu.open && !helpMenu.contains(e.target)){
      helpMenu.removeAttribute('open');
    }
  });

  // Escape closes Help.
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && helpMenu.open){
      helpMenu.removeAttribute('open');
    }
  });
}


const runBtn = document.getElementById('runBtn');
const buildBtn = document.getElementById('buildBtn');
const runNotebookBtn = document.getElementById('runNotebookBtn');
const terminalStatus = document.getElementById('terminalStatus');
const activePath = document.getElementById('activePath');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const openDefaultBtn = document.getElementById('openDefaultBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

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
function highlightSource(){
  if(!editorHighlight)return;
  const ext=extOf(currentPath);
  const enabled=['.org','.md'].includes(ext)&&editorVisible&&!editor.readOnly;
  editorHighlight.hidden=!enabled;
  editor.style.color=enabled?'transparent':'var(--text)';
  editor.style.webkitTextFillColor=enabled?'transparent':'var(--text)';
  if(!enabled)return;
  const state='TODO|DONE|NEXT|WAITING|CANCELLED|SOMEDAY|ACTIVE|IDEA';
  const html=String(editor.value).split('\n').map(line=>{
    let x=esc(line)||' ';
    if(ext==='.org'){
      x=x.replace(/^(\*+)(\s+)/,'<span class="source-heading">$1</span>$2');
      x=x.replace(new RegExp(`(^|\\s)(${state})(?=\\s|$)`,'g'),'$1<span class="source-state">$2</span>');
      x=x.replace(/\b(SCHEDULED|DEADLINE|CLOSED):/g,'<span class="source-planning">$1:</span>');
      x=x.replace(/(\[\[[^\]]+\](?:\[[^\]]+\])?\])/g,'<span class="source-link">$1</span>');
      x=x.replace(/(^|\s)(#[^\s].*)$/,'$1<span class="source-comment">$2</span>');
      x=x.replace(/(~[^~\n]+~)/g,'<span class="source-code">$1</span>');
    }else{
      x=x.replace(/^(#{1,6})(\s+)/,'<span class="source-heading">$1</span>$2');
      x=x.replace(/(\[[^\]]+\]\([^)]+\))/g,'<span class="source-link">$1</span>');
      x=x.replace(/(`[^`\n]+`)/g,'<span class="source-code">$1</span>');
      x=x.replace(/(\*\*[^*\n]+\*\*|(?<!\w)\*[^*\n]+\*(?!\w))/g,'<span class="source-emphasis">$1</span>');
    }
    return x;
  }).join('\n');
  editorHighlight.innerHTML=html;
  editorHighlight.scrollTop=editor.scrollTop;
  editorHighlight.scrollLeft=editor.scrollLeft;
}
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
  if(value)editRevision++;
  dirty=value; dirtyDot.hidden=!dirty;
}
function setEditorVisible(show){
  editorVisible=show;
  workspace.classList.toggle('editor-hidden',!show);
  document.getElementById('toggleEditorBtn').textContent=show?'Hide source':(currentPath?'Show source':'Quick edit');
  highlightSource();
  setTimeout(()=>{fitAddon.fit(); resizeTerminal();},50);
}
function updateContextActions(){
  const ext=extOf(currentPath);
  runBtn.hidden=![
    '.py','.r','.sh','.bash','.zsh',
    '.c','.cpp','.cc','.cxx'
  ].includes(ext);
  buildBtn.hidden=ext!=='.tex';
  runNotebookBtn.hidden=ext!=='.ipynb';
  openDefaultBtn.disabled=!currentPath;
  exportPdfBtn.hidden=!currentPath||!['.org','.md'].includes(ext);
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
  try{const item=navHistory[navIndex];if(item.type==='home')await showHome(false,true);else if(item.type==='dir')await loadDir(item.path,false,false,true);else await openFile(item.path,false,true)}
  finally{navigatingHistory=false;updateNavigation()}
}
async function syncTerminalToPath(vpath){
  if(!terminalId || !vpath)return;
  try{
    await window.workbench.terminalCwd({
      id:terminalId,
      cwdVirtual:vpath
    });
  }catch{}
}

async function loadDir(vpath,record=true,preserveView=false,skipAbandon=false){
  if(!preserveView&&!skipAbandon&&!(await maybeAbandon()))return;
  const data=await window.workbench.listDir(vpath);
  if(!preserveView){
    isHome=false;
    currentPath=null;
    currentHash=null;
    markDirty(false);
    editor.value='';
    editorTitle.textContent='Quick edit';
    editor.readOnly=true;
    setEditorVisible(false);
    updateContextActions();
    document.querySelectorAll('.file-row').forEach(r=>r.classList.remove('selected'));
  }
  currentDir=data.path.endsWith('/')?data.path:data.path+'/';
  if(record) recordLocation('dir',currentDir); else updateNavigation();
  breadcrumbs.textContent=currentDir;
  if(!currentPath&&!isHome){
    preview.removeAttribute('src');
    preview.srcdoc=previewShell(`<article class="doc"><h1>${esc(currentDir)}</h1><p>Select a file from Files.</p></article>`);
  }
  tree.innerHTML='';
  if(!/^[^:]+:\/$/.test(currentDir)){
    const up=document.createElement('div');
    up.className='file-row';up.innerHTML='<span class="file-icon">↩</span><span class="file-name">..</span>';
    up.onclick=async()=>{
      const target=dirname(currentDir);
      await loadDir(target);
      await syncTerminalToPath(target);
    };
    tree.appendChild(up);
  }
  for(const item of data.items){
    const row=document.createElement('div');
    row.className='file-row';row.dataset.path=item.path;
    row.innerHTML=`<span class="file-icon">${item.type==='dir'?'▸':'•'}</span><span class="file-name">${esc(item.name)}</span><button class="file-more">•••</button>`;
    row.onclick=async(e)=>{
      if(e.target.classList.contains('file-more')) return;
      if(item.type==='dir'){
        await loadDir(item.path);
        await syncTerminalToPath(item.path);
      }else{
        await openFile(item.path);
        await syncTerminalToPath(item.path);
      }
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
async function openFile(vpath,record=true,skipAbandon=false){
  const switching=currentPath!==vpath;
  if(switching&&!skipAbandon&&!(await maybeAbandon()))return;
  const data=await window.workbench.readFile(vpath);
  isHome=false;
  currentPath=vpath;currentHash=data.sha256;markDirty(false);
  if(record) recordLocation('file',vpath); else updateNavigation();
  document.querySelectorAll('.file-row').forEach(r=>r.classList.toggle('selected',r.dataset.path===vpath));
  editorTitle.textContent=vpath;
  editor.readOnly=data.binary;
  editor.value=data.binary?'(Binary file: use rendered view)':''+data.content;
  resetInlineHistory(editor.value);
  highlightSource();
  editor.scrollTop=0;
  editor.scrollLeft=0;
  editor.selectionStart=0;
  editor.selectionEnd=0;
  currentDir=dirname(vpath);
  updateContextActions();
  if(switching){
    const ext=extOf(vpath);
    const renderFirst=['.org','.md','.ipynb','.pdf','.png','.jpg','.jpeg','.gif','.webp','.svg'].includes(ext);
    const showSource=!data.binary&&!renderFirst;
    setEditorVisible(showSource);
  }
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

let saveQueue=Promise.resolve();
async function saveCurrentNow(options={},request){
  const quiet=!!options.quiet;
  const buildLatex=options.buildLatex!==false;

  if(!request?.path||request.readOnly)return true;

  const savingPath=request.path;
  const savingRevision=request.revision;

  suppressFsReloadUntil=Date.now()+5000;

  const result=await window.workbench.saveFile({
    path:savingPath,
    content:request.content,
    expectedHash:currentPath===savingPath?currentHash:request.expectedHash
  });

  if(result.conflict){
    showToast(
      'File changed outside Workbench. Reload or compare before saving.',
      true
    );
    return false;
  }

  if(currentPath===savingPath)currentHash=result.sha256;
  if(currentPath===savingPath&&editRevision===savingRevision)markDirty(false);

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
function saveCurrent(options={}){
  const request={
    path:currentPath,
    content:editor.value,
    expectedHash:currentHash,
    revision:editRevision,
    readOnly:editor.readOnly
  };
  if(!request.path||request.readOnly)return Promise.resolve(true);
  const run=saveQueue.then(
    ()=>saveCurrentNow(options,request),
    ()=>saveCurrentNow(options,request)
  );
  saveQueue=run.catch(()=>{});
  return run;
}

let autoSaveTimer=null;
let previewTimer=null;

editor.addEventListener('input',()=>{
  highlightSource();
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
editor.addEventListener('scroll',()=>{
  if(!editorHighlight)return;
  editorHighlight.scrollTop=editor.scrollTop;
  editorHighlight.scrollLeft=editor.scrollLeft;
});

function debouncePreview(){
  clearTimeout(previewTimer);
  previewTimer=setTimeout(()=>refreshPreview({preserveScroll:true}),300);
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

  if(m && !m[4].trim()){
    e.preventDefault();
    editor.setRangeText('',lineStart,start,'end');
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    return;
  }

    if(!continuation){
      m=line.match(/^(\s*)([-+*])\s+(.*)$/);

      if(m && m[3].trim()){
        continuation=`\n${m[1]}${m[2]} `;
      }
      if(m && !m[3].trim()){
        e.preventDefault();
        editor.setRangeText('',lineStart,start,'end');
        editor.dispatchEvent(new Event('input',{bubbles:true}));
        return;
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
  x=x.replace(/(^|[^\w])(SCHEDULED|DEADLINE|CLOSED):/gi,'$1<span class="org-planning-key">$2:</span>');
  x=x.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g,'<strong>$1</strong>');
  x=x.replace(/~([^~\n]+)~/g,'<code>$1</code>');
  x=x.replace(/\\\\/g,'<br>');
  return x;
}
function inlineEditAttrs(line){return `data-inline-line="${line}" data-inline-render="${inlineRenderId}"`}
function markdownInline(s,imageUrls={}){
  const images=[];
  const imageTokenized=String(s).replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,target)=>{
    const index=images.push({alt,target})-1;
    return `\u0000IMG${index}\u0000`;
  });
  let x=esc(imageTokenized);
  images.forEach((image,index)=>{
    const src=imageUrls[image.target]||imageUrls[decodeURIComponent(image.target)]||'';
    const replacement=src
      ? `<img class="markdown-image" src="${esc(src)}" alt="${esc(image.alt)}">`
      : esc(`![${image.alt}](${image.target})`);
    x=x.replace(`\u0000IMG${index}\u0000`,replacement);
  });
  x=x.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  x=x.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  x=x.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g,'<em>$1</em>');
  x=x.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g,'<em>$1</em>');
  x=x.replace(/&lt;br&gt;/gi,'<br>');
  return x;
}
function orgTodoStates(lines){
  const states=new Set(['TODO','DONE','NEXT','WAITING','CANCELLED','SOMEDAY','ACTIVE','IDEA']);
  lines.forEach(line=>{
    const declaration=line.match(/^#\+(?:TODO|SEQ_TODO):\s*(.*)$/i);
    if(!declaration)return;
    declaration[1].split(/\s+/).forEach(token=>{if(token&&token!=='|')states.add(token.toUpperCase())});
  });
  return [...states];
}
function orgTableCells(line){
  const body=line.trim().replace(/^\|/,'').replace(/\|$/,'');
  return body.split('|').map(cell=>cell.trim());
}
function orgTableSeparator(cells){
  return cells.length>0&&cells.every(cell=>/^[-+:]+$/.test(cell));
}
function renderOrg(text){
  const lines=text.split(/\r?\n/);const states=orgTodoStates(lines);const statePattern=states.map(state=>state.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');const headingState=new RegExp(`^(\\*+)\\s+(${statePattern})(?:\\s+(.*))?$`,'i');const out=['<article class="doc" contenteditable="true" spellcheck="true">'];let inSrc=false,src=[],lang='',tableEnd=-1;
  lines.forEach((line,i)=>{
    if(i<tableEnd)return;
    if(inSrc){
      if(/^\s*#\+end_src/i.test(line)){out.push(`<pre contenteditable="false"><code>${esc(src.join('\n'))}</code></pre>`);inSrc=false;src=[];return}
      src.push(line);return;
    }
    let m=line.match(/^\s*#\+begin_src\s*([A-Za-z0-9_+-]*)/i);
    if(m){inSrc=true;lang=m[1]||'';return}
    m=line.match(/^#\+TITLE:\s*(.*)$/i);if(m){out.push(`<h1 ${inlineEditAttrs(i)}>${orgInline(m[1])}</h1>`);return}
    if(/^#\+/.test(line))return;
    if(/^\s*\|/.test(line)&&!/^\s*\|?\s*[-+:]+(?:\s*\|\s*[-+:]+)+\s*\|?\s*$/.test(line)&&(i===0||!/^\s*\|/.test(lines[i-1]||''))){
      const rows=[];let end=i;
      while(end<lines.length&&/^\s*\|/.test(lines[end])){rows.push(orgTableCells(lines[end]));end++}
      tableEnd=end;
      const body=rows.map((cells,rowIndex)=>{
        if(orgTableSeparator(cells))return '';
        const tag=rowIndex===0?'th':'td';
        return `<tr>${cells.map(cell=>`<${tag}>${orgInline(cell)||'&nbsp;'}</${tag}>`).join('')}</tr>`;
      }).filter(Boolean).join('');
      out.push(`<table class="org-table" contenteditable="false"><tbody>${body}</tbody></table>`);
      return;
    }
    if(/^\s*-{3,}\s*$/.test(line)){out.push(`<div class="rule-line" ${inlineEditAttrs(i)}>${esc(line.trim())}</div>`);return}
    m=line.match(/^\s*(SCHEDULED|DEADLINE|CLOSED):\s*(<[^>]+>.*)$/i);
    if(m){out.push(`<div class="org-planning" ${inlineEditAttrs(i)}><span class="org-planning-key">${esc(m[1].toUpperCase())}:</span> <span>${esc(m[2])}</span></div>`);return}
    m=line.match(headingState);
    if(m){
      const state=m[2].toLowerCase();
      const done=state==='done';
      const toggle=(state==='todo'||done)?`<button contenteditable="false" class="task-toggle" data-line="${i}" data-kind="todo">${done?'☑':'☐'}</button>`:'';
      out.push(`<div class="task-row task-level-${Math.min(m[1].length,5)}">${toggle}<span contenteditable="false" class="task-status ${state==='done'?'done':''} task-status-${state}">${m[2]}</span><span class="task-text ${done?'done-text':''}" ${inlineEditAttrs(i)}>${orgInline(m[3]||'')}</span></div>`);
      return;
    }
    m=line.match(/^(\*+)\s+(.*)$/);if(m){const l=Math.min(m[1].length+1,6);out.push(`<h${l} ${inlineEditAttrs(i)}>${orgInline(m[2])}</h${l}>`);return}
    m=line.match(/^\s*[-+]\s+\[([ Xx])\]\s+(.*)$/);if(m){
      const done=m[1].toLowerCase()==='x';
      out.push(`<div class="check-row checkbox-toggle-row" data-line="${i}"><button contenteditable="false" type="button" class="task-toggle" data-line="${i}" data-kind="checkbox">${done?'☑':'☐'}</button><span class="${done?'done-text':''}" ${inlineEditAttrs(i)}>${orgInline(m[2])}</span></div>`);return;
    }
    m=line.match(/^\s*[-+]\s+(.*)$/);if(m){out.push(`<div class="bullet"><span ${inlineEditAttrs(i)}>${orgInline(m[1])}</span></div>`);return}
    if(/^\s+\S/.test(line)&&/^\s*[-+]\s+/.test(lines[i-1]||'')){out.push(`<div class="org-continuation"><span ${inlineEditAttrs(i)}>${orgInline(line.trim())}</span></div>`);return}
    if(/^\s*\[[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(line)){out.push(`<div class="timestamp" ${inlineEditAttrs(i)}>${esc(line.trim())}</div>`);return}
    if(!line.trim()){out.push(`<div class="spacer inline-blank" ${inlineEditAttrs(i)}></div>`);return}
    out.push(`<p ${inlineEditAttrs(i)}>${orgInline(line)}</p>`);
  });
  out.push('</article>');return out.join('\n');
}
function renderMarkdown(text,editable=false,imageUrls={}){
  const out=[`<article class="doc"${editable?' contenteditable="true" spellcheck="true"':''}>`];let code=false,buf=[];
  text.split(/\r?\n/).forEach((line,i)=>{
    const attrs=editable?inlineEditAttrs(i):'';
    if(line.startsWith('```')){if(code){out.push(`<pre contenteditable="false"><code>${esc(buf.join('\n'))}</code></pre>`);buf=[]}code=!code;return}
    if(code){buf.push(line);return}
    if(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)){out.push(`<div class="rule-line" ${attrs}>${esc(line.trim())}</div>`);return}
    const m=line.match(/^(#{1,6})\s+(.*)$/);if(m){out.push(`<h${m[1].length} ${attrs}>${markdownInline(m[2],imageUrls)}</h${m[1].length}>`);return}
    if(/^\s*[-*+]\s+/.test(line)){out.push(`<div class="bullet"><span ${attrs}>${markdownInline(line.replace(/^\s*[-*+]\s+/,''),imageUrls)}</span></div>`);return}
    if(/^\s+\S/.test(line)&&/^\s*[-*+]\s+/.test(text.split(/\r?\n/)[i-1]||'')){out.push(`<div class="bullet-continuation"><span ${attrs}>${markdownInline(line.trim(),imageUrls)}</span></div>`);return}
    out.push(line.trim()?`<p ${attrs}>${markdownInline(line,imageUrls)}</p>`:editable?`<div class="spacer inline-blank" ${attrs}></div>`:'<div class="spacer"></div>');
  });
  out.push('</article>');return out.join('\n');
}
function renderNotebook(text){
  let nb;
  try{nb=JSON.parse(text)}catch{
    return '<article class="doc notebook"><h1>Notebook could not be rendered</h1><p>The .ipynb file is not valid JSON. Open Quick edit to inspect it.</p></article>';
  }
  const cells=nb && Array.isArray(nb.cells)?nb.cells:[];
  const asText=value=>Array.isArray(value)?value.join(''):String(value??'');
  const out=[
    '<article class="doc notebook">',
    '<header class="nb-header"><h1>Notebook</h1><p>Run all cells executes this notebook in order. Successful runs save outputs to the .ipynb file; progress and errors appear in the Bash terminal.</p></header>'
  ];
  if(!cells.length)out.push('<div class="nb-empty">This notebook has no cells yet.</div>');
  cells.forEach((cell,index)=>{
    if(!cell || typeof cell!=='object')return;
    const source=asText(cell.source);
    if(cell.cell_type==='markdown'){
      out.push(`<section class="nb-markdown" aria-label="Markdown cell ${index+1}">${renderMarkdown(source).replace(/^<article class="doc">|<\/article>$/g,'')}</section>`);
      return;
    }
    if(cell.cell_type!=='code')return;

    const count=cell.execution_count==null?' ':esc(cell.execution_count);
    const outputs=Array.isArray(cell.outputs)?cell.outputs:[];
    out.push(`<section class="nb-cell"><div class="nb-cell-label"><span>Code cell ${index+1}</span><span>In [${count}]</span></div><pre class="nb-source"><code>${esc(source)}</code></pre>`);
    if(!outputs.length)out.push('<p class="nb-no-output">No saved output</p>');
    for(const output of outputs){
      if(!output || typeof output!=='object')continue;
      if(output.output_type==='stream'){
        const stderr=output.name==='stderr';
        out.push(`<div class="nb-output ${stderr?'nb-stderr':''}"><div class="nb-output-label">${stderr?'stderr':'stdout'}</div><pre><code>${esc(asText(output.text))}</code></pre></div>`);
      }else if(['display_data','execute_result'].includes(output.output_type)){
        const data=output.data||{};
        let content='';
        if(data['image/png'])content=`<img src="data:image/png;base64,${asText(data['image/png'])}" alt="Notebook output image">`;
        else if(data['text/html'])content=asText(data['text/html']);
        else if(data['text/plain'])content=`<pre><code>${esc(asText(data['text/plain']))}</code></pre>`;
        if(content)out.push(`<div class="nb-output"><div class="nb-output-label">Result</div>${content}</div>`);
      }else if(output.output_type==='error'){
        const traceback=Array.isArray(output.traceback)?output.traceback.join('\n'):asText(output.traceback);
        const fallback=[output.ename,output.evalue].filter(Boolean).join(': ');
        const message=(traceback||fallback).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
        out.push(`<div class="nb-output nb-error"><div class="nb-output-label">Error</div><pre><code>${esc(message)}</code></pre></div>`);
      }
    }
    out.push('</section>');
  });
  out.push('</article>');
  return out.join('');
}

async function resolveMarkdownImages(text){
  const targets=[...String(text||'').matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match=>match[1]);
  const entries=await Promise.all(targets.map(async target=>{
    try{
      const resolved=await window.workbench.resolveOrgLink({currentPath,target});
      if(resolved.type!=='file')return null;
      const info=await window.workbench.fileInfo(resolved.path);
      if(!['.png','.jpg','.jpeg','.gif','.webp','.svg'].includes(info.ext))return null;
      const image=await window.workbench.readImageData(resolved.path);
      return [target,image.dataUrl];
    }catch{return null}
  }));
  return Object.fromEntries(entries.filter(Boolean));
}


function agendaDisplayText(text){
  return String(text||'')
    .trim()
    .replace(/\s+(?:SCHEDULED|DEADLINE):\s*<[^>]+>\s*$/i,'')
    .replace(/\s+<\d{4}-\d{2}-\d{2}(?:\s+[^>]*)?>\s*$/,'')
    .trim();
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
      const vpath=item.virtualPath||null;

      if(vpath){
        html+=`
          <a href="#"
             class="agenda-item agenda-item-link"
             data-agenda-path="${esc(vpath)}"
             data-agenda-line="${Number(item.line||1)}">

            <span>${esc(agendaDisplayText(item.text))}</span>
            <span class="agenda-arrow">→</span>

          </a>
        `;
      }else{
        html+=`
          <div class="agenda-item">
            <span>${esc(agendaDisplayText(item.text))}</span>
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

        if(upcoming.length>=6)break;
      }
    }

    const doc=preview.contentDocument;
    if(!doc)return;

    const boxes=doc.querySelectorAll('.home-agenda-preview');
    if(!boxes.length)return;

    if(!upcoming.length){
      boxes.forEach(box=>box.innerHTML=`
        <div class="home-agenda-label">Upcoming</div>
        <div class="home-agenda-empty">Nothing scheduled soon.</div>
      `);
      return;
    }

    const html=`
      <div class="home-agenda-label">Upcoming</div>

      ${upcoming.map(item=>`
        <div class="home-agenda-item">
          <span class="home-agenda-date">
            ${esc(item.agendaDate||'')}
          </span>
          <span class="home-agenda-text">
            ${esc(agendaDisplayText(item.text))}
          </span>
        </div>
      `).join('')}
    `;
    boxes.forEach(box=>box.innerHTML=html);
  }catch(err){
    const doc=preview.contentDocument;
    if(doc){
      doc.querySelectorAll('.home-agenda-preview').forEach(box=>box.innerHTML=`
        <div class="home-agenda-label">Upcoming</div>
        <div class="home-agenda-empty">Agenda unavailable.</div>
      `);
    }
  }
}

async function loadRecentNotesPreview(){
  try{
    const notes=await window.workbench.getRecentNotes();
    if(!isHome)return;
    const doc=preview.contentDocument;
    if(!doc)return;
    const html=`<div class="home-agenda-label">Recently edited notes</div>`+
      (notes.length?notes.map(note=>`<a href="#" class="wb-link" data-kind="file" data-path="${esc(note.path)}">${esc(note.name)} <span>${esc(new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(note.mtimeMs)))}</span></a>`).join('')
        :'<div class="home-agenda-empty">No notes found in the Org library.</div>');
    doc.querySelectorAll('.recent-notes-preview').forEach(box=>box.innerHTML=html);
  }catch{
    const doc=preview.contentDocument;
    doc?.querySelectorAll('.recent-notes-preview').forEach(box=>box.innerHTML='<div class="home-agenda-label">Recently edited notes</div><div class="home-agenda-empty">Recent notes unavailable.</div>');
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

async function showSystemCheck(){
  systemCheckDialog.showModal();
  systemCheckResults.textContent='Checking…';
  try{
    const report=await window.workbench.diagnostics();
    systemCheckResults.innerHTML=report.checks.map(check=>
      `<div class="system-check-row"><strong class="system-check-status ${esc(check.status)}">${esc(check.status.toUpperCase())}</strong><span>${esc(check.label)}</span><code>${esc(check.detail)}</code></div>`
    ).join('');
  }catch(err){
    systemCheckResults.innerHTML=`<div class="system-check-row"><strong class="system-check-status broken">BROKEN</strong><span>Diagnostics</span><code>${esc(err.message||String(err))}</code></div>`;
  }
}


function renderHomeCardEditor(){
  const scroll=homeCardEditor.scrollTop;
  homeCardEditor.innerHTML=`<section class="home-editor-card">
    <div class="home-editor-heading"><strong>Home header</strong></div>
    <div class="home-editor-fields">
      <label>Small heading<input data-home-field="kicker" value="${esc(editingHomeHero.kicker)}"></label>
      <label>Main title<input data-home-field="title" value="${esc(editingHomeHero.title)}"></label>
      <label class="wide">Description<input data-home-field="description" value="${esc(editingHomeHero.description)}"></label>
      <label>Right text, first line<input data-home-field="badgeTop" value="${esc(editingHomeHero.badgeTop)}"></label>
      <label>Right text, second line<input data-home-field="badgeBottom" value="${esc(editingHomeHero.badgeBottom)}"></label>
    </div>
  </section>`+editingHomeCards.map((card,index)=>`<section class="home-editor-card">
    <div class="home-editor-heading"><strong>Card ${index+1}</strong>
      <button type="button" data-action="up" data-card="${index}" ${index===0?'disabled':''} title="Move up">↑</button>
      <button type="button" data-action="down" data-card="${index}" ${index===editingHomeCards.length-1?'disabled':''} title="Move down">↓</button>
      <button type="button" data-action="remove-card" data-card="${index}" class="danger">Remove</button>
    </div>
    <div class="home-editor-fields">
      <label>Section label<input data-card="${index}" data-field="label" value="${esc(card.label)}" required></label>
      <label>Title<input data-card="${index}" data-field="title" value="${esc(card.title)}" required></label>
      <label class="wide">Note (optional)<input data-card="${index}" data-field="note" value="${esc(card.note||'')}"></label>
    </div>
    <div class="home-editor-options">
      <label><input type="checkbox" data-card="${index}" data-field="showAgenda" ${card.showAgenda?'checked':''}> Show agenda</label>
      <label><input type="checkbox" data-card="${index}" data-field="showRecentNotes" ${card.showRecentNotes?'checked':''}> Show recent notes</label>
      <label>Links as <select data-card="${index}" data-field="style"><option value="links" ${card.style!=='chips'?'selected':''}>Rows</option><option value="chips" ${card.style==='chips'?'selected':''}>Chips</option></select></label>
    </div>
    <div class="home-editor-links">
      <strong>Links</strong>
      ${card.links.map((link,linkIndex)=>`<div class="home-editor-link">
        <input class="link-label" aria-label="Link label" data-card="${index}" data-link="${linkIndex}" data-field="label" value="${esc(link.label)}" placeholder="Label" required>
        <input class="link-path" aria-label="Workbench path" data-card="${index}" data-link="${linkIndex}" data-field="path" value="${esc(link.path)}" placeholder="hopkins:/folder/" required>
        <select aria-label="Link type" data-card="${index}" data-link="${linkIndex}" data-field="kind"><option value="dir" ${link.kind==='dir'?'selected':''}>Folder</option><option value="file" ${link.kind==='file'?'selected':''}>File</option></select>
        <button type="button" data-action="link-up" data-card="${index}" data-link="${linkIndex}" ${linkIndex===0?'disabled':''} title="Move link up">↑</button>
        <button type="button" data-action="link-down" data-card="${index}" data-link="${linkIndex}" ${linkIndex===card.links.length-1?'disabled':''} title="Move link down">↓</button>
        <button type="button" data-action="remove-link" data-card="${index}" data-link="${linkIndex}" class="danger" title="Remove link">×</button>
      </div>`).join('')}
      <button type="button" data-action="add-link" data-card="${index}">+ Add link</button>
    </div>
  </section>`).join('');
  homeCardEditor.scrollTop=scroll;
}

homeCardEditor.addEventListener('input',event=>{
  const target=event.target;
  if(target.dataset.homeField){editingHomeHero[target.dataset.homeField]=target.value;return}
  if(!target.dataset.field)return;
  const card=editingHomeCards[Number(target.dataset.card)];
  const entry=target.dataset.link===undefined?card:card.links[Number(target.dataset.link)];
  entry[target.dataset.field]=target.type==='checkbox'?target.checked:target.value;
});
homeCardEditor.addEventListener('change',event=>{
  if(event.target.matches('select,input[type="checkbox"]'))event.target.dispatchEvent(new Event('input',{bubbles:true}));
});
homeCardEditor.addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');
  if(!button)return;
  const index=Number(button.dataset.card);
  const card=editingHomeCards[index];
  if(button.dataset.action==='up'&&index>0)[editingHomeCards[index-1],editingHomeCards[index]]=[card,editingHomeCards[index-1]];
  if(button.dataset.action==='down'&&index<editingHomeCards.length-1)[editingHomeCards[index+1],editingHomeCards[index]]=[card,editingHomeCards[index+1]];
  if(button.dataset.action==='remove-card')editingHomeCards.splice(index,1);
  if(button.dataset.action==='add-link')card.links.push({label:'',path:'',kind:'dir'});
  const linkIndex=Number(button.dataset.link);
  if(button.dataset.action==='link-up'&&linkIndex>0)[card.links[linkIndex-1],card.links[linkIndex]]=[card.links[linkIndex],card.links[linkIndex-1]];
  if(button.dataset.action==='link-down'&&linkIndex<card.links.length-1)[card.links[linkIndex+1],card.links[linkIndex]]=[card.links[linkIndex],card.links[linkIndex+1]];
  if(button.dataset.action==='remove-link')card.links.splice(linkIndex,1);
  renderHomeCardEditor();
});
document.getElementById('addHomeCardBtn').onclick=()=>{
  editingHomeCards.push({label:'',title:'',links:[],style:'links'});
  renderHomeCardEditor();
  homeCardEditor.scrollTop=homeCardEditor.scrollHeight;
};
document.getElementById('cancelHomeSettingsBtn').onclick=()=>homeSettingsDialog.close();
homeSettingsForm.onsubmit=async event=>{
  event.preventDefault();
  homeSettingsError.hidden=true;
  try{
    const result=await window.workbench.saveHomeShortcuts({config:{hero:editingHomeHero,cards:editingHomeCards},expectedHash:homeShortcutsHash});
    homeShortcuts=result.config;
    homeShortcutsHash=result.sha256;
    homeSettingsDialog.close();
    if(isHome)await showHome(false);
    showToast('Home updated');
  }catch(err){homeSettingsError.textContent=err.message||String(err);homeSettingsError.hidden=false}
};
async function openHomeSettings(){
  const result=await window.workbench.homeShortcuts();
  homeShortcutsHash=result.sha256;
  editingHomeHero=JSON.parse(JSON.stringify(result.config.hero));
  editingHomeCards=JSON.parse(JSON.stringify(result.config.cards));
  homeSettingsError.hidden=true;
  renderHomeCardEditor();
  homeSettingsDialog.showModal();
}

function homeDashboard(){
  const today=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date());
  const cards=homeShortcuts.cards.map(card=>{
    const links=card.links.map(link=>`<a href="#" class="${card.style==='chips'?'home-chip ':''}wb-link" data-kind="${esc(link.kind)}" data-path="${esc(link.path)}">${esc(link.label)}${card.style==='chips'?'':' <span>→</span>'}</a>`).join('');
    return `<div class="home-card">
      <div class="home-card-label">${esc(card.label)}</div>
      <h2>${esc(card.title==='$today'?today:card.title)}</h2>
      ${card.style==='chips'?`<div class="home-chip-row">${links}</div>`:links}
      ${card.showAgenda?`<div class="home-agenda-preview"><div class="home-agenda-label">Upcoming</div><div class="home-agenda-loading">Loading…</div></div><a href="#" class="agenda-open">View 60-day agenda <span>→</span></a>`:''}
      ${card.note?`<p class="home-card-note">${esc(card.note)}</p>`:''}
      ${card.showRecentNotes?'<div class="recent-notes-preview"><div class="home-agenda-label">Recently edited notes</div><div class="home-agenda-loading">Loading…</div></div>':''}
    </div>`;
  }).join('');
  return `<main class="home-dashboard">
    <section class="home-hero">
      <div>
        <div class="home-kicker">${esc(homeShortcuts.hero.kicker)}</div>
        <h1>${esc(homeShortcuts.hero.title)}</h1>
        <p>${esc(homeShortcuts.hero.description)}</p>
      </div>
      <div class="home-badge">${esc(homeShortcuts.hero.badgeTop)}<br><strong>${esc(homeShortcuts.hero.badgeBottom)}</strong></div>
      <button type="button" class="home-config-edit">Edit</button>
    </section>

    <section class="home-grid">
      ${cards}
    </section>
<section class="home-card syntax-guide-card">
      <div class="home-card-label">Reference</div>

      <details class="syntax-details">
        <summary>
          <span>
            <strong>Org and Markdown Syntax Guide</strong>
            <small>Supported Org and Markdown syntax, plus the current rendering behavior.</small>
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
            <div class="syntax-row"><code>---</code><span>Horizontal rule</span></div>
            <div class="syntax-row"><code>1. item</code><span>Numbered list source; Quick Edit continues it</span></div>
          </div>

          <div class="syntax-section">
            <h3>Tasks</h3>
            <div class="syntax-row"><code>* TODO Task</code><span>Open task</span></div>
            <div class="syntax-row"><code>* DONE Task</code><span>Completed task</span></div>
            <div class="syntax-row"><code>* NEXT Task</code><span>Common custom TODO state</span></div>
            <div class="syntax-row"><code>* WAITING Task</code><span>Common custom TODO state</span></div>
            <div class="syntax-row"><code>* SOMEDAY Task</code><span>Common custom TODO state</span></div>
            <div class="syntax-row"><code>* CANCELLED Task</code><span>Common custom TODO state</span></div>
            <div class="syntax-row"><code>* ACTIVE Task</code><span>Common custom TODO state</span></div>
            <div class="syntax-row"><code>* IDEA Task</code><span>Common custom TODO state</span></div>
            <div class="syntax-row"><code>#+TODO: TODO NEXT | DONE</code><span>Declare file-specific states</span></div>
            <div class="syntax-row"><code>  SCHEDULED: &lt;2026-09-21 Mon&gt;</code><span>Planning line beneath a heading</span></div>
            <div class="syntax-row"><code>  DEADLINE: &lt;2026-09-25 Fri&gt;</code><span>Planning line beneath a heading</span></div>
          </div>

          <div class="syntax-section">
            <h3>Formatting</h3>
            <div class="syntax-row"><code>*bold*</code><span>Bold</span></div>
            <div class="syntax-row"><code>/italic/</code><span>Org source syntax; not specially rendered yet</span></div>
            <div class="syntax-row"><code>~code~</code><span>Inline code</span></div>
            <div class="syntax-row"><code>\\( E = mc^2 \\)</code><span>Inline LaTeX source; preserved in rendered text</span></div>
          </div>

          <div class="syntax-section">
            <h3>Links</h3>
            <div class="syntax-row"><code>[[file:notes.org][Notes]]</code><span>File link</span></div>
            <div class="syntax-row"><code>[[My heading]]</code><span>Internal link source; label preserved</span></div>
            <div class="syntax-row"><code>[[https://example.com][Site]]</code><span>Web link</span></div>
          </div>

          <div class="syntax-section">
            <h3>Markdown</h3>
            <div class="syntax-row"><code># Heading</code><span>Heading</span></div>
            <div class="syntax-row"><code>- item</code><span>Bullet</span></div>
            <div class="syntax-row"><code>**bold**</code><span>Bold</span></div>
            <div class="syntax-row"><code>*italic*</code><span>Italic</span></div>
            <div class="syntax-row"><code>\`code\`</code><span>Inline code</span></div>
            <div class="syntax-row"><code>[Site](https://example.com)</code><span>Web link</span></div>
            <div class="syntax-row"><code>---</code><span>Horizontal rule</span></div>
          </div>

          <div class="syntax-section">
            <h3>Agenda fields</h3>
            <div class="syntax-row"><code>&lt;2026-09-21 Mon&gt;</code><span>Timestamp recognized by the agenda</span></div>
            <div class="syntax-row"><code>  SCHEDULED: &lt;...&gt;</code><span>Scheduled planning line and agenda item</span></div>
            <div class="syntax-row"><code>  DEADLINE: &lt;...&gt;</code><span>Deadline planning line and agenda item</span></div>
            <div class="syntax-row"><code>master.org / inbox.org</code><span>Files scanned by the live agenda</span></div>
          </div>

          <div class="syntax-section">
            <h3>Tables and source blocks</h3>
            <div class="syntax-row"><code>| Name | Value |</code><span>Org table rendered with links and empty cells preserved</span></div>
            <div class="syntax-row"><code>#+begin_src python</code><span>Source block rendered as read-only code</span></div>
          </div>

          <div class="syntax-section">
            <h3>LaTeX</h3>
            <div class="syntax-row"><code>pdflatex file.tex</code><span>Build a PDF directly; available fallback</span></div>
            <div class="syntax-row"><code>latexmk -pdf file.tex</code><span>Optional multi-pass build when installed</span></div>
          </div>

        </div>

        <div class="syntax-extra">
          <div class="syntax-row"><code>&lt;2026-09-21 Mon&gt;</code><span>Active date</span></div>
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

async function showHome(record=true,skipAbandon=false){
  if(!skipAbandon&&!(await maybeAbandon())) return;
  try{
    const result=await window.workbench.homeShortcuts();
    homeShortcuts=result.config;
    homeShortcutsHash=result.sha256;
    if(result.warning)showToast(result.warning,true);
  }catch(err){showToast(err.message||String(err),true)}
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
    loadRecentNotesPreview();
  };
}

function previewShell(body){
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#fff;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  [data-inline-line]{cursor:text;min-width:4px;outline:none;caret-color:#0969da}
  [data-inline-line]:hover,[data-inline-line]:focus{background:transparent}
  .inline-blank{height:12px;min-height:12px}
  .inline-blank:focus{height:20px}
  .doc{max-width:920px;margin:0 auto;padding:28px 36px 90px}h1,h2,h3,h4{line-height:1.25;margin:24px 0 12px}h1{font-size:2em}h2{font-size:1.5em}
  p,.bullet,.check-row,.task-row{font-size:15px;line-height:1.6;margin:6px 0}.spacer{height:6px}.bullet{padding-left:14px}.bullet:before{content:'•';display:inline-block;width:14px;margin-left:-14px}.org-continuation,.bullet-continuation{padding-left:14px;font-size:15px;line-height:1.6;margin:6px 0}.org-table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14px}.org-table th,.org-table td{border:1px solid #d0d7de;padding:6px 9px;text-align:left;vertical-align:top}.org-table th{background:#f6f8fa;font-weight:700}.org-table td:empty:after{content:' ';white-space:pre}.task-text,.check-row [data-inline-line]{min-width:0;flex:1;overflow-wrap:anywhere}.rule-line{height:18px;margin:18px 0 10px;border-top:1px solid #d8dee4;color:transparent;line-height:1px}.rule-line:focus{color:#57606a;outline:none}
  pre{background:#f6f8fa;border:1px solid #d8dee4;border-radius:6px;padding:14px;overflow:auto;font:12.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#eff1f3;border-radius:4px;padding:.1em .25em}pre code{background:transparent;padding:0}
  a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}.task-row,.check-row{display:flex;align-items:flex-start;gap:8px}.checkbox-toggle-row{cursor:pointer}.checkbox-toggle-row:hover{background:#f6f8fa;border-radius:5px}.task-toggle{border:0;background:transparent;font-size:18px;line-height:1;padding:2px;color:#57606a;cursor:pointer}.task-status{font-size:11px;border:1px solid #d0d7de;border-radius:999px;padding:1px 6px;margin-top:3px}.task-status.done{color:#1a7f37;background:#dafbe1}.task-status-todo{color:#9a6700;background:#fff8c5}.task-status-next{color:#0550ae;background:#ddf4ff}.task-status-waiting{color:#8250df;background:#fbefff}.task-status-cancelled{color:#8c959f;background:#f6f8fa}.task-status-someday{color:#9a6700;background:#fff8c5}.task-status-active{color:#0550ae;background:#ddf4ff}.task-status-idea{color:#8250df;background:#fbefff}.done-text{text-decoration:line-through;color:#8c959f}.timestamp{color:#6e7781;font-size:12px;margin:3px 0 8px}
  .org-planning{margin:2px 0 8px;padding-left:18px;color:#57606a;font-size:.92em}.org-planning-key{color:#0aa;font-weight:700}.task-text:empty{display:inline-block;min-width:18px;min-height:1em}.task-text:empty:before{content:' ';white-space:pre}.markdown-image{display:block;max-width:100%;height:auto;margin:12px 0}
  .notebook{max-width:1000px}.nb-header{margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid #d8dee4}.nb-header h1{border:0;margin:0 0 8px;padding:0;font-size:28px}.nb-header p{margin:0;color:#57606a;font-size:14px;line-height:1.5}
  .nb-empty{padding:28px;border:1px dashed #d0d7de;border-radius:8px;background:#f6f8fa;color:#656d76;text-align:center}
  .nb-markdown{padding:8px 16px;margin:0 0 18px;border-left:3px solid #d8dee4}.nb-markdown>:first-child{margin-top:0}
  .nb-cell{margin:0 0 22px;border:1px solid #d8dee4;border-radius:9px;overflow:hidden;background:#fff}
  .nb-cell-label{display:flex;justify-content:space-between;gap:12px;padding:9px 14px;border-bottom:1px solid #d8dee4;background:#f6f8fa;color:#57606a;font-size:12px;font-weight:600}
  .nb-source{margin:0;border:0;border-radius:0;background:#fff;padding:16px;white-space:pre;overflow:auto}
  .nb-output{padding:12px 16px;border-top:1px solid #d8dee4}.nb-output-label{margin-bottom:8px;color:#656d76;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
  .nb-output pre{margin:0;border:0;background:#f6f8fa}.nb-output img{display:block;max-width:100%;max-height:600px;width:auto;height:auto;object-fit:contain}
  .nb-stderr{background:#fff8f6}.nb-stderr pre{background:#fff1ee}.nb-error{background:#fff8f6}.nb-error .nb-output-label{color:#cf222e}.nb-error pre{background:#fff1ee;color:#a40e26}
  .nb-no-output{margin:0;padding:10px 16px;border-top:1px solid #d8dee4;color:#8c959f;font-size:12px}
  .pdf{position:fixed;inset:0;border:0;width:100%;height:100%}.image{max-width:100%;height:auto;display:block;margin:20px auto}
  .home-dashboard{max-width:1080px;margin:0 auto;padding:34px 38px 80px}.home-hero{position:relative;display:flex;justify-content:space-between;gap:40px;align-items:flex-start;padding:4px 0 72px;border-bottom:1px solid #d8dee4}.home-kicker{font-size:11px;font-weight:700;letter-spacing:.08em;color:#57606a;margin-bottom:8px}.home-hero h1{font-size:34px;border:0;margin:0 0 8px;padding:0}.home-hero p{font-size:16px;line-height:1.55;color:#57606a;max-width:720px;margin:0}.home-badge{font-size:13px;line-height:1.5;color:#57606a;text-align:right;white-space:nowrap;padding-top:4px}.home-badge strong{color:#1f2328}.home-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.home-card{border:1px solid #d8dee4;border-radius:10px;padding:18px;background:#fff;box-shadow:0 1px 0 rgba(31,35,40,.03)}.home-card-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#656d76}.home-card h2{font-size:18px;border:0;padding:0;margin:5px 0 12px}.wb-link{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-top:1px solid #f0f1f2;font-size:14px}.wb-link:first-of-type{border-top:0}.home-card-note{font-size:13px;color:#656d76;margin-top:8px}.home-chip-row{display:flex;flex-wrap:wrap;gap:7px}.home-chip{display:inline-block;border:1px solid #d0d7de;background:#f6f8fa;border-radius:999px;padding:5px 9px;font-size:12px}.home-shortcuts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.home-shortcuts>div{padding:14px 16px;background:#f6f8fa;border-radius:8px}.home-shortcuts strong{display:block;font-size:13px;margin-bottom:4px}.home-shortcuts span{font-size:12px;color:#656d76;line-height:1.45}@media(max-width:800px){.home-grid,.home-shortcuts{grid-template-columns:1fr}.home-hero{display:block}.home-badge{text-align:left;margin-top:14px}}


  .home-config-edit{position:absolute;right:0;bottom:18px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;color:#24292f;padding:6px 11px;font:inherit;font-size:12px;cursor:pointer}
  .home-config-edit:hover{background:#eaeef2}
  .home-agenda-preview{margin-top:14px;padding-top:12px;border-top:1px solid #d8dee4}
  .recent-notes-preview{margin-top:14px;padding-top:12px;border-top:1px solid #d8dee4}
  .recent-notes-preview .wb-link{font-size:12px;overflow:hidden;text-overflow:ellipsis}
  .recent-notes-preview .wb-link span{color:#656d76;white-space:nowrap}
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

  .output-gallery{max-width:1100px;margin:0 auto;padding:30px 36px 90px}
  .output-gallery h1{font-size:28px;border:0;margin:0 0 5px;padding:0}
  .output-summary{font-size:14px;color:#656d76;margin:0 0 24px}
  .output-empty{border:1px dashed #d0d7de;border-radius:10px;background:#f6f8fa;padding:42px 28px;text-align:center}
  .output-empty h2{font-size:18px;border:0;margin:0 0 8px;padding:0}
  .output-empty p{max-width:540px;margin:0 auto;color:#656d76;font-size:14px;line-height:1.55}
  .output-card{margin:0 0 24px;border:1px solid #d8dee4;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(31,35,40,.06)}
  .output-card-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid #d8dee4;background:#f6f8fa}
  .output-card-title{display:flex;align-items:center;gap:10px;min-width:0}
  .output-card-title strong{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .output-type,.output-newest{font-size:11px;color:#57606a;white-space:nowrap}
  .output-type{border:1px solid #d0d7de;border-radius:4px;padding:2px 5px;background:#fff;text-transform:uppercase}
  .output-card-actions{display:flex;gap:7px;flex-shrink:0}
  .output-action{border:1px solid #d0d7de;border-radius:6px;background:#fff;color:#24292f;padding:5px 9px;font-family:inherit;font-size:12px;line-height:1.3;cursor:pointer}
  .output-action:hover{background:#eaeef2}
  .output-media{display:flex;align-items:center;justify-content:center;min-height:220px;background:#f6f8fa}
  .output-media iframe{display:block;width:100%;height:620px;max-height:75vh;border:0;background:#fff}
  .output-media img{display:block;max-width:100%;max-height:680px;width:auto;height:auto;object-fit:contain;padding:20px}
  @media(max-width:650px){.output-gallery{padding:24px 16px 60px}.output-card-header{align-items:flex-start;flex-direction:column}.output-media iframe{height:480px}}

  </style></head><body>${body}<script>
  function inlineBlockFrom(node){
    return (node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement)?.closest('[data-inline-line]');
  }
  function activeInlineBlock(){
    const selection=window.getSelection();
    return selection?.rangeCount?inlineBlockFrom(selection.anchorNode):null;
  }
  document.addEventListener('pointerdown',()=>parent.postMessage({type:'previewPointerDown'},'*'));
  document.addEventListener('input',e=>{
    const block=inlineBlockFrom(e.target)||activeInlineBlock();
    if(block)parent.postMessage({type:'inlineInput',line:Number(block.dataset.inlineLine),renderId:Number(block.dataset.inlineRender),html:block.innerHTML},'*');
  });
  function splitInlineSelection(block){
    const selection=window.getSelection();
    if(!selection.rangeCount)return null;
    const range=selection.getRangeAt(0);
    if(!block.contains(range.startContainer)||!block.contains(range.endContainer))return null;
    const before=range.cloneRange();before.selectNodeContents(block);before.setEnd(range.startContainer,range.startOffset);
    const after=range.cloneRange();after.selectNodeContents(block);after.setStart(range.endContainer,range.endOffset);
    const html=fragment=>{const box=document.createElement('div');box.appendChild(fragment);return box.innerHTML};
    return {range,beforeHtml:html(before.cloneContents()),afterHtml:html(after.cloneContents()),beforeText:before.cloneContents().textContent,afterText:after.cloneContents().textContent};
  }
  function crossInlineSelection(){
    const selection=window.getSelection();
    if(!selection.rangeCount||selection.isCollapsed)return null;
    const range=selection.getRangeAt(0);
    const blockFor=node=>(node.nodeType===Node.ELEMENT_NODE?node:node.parentElement)?.closest('[data-inline-line]');
    const startBlock=blockFor(range.startContainer);
    const endBlock=blockFor(range.endContainer);
    if(!startBlock||!endBlock||startBlock===endBlock)return null;
    const before=document.createRange();before.selectNodeContents(startBlock);before.setEnd(range.startContainer,range.startOffset);
    const after=document.createRange();after.selectNodeContents(endBlock);after.setStart(range.endContainer,range.endOffset);
    const html=fragment=>{const box=document.createElement('div');box.appendChild(fragment);return box.innerHTML};
    return {
      startLine:Number(startBlock.dataset.inlineLine),
      endLine:Number(endBlock.dataset.inlineLine),
      beforeHtml:html(before.cloneContents()),
      afterHtml:html(after.cloneContents())
    };
  }
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){
      e.preventDefault();
      parent.postMessage({type:e.shiftKey?'inlineRedo':'inlineUndo'},'*');
      return;
    }
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){
      e.preventDefault();parent.postMessage({type:'inlineSave'},'*');return;
    }
    const block=inlineBlockFrom(e.target)||activeInlineBlock();
    if(!block||!['Enter','Backspace','Delete'].includes(e.key))return;
    if(e.key==='Enter'&&e.shiftKey){
      const split=splitInlineSelection(block);
      if(!split)return;
      e.preventDefault();
      split.range.deleteContents();
      const br=document.createElement('br');
      split.range.insertNode(br);
      split.range.setStartAfter(br);split.range.collapse(true);
      const selection=window.getSelection();
      selection.removeAllRanges();selection.addRange(split.range);
      block.dispatchEvent(new Event('input',{bubbles:true}));
      return;
    }
    if((e.key==='Backspace'||e.key==='Delete')&&!window.getSelection().isCollapsed){
      const cross=crossInlineSelection();
      if(cross){
        e.preventDefault();
        parent.postMessage({type:'inlineDeleteRange',renderId:Number(block.dataset.inlineRender),...cross},'*');
        return;
      }
    }
    const split=splitInlineSelection(block);
    if(!split)return;
    if((e.key==='Backspace'||e.key==='Delete')&&split.range.collapsed&&!split.beforeText&&!split.afterText&&block.classList.contains('task-text')){
      e.preventDefault();
      parent.postMessage({type:'inlineDeleteLine',line:Number(block.dataset.inlineLine),renderId:Number(block.dataset.inlineRender)},'*');
      return;
    }
    if(e.key==='Backspace'&&split.range.collapsed&&!split.beforeText){
      e.preventDefault();parent.postMessage({type:'inlineBackspace',line:Number(block.dataset.inlineLine),renderId:Number(block.dataset.inlineRender)},'*');return;
    }
    if(e.key==='Delete'&&split.range.collapsed&&!split.afterText){
      e.preventDefault();parent.postMessage({type:'inlineJoin',line:Number(block.dataset.inlineLine),renderId:Number(block.dataset.inlineRender),direction:'forward'},'*');return;
    }
    if(e.key!=='Enter')return;
    e.preventDefault();
    parent.postMessage({type:'inlineEnter',line:Number(block.dataset.inlineLine),renderId:Number(block.dataset.inlineRender),beforeHtml:split.beforeHtml,afterHtml:split.afterHtml},'*');
  });
  document.addEventListener('paste',e=>{
    const block=inlineBlockFrom(e.target)||activeInlineBlock();
    if(!block)return;
    const split=splitInlineSelection(block);
    if(!split)return;
    e.preventDefault();
    const value=e.clipboardData.getData('text/plain').replace(/\\r\\n?/g,'\\n');
    if(!value.includes('\\n')){
      split.range.deleteContents();
      const node=document.createTextNode(value);
      split.range.insertNode(node);
      split.range.setStartAfter(node);split.range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(split.range);
      block.dispatchEvent(new Event('input',{bubbles:true}));
      return;
    }
    parent.postMessage({type:'inlinePaste',line:Number(block.dataset.inlineLine),renderId:Number(block.dataset.inlineRender),beforeHtml:split.beforeHtml,afterHtml:split.afterHtml,text:value},'*');
  });
  document.addEventListener('click',e=>{
    const empty=e.target.closest('[data-inline-line]');
    if(empty&&!empty.textContent){
      e.preventDefault();
      empty.focus();
      const range=document.createRange();range.selectNodeContents(empty);range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      return;
    }
    const t=e.target.closest('.task-toggle');if(t){e.preventDefault();parent.postMessage({type:'toggleTask',line:Number(t.dataset.line),kind:t.dataset.kind},'*');return}
    const c=e.target.closest('.checkbox-toggle-row');if(c&&!e.target.closest('[data-inline-line]')){e.preventDefault();parent.postMessage({type:'toggleTask',line:Number(c.dataset.line),kind:'checkbox'},'*');return}
    const w=e.target.closest('a[data-web]');if(w){e.preventDefault();parent.postMessage({type:'openWeb',url:w.dataset.web},'*');return}
    const f=e.target.closest('.org-file-link');if(f){e.preventDefault();parent.postMessage({type:'openOrgLink',target:f.dataset.target},'*');return}
    const p=e.target.closest('.wb-link');if(p){e.preventDefault();parent.postMessage({type:'openWorkbenchPath',path:p.dataset.path,kind:p.dataset.kind},'*');return}
    const h=e.target.closest('.home-config-edit');if(h){e.preventDefault();parent.postMessage({type:'editHomeShortcuts'},'*');return}
    const syntax=e.target.closest('.syntax-details summary');if(syntax&&syntax.parentElement.open){parent.postMessage({type:'closeSyntaxGuide'},'*');return}
    const a=e.target.closest('.agenda-open');if(a){e.preventDefault();parent.postMessage({type:'openAgenda'},'*');return}
    const r=e.target.closest('.agenda-refresh');if(r){e.preventDefault();parent.postMessage({type:'refreshAgenda'},'*');return}
    const i=e.target.closest('.agenda-item-link');if(i){e.preventDefault();parent.postMessage({type:'openAgendaItem',path:i.dataset.agendaPath,line:Number(i.dataset.agendaLine||1)},'*');return}
    const o=e.target.closest('.output-action');if(o){e.preventDefault();parent.postMessage({type:'outputAction',action:o.dataset.outputAction,path:o.dataset.outputPath},'*');return}
  });
  <\/script></body></html>`;
}


function extractExplicitOutputNames(source){
  const names=new Set();

  const patterns=[
    // Python:
    // plt.savefig("plot.png")
    // fig.savefig("plot.pdf")
    /(?:savefig|imsave)\s*\(\s*(['"])([^'"]+\.(?:png|pdf|jpg|jpeg))\1/gi,

    // ROOT / C++:
    // c->SaveAs("plot.pdf")
    // c->Print("plot.png")
    /(?:SaveAs|Print)\s*\(\s*(['"])([^'"]+\.(?:png|pdf|jpg|jpeg))\1/gi,

    // R:
    // ggsave("plot.pdf")
    // png("plot.png")
    // pdf("plot.pdf")
    /(?:ggsave|png|pdf|jpeg|jpg)\s*\(\s*(['"])([^'"]+\.(?:png|pdf|jpg|jpeg))\1/gi
  ];

  for(const pattern of patterns){
    let match;

    while((match=pattern.exec(source||''))!==null){
      const pieces=match[2].split(/[\\/]/);
      const name=pieces[pieces.length-1];

      if(name)names.add(name);
    }
  }

  return [...names];
}

async function renderRootOutputs(){
  const explicitNames=
    extractExplicitOutputNames(editor.value||'');

  const allOutputs=
    await window.workbench.generatedOutputs({
      path:currentPath,
      sinceMs:0
    });

  let outputs=[];

  if(explicitNames.length){
    const wanted=new Set(explicitNames);

    outputs=allOutputs.filter(item=>
      wanted.has(item.name)
    );
  }else{
    // Dynamic filenames cannot be known from the source alone.
    // Fall back to outputs modified during the latest Workbench run.
    const sinceMs=
      lastRunStartedAt.get(currentPath)||0;

    if(sinceMs){
      outputs=allOutputs.filter(item=>
        item.mtimeMs>=sinceMs
      );
    }
  }

  if(!outputs.length){
    const hint=explicitNames.length
      ? 'No files named in this source were found beside it. Run the code, then check the output filenames.'
      : lastRunStartedAt.has(currentPath)
        ? 'The latest Workbench run has no new PDF or image output here. Check the terminal for errors or refresh after the files are written.'
        : 'Run this source file to see PDF and image outputs saved in the same folder.';

    return previewShell(`
      <article class="output-gallery">
        <h1>Generated outputs</h1>
        <p class="output-summary">PDF and image files associated with this source</p>
        <div class="output-empty">
          <h2>No outputs to show yet</h2>
          <p>${hint}</p>
        </div>
      </article>
    `);
  }

  const cards=outputs.map((item,index)=>{
    const name=esc(item.name);
    const url=esc(item.fileUrl);
    const outputPath=esc(item.path);
    const isPdf=item.ext==='.pdf';
    const media=isPdf
      ? `<iframe src="${url}?v=${item.mtimeMs}#view=FitH&navpanes=0&toolbar=0" title="${name}"></iframe>`
      : `<img src="${url}?v=${item.mtimeMs}" alt="${name}" loading="lazy">`;

    return `
      <section class="output-card">
        <header class="output-card-header">
          <div class="output-card-title">
            <span class="output-type">${esc(item.ext.slice(1))}</span>
            <strong title="${name}">${name}</strong>
            ${index===0?'<span class="output-newest">Newest</span>':''}
          </div>
          <div class="output-card-actions">
            <button class="output-action" data-output-action="open" data-output-path="${outputPath}">Open in macOS</button>
            <button class="output-action" data-output-action="reveal" data-output-path="${outputPath}">Reveal in Finder</button>
          </div>
        </header>
        <div class="output-media">${media}</div>
      </section>
    `;
  }).join('');

  return previewShell(`
    <article class="output-gallery">
      <h1>Generated outputs</h1>
      <p class="output-summary">${outputs.length} PDF or image output${outputs.length===1?'':'s'} associated with this source</p>
      ${cards}
    </article>
  `);
}

async function refreshPreview({preserveScroll=false}={}){
  highlightSource();
  if(!currentPath){if(isHome){const result=await window.workbench.homeShortcuts();homeShortcuts=result.config;homeShortcutsHash=result.sha256;if(result.warning)showToast(result.warning,true);preview.srcdoc=previewShell(homeDashboard())}else{preview.srcdoc=previewShell(`<article class="doc"><h1>${esc(currentDir)}</h1><p>Select a file from Files.</p></article>`)}return}
  const ext=extOf(currentPath);

  const isRootMacro=currentPath && currentPath.endsWith('.C');
  const isPlotProducingCode=
    isRootMacro ||
    ['.py','.r','.c','.cpp','.cc','.cxx'].includes(ext);

  if(isPlotProducingCode){
    try{
      const explicitNames=
        extractExplicitOutputNames(editor.value||'');

      const outputs=
        await window.workbench.generatedOutputs({
          path:currentPath,
          sinceMs:0
        });

      const existingNames=
        new Set(outputs.map(item=>item.name));

      const hasExplicitOutput=
        explicitNames.some(name=>
          existingNames.has(name)
        );

      const sinceMs=
        lastRunStartedAt.get(currentPath)||0;

      const hasRecentOutput=
        !!sinceMs &&
        outputs.some(item=>
          item.mtimeMs>=sinceMs
        );

      // ROOT uses the generated-output pane by default.
      //
      // Python, R, C and C++ use it when:
      // 1. the source explicitly names an existing plot file, or
      // 2. a recent Workbench run produced a plot with a dynamic name.
      if(
        isRootMacro ||
        hasExplicitOutput ||
        hasRecentOutput
      ){
        preview.removeAttribute('src');
        preview.srcdoc=await renderRootOutputs();
        return;
      }
    }catch{}
  }
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
  if(ext==='.tex'){
    preview.removeAttribute('src');
    preview.srcdoc=previewShell('<article class="doc"><h1>PDF not built yet</h1><p>Edit the LaTeX source, then use Build PDF. Successful builds appear here automatically.</p></article>');
    return;
  }
  preview.removeAttribute('src');
  let text=editor.value;
  if(!dirty || editor.readOnly){
    try{text=(await window.workbench.readFile(currentPath)).content}catch{}
  }
  let body;
  if(['.org','.md'].includes(ext))inlineRenderId++;
  if(ext==='.org'){
    currentOrgTodoStates=orgTodoStates(text.split(/\r?\n/));
    body=renderOrg(text);
  }
  else if(ext==='.md')body=renderMarkdown(text,true,await resolveMarkdownImages(text));
  else if(ext==='.ipynb')body=renderNotebook(text);
  else body=`<article class="doc"><h1>${esc(currentPath.split('/').pop())}</h1><pre><code>${esc(text)}</code></pre></article>`;
  if(preserveScroll && ['.org','.md'].includes(ext)){
    let scrollY=0;
    try{scrollY=preview.contentWindow.scrollY||0}catch{}
    const restore=()=>{
      try{preview.contentWindow.scrollTo(0,scrollY)}catch{}
    };
    preview.addEventListener('load',restore,{once:true});
  }
  preview.srcdoc=previewShell(body);
}
function inlineHtmlToSource(html,ext){
  const root=document.createElement('div');
  root.innerHTML=html;
  const walk=node=>{
    if(node.nodeType===Node.TEXT_NODE)return node.nodeValue;
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const tag=node.tagName.toLowerCase();
    if(tag==='br')return ext==='.org'?'\\\\':'<br>';
    const value=[...node.childNodes].map(walk).join('');
    if(ext==='.org'){
      if(tag==='strong'||tag==='b')return `*${value}*`;
      if(tag==='code')return `~${value}~`;
      if(tag==='em'||tag==='i')return `/${value}/`;
      if(tag==='a'&&node.dataset.web)return `[[${node.dataset.web}][${value}]]`;
      if(tag==='a'&&node.classList.contains('org-file-link'))return `[[file:${node.dataset.target}][${value}]]`;
    }
    if(ext==='.md'){
      if(tag==='strong'||tag==='b')return `**${value}**`;
      if(tag==='code')return '`'+value+'`';
      if(tag==='em'||tag==='i')return `*${value}*`;
    }
    return value;
  };
  return [...root.childNodes].map(walk).join('');
}
function inlinePrefix(line,ext){
  const states=currentOrgTodoStates.map(state=>state.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const pattern=ext==='.org'
    ? new RegExp(`^(#\\+TITLE:\\s*|\\*+\\s+(?:${states})(?:\\s+|$)|\\*+\\s+|\\s*[-+]\\s+\\[[ Xx]\\]\\s+|\\s*[-+]\\s+|\\s+)`,'i')
    : /^(#{1,6}\s+|\s*[-*+]\s+|\s+)/;
  return line.match(pattern)?.[0]||'';
}
function normalizeInlineSource(value,original,ext){
  if(ext==='.org'){
    if(/^\*+\s+/.test(original))return value.replace(/^\*+\s+/,'');
    if(/^\s*[-+]\s+/.test(original))return value.replace(/^\s*[-+]\s+(?:\[[ Xx]\]\s+)?/,'');
  }
  if(ext==='.md'){
    if(/^#{1,6}\s+/.test(original))return value.replace(/^#{1,6}\s+/,'');
    if(/^\s*[-*+]\s+/.test(original))return value.replace(/^\s*[-*+]\s+/,'');
  }
  return value;
}
function nextInlinePrefix(line,ext){
  if(ext==='.org'){
    const check=line.match(/^(\s*[-+])\s+\[[ Xx]\]\s+/);
    if(check)return check[1]+' [ ] ';
  }
  const bullet=line.match(/^(\s*[-+*])\s+/);
  return bullet&&!(ext==='.org'&&bullet[1].trim()==='*')?bullet[1]+' ':'';
}
function scheduleInlineSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer=setTimeout(async()=>{
    if(dirty&&currentPath)await saveCurrent({quiet:true,buildLatex:false});
  },1000);
}
function updateInlineLine(line,html){
  if(!['.org','.md'].includes(extOf(currentPath)))return;
  const lines=editor.value.split('\n');
  if(!Number.isInteger(line)||line<0||line>=lines.length)return;
  const ext=extOf(currentPath);
  const next=inlinePrefix(lines[line],ext)+normalizeInlineSource(inlineHtmlToSource(html,ext),lines[line],ext);
  if(next===lines[line])return;
  lines[line]=next;
  editor.value=lines.join('\n');
  recordInlineHistory();
  markDirty(true);
  scheduleInlineSave();
}
async function insertInlineLine(line,beforeHtml,afterHtml){
  if(!['.org','.md'].includes(extOf(currentPath)))return;
  const lines=editor.value.split('\n');
  if(!Number.isInteger(line)||line<0||line>=lines.length)return;
  const ext=extOf(currentPath);
  const original=lines[line];
  const beforeSource=normalizeInlineSource(inlineHtmlToSource(beforeHtml,ext),original,ext);
  const afterSource=normalizeInlineSource(inlineHtmlToSource(afterHtml,ext),original,ext);
  const listMarker=ext==='.org'
    ? /^(\s*[-+])\s+(?:\[[ Xx]\]\s+)?/
    : /^(\s*[-+*])\s+/;
  if(!beforeSource.trim()&&!afterSource.trim()&&listMarker.test(original)){
    lines[line]='';
    editor.value=lines.join('\n');
    recordInlineHistory();
    markDirty(true);
    scheduleInlineSave();
    const focusBlank=()=>{
      const block=preview.contentDocument?.querySelector(`[data-inline-line="${line}"]`);
      if(!block)return;
      block.focus();
      const range=preview.contentDocument.createRange();
      range.selectNodeContents(block);range.collapse(true);
      const selection=preview.contentWindow.getSelection();
      selection.removeAllRanges();selection.addRange(range);
    };
    preview.addEventListener('load',focusBlank,{once:true});
    await refreshPreview({preserveScroll:true});
    return;
  }
  lines.splice(line,1,
    inlinePrefix(original,ext)+beforeSource,
    nextInlinePrefix(original,ext)+afterSource
  );
  editor.value=lines.join('\n');
  recordInlineHistory();
  markDirty(true);
  scheduleInlineSave();
  const focusNew=()=>{
    const block=preview.contentDocument?.querySelector(`[data-inline-line="${line+1}"]`);
    if(!block)return;
    block.focus();
    const range=preview.contentDocument.createRange();
    range.selectNodeContents(block);
    range.collapse(true);
    const selection=preview.contentWindow.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  preview.addEventListener('load',focusNew,{once:true});
  await refreshPreview({preserveScroll:true});
}
async function pasteInlineLines(line,beforeHtml,afterHtml,text){
  if(!['.org','.md'].includes(extOf(currentPath)))return;
  const lines=editor.value.split('\n');
  if(!Number.isInteger(line)||line<0||line>=lines.length)return;
  const ext=extOf(currentPath);
  const pieces=String(text).split('\n');
  const first=inlinePrefix(lines[line],ext)+inlineHtmlToSource(beforeHtml,ext)+pieces[0];
  const last=pieces[pieces.length-1]+inlineHtmlToSource(afterHtml,ext);
  lines.splice(line,1,first,...pieces.slice(1,-1),last);
  editor.value=lines.join('\n');
  recordInlineHistory();
  markDirty(true);
  scheduleInlineSave();
  const focusLast=()=>{
    const block=preview.contentDocument?.querySelector(`[data-inline-line="${line+pieces.length-1}"]`);
    if(!block)return;
    block.focus();
    const range=preview.contentDocument.createRange();
    range.selectNodeContents(block);range.collapse(false);
    const selection=preview.contentWindow.getSelection();
    selection.removeAllRanges();selection.addRange(range);
  };
  preview.addEventListener('load',focusLast,{once:true});
  await refreshPreview({preserveScroll:true});
}
async function deleteInlineRange(startLine,endLine,beforeHtml,afterHtml){
  if(!['.org','.md'].includes(extOf(currentPath)))return;
  const lines=editor.value.split('\n');
  if(!Number.isInteger(startLine)||!Number.isInteger(endLine)||startLine<0||endLine>=lines.length||startLine>endLine)return;
  const ext=extOf(currentPath);
  lines.splice(startLine,endLine-startLine+1,
    inlinePrefix(lines[startLine],ext)+inlineHtmlToSource(beforeHtml,ext)+inlineHtmlToSource(afterHtml,ext)
  );
  editor.value=lines.join('\n');
  recordInlineHistory();
  markDirty(true);
  scheduleInlineSave();
  const focusJoined=()=>{
    const block=preview.contentDocument?.querySelector(`[data-inline-line="${startLine}"]`);
    if(!block)return;
    block.focus();
    const range=preview.contentDocument.createRange();
    range.selectNodeContents(block);range.collapse(false);
    const selection=preview.contentWindow.getSelection();
    selection.removeAllRanges();selection.addRange(range);
  };
  preview.addEventListener('load',focusJoined,{once:true});
  await refreshPreview({preserveScroll:true});
}
async function deleteInlineLine(line){
  if(!['.org','.md'].includes(extOf(currentPath)))return;
  const lines=editor.value.split('\n');
  if(!Number.isInteger(line)||line<0||line>=lines.length)return;
  lines.splice(line,1);
  if(!lines.length)lines.push('');
  editor.value=lines.join('\n');
  recordInlineHistory();
  markDirty(true);
  scheduleInlineSave();
  const focusLine=Math.max(0,Math.min(line,editor.value.split('\n').length-1));
  const restoreFocus=()=>{
    const block=preview.contentDocument?.querySelector(`[data-inline-line="${focusLine}"]`);
    if(!block)return;
    block.focus();
    const range=preview.contentDocument.createRange();
    range.selectNodeContents(block);range.collapse(true);
    const selection=preview.contentWindow.getSelection();
    selection.removeAllRanges();selection.addRange(range);
  };
  preview.addEventListener('load',restoreFocus,{once:true});
  await refreshPreview({preserveScroll:true});
}
async function backspaceInline(line){
  if(!['.org','.md'].includes(extOf(currentPath)))return;
  const lines=editor.value.split('\n');
  if(!Number.isInteger(line)||line<0||line>=lines.length)return;
  const ext=extOf(currentPath);
  const marker=ext==='.org'
    ? lines[line].match(/^(\s*[-+])\s+(?:\[[ Xx]\]\s+)?/)
    : lines[line].match(/^(\s*[-+*])\s+/);
  if(marker){
    lines[line]=lines[line].slice(marker[0].length);
    editor.value=lines.join('\n');
    recordInlineHistory();
    markDirty(true);
    scheduleInlineSave();
    const focusLine=()=>{
      const block=preview.contentDocument?.querySelector(`[data-inline-line="${line}"]`);
      if(!block)return;
      block.focus();
      const range=preview.contentDocument.createRange();
      range.selectNodeContents(block);range.collapse(true);
      const selection=preview.contentWindow.getSelection();
      selection.removeAllRanges();selection.addRange(range);
    };
    preview.addEventListener('load',focusLine,{once:true});
    await refreshPreview({preserveScroll:true});
    return;
  }
  await joinInlineLines(line,'back');
}
async function joinInlineLines(line,direction){
  if(!['.org','.md'].includes(extOf(currentPath)))return;
  const lines=editor.value.split('\n');
  const left=direction==='back'?line-1:line;
  const right=left+1;
  if(left<0||right>=lines.length)return;
  if(!preview.contentDocument?.querySelector(`[data-inline-line="${direction==='back'?left:right}"]`))return;
  const next=lines[left]+lines[right].slice(inlinePrefix(lines[right],extOf(currentPath)).length);
  lines.splice(left,2,next);
  editor.value=lines.join('\n');
  recordInlineHistory();
  markDirty(true);
  scheduleInlineSave();
  const focusJoined=()=>{
    const block=preview.contentDocument?.querySelector(`[data-inline-line="${left}"]`);
    if(!block)return;
    block.focus();
    const range=preview.contentDocument.createRange();
    range.selectNodeContents(block);range.collapse(false);
    const selection=preview.contentWindow.getSelection();
    selection.removeAllRanges();selection.addRange(range);
  };
  preview.addEventListener('load',focusJoined,{once:true});
  await refreshPreview({preserveScroll:true});
}
window.addEventListener('message',async e=>{
  if(!e.data)return;
  if(e.data.type==='previewPointerDown'){
    if(e.source===preview.contentWindow)helpMenu.removeAttribute('open');
  }else if(e.data.type==='inlineInput'){
    if(e.source!==preview.contentWindow||e.data.renderId!==inlineRenderId)return;
    updateInlineLine(e.data.line,e.data.html);
  }else if(e.data.type==='inlineUndo'){
    if(e.source!==preview.contentWindow)return;
    await moveInlineHistory(-1);
  }else if(e.data.type==='inlineRedo'){
    if(e.source!==preview.contentWindow)return;
    await moveInlineHistory(1);
  }else if(e.data.type==='inlineEnter'){
    if(e.source!==preview.contentWindow||e.data.renderId!==inlineRenderId)return;
    await insertInlineLine(e.data.line,e.data.beforeHtml,e.data.afterHtml);
  }else if(e.data.type==='inlinePaste'){
    if(e.source!==preview.contentWindow||e.data.renderId!==inlineRenderId)return;
    await pasteInlineLines(e.data.line,e.data.beforeHtml,e.data.afterHtml,e.data.text);
  }else if(e.data.type==='inlineDeleteRange'){
    if(e.source!==preview.contentWindow||e.data.renderId!==inlineRenderId)return;
    await deleteInlineRange(e.data.startLine,e.data.endLine,e.data.beforeHtml,e.data.afterHtml);
  }else if(e.data.type==='inlineDeleteLine'){
    if(e.source!==preview.contentWindow||e.data.renderId!==inlineRenderId)return;
    await deleteInlineLine(e.data.line);
  }else if(e.data.type==='inlineBackspace'){
    if(e.source!==preview.contentWindow||e.data.renderId!==inlineRenderId)return;
    await backspaceInline(e.data.line);
  }else if(e.data.type==='inlineJoin'){
    if(e.source!==preview.contentWindow||e.data.renderId!==inlineRenderId)return;
    await joinInlineLines(e.data.line,e.data.direction);
  }else if(e.data.type==='inlineSave'){
    if(e.source!==preview.contentWindow)return;
    clearTimeout(autoSaveTimer);
    await saveCurrent({quiet:false,buildLatex:false});
  }else if(e.data.type==='toggleTask'){
    if(dirty){
      clearTimeout(autoSaveTimer);
      if(!(await saveCurrent({quiet:true,buildLatex:false})))return;
    }
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
    resetInlineHistory(editor.value);
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
    try{
      if(e.data.kind==='dir')await loadDir(e.data.path);
      else await openFile(e.data.path);
      await syncTerminalToPath(e.data.path);
    }catch(err){showToast(err.message,true)}
  }else if(e.data.type==='outputAction'){
    if(e.source!==preview.contentWindow)return;
    try{
      if(e.data.action==='open')await window.workbench.openDefault(e.data.path);
      else if(e.data.action==='reveal')await window.workbench.reveal(e.data.path);
    }catch(err){showToast(err.message||String(err),true)}
  }else if(e.data.type==='editHomeShortcuts'){
    if(e.source!==preview.contentWindow)return;
    try{await openHomeSettings()}catch(err){showToast(err.message||String(err),true)}
  }else if(e.data.type==='closeSyntaxGuide'){
    if(e.source!==preview.contentWindow)return;
    const target=helpReturnNavIndex;
    helpReturnNavIndex=null;
    if(Number.isInteger(target)&&target!==navIndex){
      await goHistory(target-navIndex);
    }
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

window.workbench.onTerminalData(({id,data,openPath})=>{
  if(id!==terminalId)return;
  if(data)term.write(data);
  if(openPath)handleWorkbenchOpenPath(openPath);
});
window.workbench.onTerminalExit(({id})=>{if(id===terminalId){term.write('\r\n[terminal exited]\r\n');terminalId=null}});

async function handleWorkbenchOpenPath({path,type,source}){
  try{
    const rootName=path.split(':/')[0];

    if(type==='dir'){
      await loadDir(path,false,source==='cwd');

      document.querySelectorAll('.root-tab').forEach(btn=>{
        const btnRoot=(btn.dataset.root||'').split(':/')[0];
        btn.classList.toggle('active',btnRoot===rootName);
      });

      return;
    }

    // Open the requested file first.
    await openFile(path);

    // Then force Files to follow the opened file.
    const parentDir=dirname(path);
    await loadDir(parentDir,false);

    // Correct root tab.
    document.querySelectorAll('.root-tab').forEach(btn=>{
      const target=btn.dataset.root||'';

      let active=false;

      if(target==='hopkins:/teaching/'){
        active=path.startsWith('hopkins:/teaching/');
      }else if(target==='hopkins:/'){
        active=
          path.startsWith('hopkins:/') &&
          !path.startsWith('hopkins:/teaching/');
      }else{
        active=path.startsWith(target);
      }

      btn.classList.toggle('active',active);
    });

    // Highlight the file we opened.
    document.querySelectorAll('.file-row').forEach(row=>{
      row.classList.toggle(
        'selected',
        row.dataset.path===path
      );
    });

  }catch(err){
    showToast(err.message||String(err),true);
  }
}
window.workbench.onWorkbenchOpenPath(handleWorkbenchOpenPath);

window.addEventListener('resize',()=>setTimeout(resizeTerminal,50));

async function sendBuildCommand(){
  if(!currentPath)return;

  const pathBeingRun=currentPath;
  if(
    dirty &&
    !(await saveCurrent({buildLatex:false}))
  )return;
  try{
    const cmd=await window.workbench.buildCommand(currentPath);

    lastRunStartedAt.set(pathBeingRun, Date.now());
    if(!terminalId)await createTerminal();
    await window.workbench.terminalWrite({id:terminalId,data:cmd+'\r'});
    showToast(extOf(pathBeingRun)==='.ipynb'
      ? 'Running all notebook cells in Bash terminal'
      : 'Sent to Bash terminal');
  }catch(e){showToast(e.message,true)}
}
runBtn.onclick=sendBuildCommand;buildBtn.onclick=sendBuildCommand;runNotebookBtn.onclick=sendBuildCommand;
document.getElementById('terminalRestartBtn').onclick=createTerminal;

document.getElementById('saveBtn').onclick=saveCurrent;
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveCurrent()}});
document.getElementById('refreshPreviewBtn').onclick=refreshPreview;
backBtn.onclick=()=>goHistory(-1);
forwardBtn.onclick=()=>goHistory(1);
openDefaultBtn.onclick=async()=>{if(!currentPath)return;try{await window.workbench.openDefault(currentPath)}catch(e){showToast(e.message,true)}};
exportPdfBtn.onclick=async()=>{
  if(!currentPath||!['.org','.md'].includes(extOf(currentPath)))return;
  const html=preview.contentDocument?.documentElement?.outerHTML;
  if(!html){showToast('Rendered view is not ready',true);return}
  try{
    const result=await window.workbench.exportRenderedPdf({
      html,
      title:currentPath.split('/').pop().replace(/\.[^.]+$/,'')
    });
    if(!result.canceled)showToast(`Exported PDF: ${result.path.split('/').pop()}`);
  }catch(err){showToast(err.message||String(err),true)}
};
function sourceLineAtRenderedViewport(){
  try{
    const doc=preview.contentDocument;
    if(!doc)return null;
    const viewportHeight=preview.clientHeight||window.innerHeight;
    const scrollTop=preview.contentWindow?.scrollY||0;
    const targetTop=scrollTop+viewportHeight*0.35;
    const blocks=[...doc.querySelectorAll('[data-inline-line]')];
    let candidate=null;
    for(const block of blocks){
      const top=block.getBoundingClientRect().top+scrollTop;
      if(top<=targetTop)candidate=Number(block.dataset.inlineLine);
      else if(candidate!==null)break;
    }
    return Number.isInteger(candidate)?candidate:null;
  }catch{return null}
}
document.getElementById('toggleEditorBtn').onclick=()=>{
  const showSource=!editorVisible;
  const line=showSource?sourceLineAtRenderedViewport():null;
  setEditorVisible(!editorVisible);
  if(showSource){
    requestAnimationFrame(()=>{
      let offset=0;
      if(Number.isInteger(line)){
        const lines=editor.value.split('\n');
        for(let i=0;i<line&&i<lines.length;i++)offset+=lines[i].length+1;
      }
      editor.focus();
      if(Number.isInteger(line)){
        editor.selectionStart=offset;
        editor.selectionEnd=offset;
        const lineHeight=parseFloat(getComputedStyle(editor).lineHeight)||20;
        editor.scrollTop=Math.max(0,(line-2)*lineHeight);
      }else{
        editor.selectionStart=editor.selectionEnd=0;
        editor.scrollTop=0;
      }
    });
  }
};
document.getElementById('homeBtn').onclick=()=>showHome();
document.getElementById('filesUpBtn').onclick=async()=>{
  try{
    const target=await window.workbench.parentDirectory(currentDir);
    await loadDir(target);
    await syncTerminalToPath(target);
  }catch(err){showToast(err.message||String(err),true)}
};
document.getElementById('filesHomeBtn').onclick=async()=>{
  try{
    const target=await window.workbench.homeDirectory();
    await loadDir(target);
    await syncTerminalToPath(target);
  }catch(err){showToast(err.message||String(err),true)}
};
document.querySelectorAll('.root-tab').forEach(btn=>btn.onclick=async()=>{
  document.querySelectorAll('.root-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');

  if(btn.dataset.file){
    const file=btn.dataset.file;
    const parent=dirname(file);
    await loadDir(parent,false);
    await openFile(file);
    await syncTerminalToPath(file);

    document.querySelectorAll('.file-row').forEach(row=>{
      row.classList.toggle('selected',row.dataset.path===file);
    });
    return;
  }

  if(btn.dataset.root){
    await loadDir(btn.dataset.root);
    await syncTerminalToPath(btn.dataset.root);
  }
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
      await loadDir(currentDir,false,true);
    }catch{}

    if(!currentPath||dirty||Date.now()<suppressFsReloadUntil)return;
    const pathAtCheck=currentPath;
    try{
      const latest=await window.workbench.readFile(pathAtCheck);
      if(currentPath!==pathAtCheck||dirty||latest.sha256===currentHash)return;
      await openFile(pathAtCheck,false);
    }catch{}
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
