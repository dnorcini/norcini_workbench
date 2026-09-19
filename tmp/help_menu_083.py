from pathlib import Path

p = Path("src/renderer/index.html")
text = p.read_text()

if 'id="helpMenu"' not in text:
    marker = '<button id="newNoteBtn">+ New note</button>'

    if marker not in text:
        raise RuntimeError("Could not find + New note button")

    menu = '''
      <details id="helpMenu" class="help-menu">
        <summary>Help ▾</summary>

        <div class="help-popover">

          <div class="help-section">
            <strong>Workbench commands</strong>
            <div><code>wb FILE</code><span>Open file in Workbench</span></div>
            <div><code>wb .</code><span>Open terminal directory</span></div>
            <div><code>⌘S</code><span>Save now</span></div>
          </div>

          <div class="help-section">
            <strong>Org syntax</strong>
            <div><code>* Heading</code><span>Heading</span></div>
            <div><code>* TODO Task</code><span>Task</span></div>
            <div><code>- [ ] Item</code><span>Checkbox</span></div>
            <div><code>SCHEDULED:</code><span>Scheduled date</span></div>
            <div><code>DEADLINE:</code><span>Deadline</span></div>
            <div><code>[[file:path][Label]]</code><span>File link</span></div>
          </div>

          <div class="help-section">
            <strong>Run / build</strong>
            <div><code>Python / R / shell</code><span>Run</span></div>
            <div><code>C / C++</code><span>Compile + run</span></div>
            <div><code>LaTeX</code><span>Build PDF</span></div>
          </div>

        </div>
      </details>
'''

    text = text.replace(marker, marker + menu, 1)

if 'id="workbenchHelpStyles"' not in text:
    marker = "</head>"

    if marker not in text:
        raise RuntimeError("Could not find </head>")

    styles = '''
  <style id="workbenchHelpStyles">
    .help-menu{
      position:relative;
      display:inline-block;
    }

    .help-menu summary{
      list-style:none;
      cursor:pointer;
      user-select:none;
      border:1px solid #d0d7de;
      border-radius:6px;
      background:#f6f8fa;
      padding:5px 10px;
      font-size:12px;
      color:#24292f;
    }

    .help-menu summary::-webkit-details-marker{
      display:none;
    }

    .help-popover{
      position:absolute;
      right:0;
      top:calc(100% + 7px);
      z-index:10000;
      width:390px;
      max-height:70vh;
      overflow:auto;
      background:#fff;
      border:1px solid #d0d7de;
      border-radius:9px;
      box-shadow:0 8px 28px rgba(31,35,40,.18);
      padding:14px 16px;
      color:#24292f;
    }

    .help-section + .help-section{
      margin-top:15px;
      padding-top:13px;
      border-top:1px solid #d8dee4;
    }

    .help-section>strong{
      display:block;
      margin-bottom:7px;
      font-size:12px;
      text-transform:uppercase;
      letter-spacing:.05em;
      color:#57606a;
    }

    .help-section>div{
      display:grid;
      grid-template-columns:150px 1fr;
      gap:12px;
      align-items:center;
      padding:4px 0;
      font-size:12px;
    }

    .help-section code{
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
      background:#f6f8fa;
      border:1px solid #d8dee4;
      border-radius:4px;
      padding:2px 5px;
      font-size:11px;
    }

    .help-section span{
      color:#656d76;
    }
  </style>
'''

    text = text.replace(marker, styles + "\n" + marker, 1)

p.write_text(text)

print("Help menu installed.")
