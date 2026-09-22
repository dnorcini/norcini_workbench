from pathlib import Path
import re

ROOT = Path.home() / "Software/norcini_workbench"
renderer = ROOT / "src/renderer/app.js"

text = renderer.read_text()

# Remove standalone Agenda card
text = re.sub(
    r'\s*<section class="home-card agenda-home-card">.*?</section>\s*',
    '\n',
    text,
    count=1,
    flags=re.S
)

# Replace Today card
old = '''      <div class="home-card">
        <div class="home-card-label">Today</div>
        <h2>${esc(today)}</h2>
        <a href="#" class="wb-link" data-kind="file" data-path="org:/home.org">Open home.org <span>→</span></a>
        <a href="#" class="wb-link" data-kind="file" data-path="org:/inbox.org">Process Org inbox <span>→</span></a>
        <a href="#" class="wb-link" data-kind="file" data-path="org:/master.org">Open master.org <span>→</span></a>
      </div>'''

new = '''      <div class="home-card">
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
      </div>'''

if old not in text:
    raise RuntimeError("Could not find Today card")

text = text.replace(old, new, 1)

# Add mini preview loader
if "async function loadHomeAgendaPreview()" not in text:
    marker = "async function showAgenda()"

    if marker not in text:
        raise RuntimeError("Could not find showAgenda()")

    fn = r'''
async function loadHomeAgendaPreview(){
  try{
    const items=await window.workbench.getOrgAgenda();

    const upcoming=(items||[])
      .filter(item=>item.type==='item')
      .slice(0,3);

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
          ${esc((item.text||'').trim())}
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

'''

    text = text.replace(marker, fn + marker, 1)

# Make showHome load preview after iframe renders
old_show = "  preview.srcdoc=previewShell(homeDashboard());\n}"

new_show = """  preview.srcdoc=previewShell(homeDashboard());

  preview.onload=()=>{
    loadHomeAgendaPreview();
  };
}"""

if old_show in text:
    text = text.replace(old_show, new_show, 1)

# Add styling
if ".home-agenda-preview{" not in text:
    marker = "  .syntax-guide-card{"

    css = r'''
  .home-agenda-preview{margin-top:14px;padding-top:12px;border-top:1px solid #d8dee4}
  .home-agenda-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#656d76;margin-bottom:5px}
  .home-agenda-item{font-size:12px;line-height:1.45;color:#24292f;padding:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .home-agenda-loading,.home-agenda-empty{font-size:12px;color:#8c959f;padding:3px 0}
  .agenda-open{display:flex;justify-content:space-between;gap:16px;padding:8px 0;margin-top:4px;border-top:1px solid #f0f1f2;font-size:14px}

'''

    if marker not in text:
        raise RuntimeError("Could not find Syntax Guide CSS")

    text = text.replace(marker, css + marker, 1)

# Ensure spacing above Syntax Guide
text = text.replace(
    ".syntax-guide-card{grid-column:auto}",
    ".syntax-guide-card{grid-column:auto;margin-top:16px}"
)

renderer.write_text(text)

print("Done.")
print("- Agenda moved into Today")
print("- First 3 upcoming items shown")
print("- Standalone Agenda card removed")
print("- Syntax Guide spacing added")
