from pathlib import Path
import re

ROOT = Path.home() / "Documents/tools/norcini_workbench"
main = ROOT / "src/main.js"
renderer = ROOT / "src/renderer/app.js"


# ============================================================
# 1. MAIN.JS
# Replace Emacs-based agenda with direct live Org parsing
# ============================================================

text = main.read_text()

# We no longer need execFile.
text = text.replace(
    "const { execFile } = require('child_process');\n",
    ""
)

start = text.find("ipcMain.handle('org-agenda:get'")

if start == -1:
    raise RuntimeError("Could not find org-agenda:get handler")

end_marker = "\napp.whenReady()"
end = text.find(end_marker, start)

if end == -1:
    raise RuntimeError("Could not find app.whenReady() after Agenda handler")


new_handler = r'''ipcMain.handle('org-agenda:get', async () => {
  const orgFiles = [
    path.join(process.env.HOME, 'org', 'master.org'),
    path.join(process.env.HOME, 'org', 'inbox.org')
  ];

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 59);

  const entries = [];

  function dateFromString(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function inWindow(date) {
    return date >= startDate && date <= endDate;
  }

  for (const file of orgFiles) {
    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    let currentHeading = '';
    let currentHeadingLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const headingMatch =
        line.match(/^(\*+)\s+(?:(TODO|DONE|NEXT|WAITING|CANCELLED)\s+)?(.*)$/);

      if (headingMatch) {
        currentHeading = headingMatch[3].trim();
        currentHeadingLine = i + 1;
      }

      if (!currentHeading) continue;

      const timestampRegex = /<(\d{4}-\d{2}-\d{2})(?:\s+[^>]*)?>/g;

      let match;

      while ((match = timestampRegex.exec(line)) !== null) {
        const dateString = match[1];
        const date = dateFromString(dateString);

        if (!inWindow(date)) continue;

        let kind = 'Scheduled';

        if (/DEADLINE:/.test(line)) {
          kind = 'Deadline';
        } else if (/SCHEDULED:/.test(line)) {
          kind = 'Scheduled';
        } else {
          kind = 'Date';
        }

        entries.push({
          type: 'item',
          date: dateString,
          kind,
          text: currentHeading,
          file,
          line: currentHeadingLine
        });
      }
    }
  }

  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.text.localeCompare(b.text);
  });

  const rows = [];
  let lastDate = null;

  for (const item of entries) {
    if (item.date !== lastDate) {
      const d = dateFromString(item.date);

      rows.push({
        type: 'date',
        text: new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        }).format(d)
      });

      lastDate = item.date;
    }

    rows.push({
      type: 'item',
      text: `${item.kind}: ${item.text}`,
      file: item.file,
      line: item.line
    });
  }

  return rows;
});


'''

text = text[:start] + new_handler + text[end:]

main.write_text(text)


# ============================================================
# 2. APP.JS
# Move Agenda into Today card
# ============================================================

text = renderer.read_text()


# Remove separate Agenda card if present.
text = re.sub(
    r'''
\s*<section\s+class="home-card agenda-home-card">
.*?
</section>
''',
    '\n',
    text,
    count=1,
    flags=re.S | re.X
)


# Add Agenda below master.org inside Today.
if 'class="agenda-open"' not in text:
    marker = '''        <a href="#" class="wb-link" data-kind="file" data-path="org:/master.org">Open master.org <span>→</span></a>'''

    replacement = marker + '''
        <a href="#" class="agenda-open">Open 60-day agenda <span>→</span></a>'''

    if marker not in text:
        raise RuntimeError("Could not find master.org link in Today card")

    text = text.replace(
        marker,
        replacement,
        1
    )


# Make Agenda home link visually identical to wb-link.
if ".agenda-open{" not in text:
    css_marker = ".wb-link:first-of-type{border-top:0}"

    if css_marker not in text:
        raise RuntimeError("Could not find wb-link CSS")

    text = text.replace(
        css_marker,
        css_marker +
        ".agenda-open{display:flex;justify-content:space-between;gap:16px;"
        "padding:8px 0;border-top:1px solid #f0f1f2;font-size:14px}",
        1
    )


# Remove old agenda card CSS, if any.
text = text.replace(
    "  .agenda-home-card{margin-top:16px}\n",
    ""
)


# Add spacing above Syntax Guide.
# It is currently directly underneath home-grid.
if ".syntax-guide-card{margin-top:16px" not in text:
    text = text.replace(
        "  .syntax-guide-card{grid-column:auto}",
        "  .syntax-guide-card{grid-column:auto;margin-top:16px}",
        1
    )


renderer.write_text(text)


print()
print("Agenda/layout fixes applied.")
print()
print("Changes:")
print("  - Agenda no longer launches Emacs")
print("  - Agenda reads master.org + inbox.org live")
print("  - Agenda moved into Today card")
print("  - Syntax Guide now has spacing above it")
print()
