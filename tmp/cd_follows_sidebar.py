from pathlib import Path

p = Path("src/main.js")
text = p.read_text()

# ============================================================
# 1. Make the Workbench bash rc report $PWD at every prompt
# ============================================================

old = r"""  printf '\\033]777;workbench-open;%s\\007' "$target"
}
`;"""

new = r"""  printf '\\033]777;workbench-open;%s\\007' "$target"
}

# Tell Workbench the terminal's current directory after each
# command, including after `cd`.
__wb_previous_prompt_command="$PROMPT_COMMAND"

__wb_prompt_command() {
  printf '\\033]778;workbench-cwd;%s\\007' "$PWD"

  if [ -n "$__wb_previous_prompt_command" ]; then
    eval "$__wb_previous_prompt_command"
  fi
}

PROMPT_COMMAND=__wb_prompt_command
`;"""

if old not in text:
    if "workbench-cwd" not in text:
        raise SystemExit("Could not find wb() shell block")
else:
    text = text.replace(old, new, 1)


# ============================================================
# 2. Replace terminal OSC parser so it understands both:
#
#    777 = wb FILE
#    778 = terminal cwd changed
# ============================================================

start = text.find("    term.onData(data => {")
end = text.find("    term.onExit(", start)

if start == -1 or end == -1:
    raise SystemExit("Could not find terminal data handler")

new_handler = r"""    term.onData(data => {
      terminalOutputBuffer += data;

      const marker =
        /\x1b\](777;workbench-open|778;workbench-cwd);([^\x07]*)\x07/g;

      let clean = '';
      let last = 0;
      let match;

      while ((match = marker.exec(terminalOutputBuffer)) !== null) {
        clean += terminalOutputBuffer.slice(last, match.index);

        try {
          const kind = match[1];
          const requested = path.resolve(match[2]);
          const virt = virtualize(requested);

          if (
            virt &&
            fs.existsSync(requested) &&
            mainWindow &&
            !mainWindow.isDestroyed()
          ) {
            const st = fs.statSync(requested);

            if (
              kind === '778;workbench-cwd' &&
              st.isDirectory()
            ) {
              mainWindow.webContents.send(
                'workbench-open-path',
                {
                  path: virt,
                  type: 'dir'
                }
              );
            }

            if (kind === '777;workbench-open') {
              mainWindow.webContents.send(
                'workbench-open-path',
                {
                  path: virt,
                  type: st.isDirectory() ? 'dir' : 'file'
                }
              );
            }
          }
        } catch {}

        last = marker.lastIndex;
      }

      const remainder =
        terminalOutputBuffer.slice(last);

      const openPartial =
        remainder.lastIndexOf(
          '\x1b]777;workbench-open;'
        );

      const cwdPartial =
        remainder.lastIndexOf(
          '\x1b]778;workbench-cwd;'
        );

      const partialStart =
        Math.max(openPartial, cwdPartial);

      if (partialStart >= 0) {
        clean += remainder.slice(0, partialStart);
        terminalOutputBuffer =
          remainder.slice(partialStart);
      } else {
        clean += remainder;
        terminalOutputBuffer = '';
      }

      if (
        clean &&
        mainWindow &&
        !mainWindow.isDestroyed()
      ) {
        mainWindow.webContents.send(
          'terminal-data',
          {
            id,
            data: clean
          }
        );
      }
    });

"""

text = text[:start] + new_handler + text[end:]

p.write_text(text)

print("Terminal cd -> Files sidebar synchronization installed.")
