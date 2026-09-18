# Norcini Workbench Desktop 0.7.4

This is the architectural shift from the browser prototype to a real macOS desktop app.

## 0.7.4 terminal input fix

0.7.3 proved the native PTY backend is connected. The remaining issue was the renderer input path plus an escaping bug in the diagnostic commands.

- restores xterm's native `onData` stream for keyboard input
- fixes command submission to send a real carriage return instead of literal `\\r`
- normal typing, Tab completion, history arrows, Ctrl-C, Ctrl-D, and interactive programs now go through xterm normally
- keeps the visible `connected` status and PTY diagnostics

## 0.7.3 terminal architecture patch

The terminal failure in 0.7.0-0.7.2 was treated as a native-module integration problem rather than another UI-focus problem.

- adds `@electron/rebuild`
- automatically rebuilds `node-pty` against Electron's Node ABI after `npm install`
- adds visible terminal connection status
- terminal startup errors are printed directly in the terminal pane
- PTY startup performs a visible round-trip self-test
- Terminal here now reports failures instead of silently doing nothing

**Important:** after unpacking 0.7.3, run `npm install` again. That rebuild step is the key change.

## 0.7.2 reliability patch

- replaces unreliable xterm keyboard input forwarding with an explicit key-to-PTY bridge
- supports normal typing, Enter, Backspace, Tab completion, arrow history, Ctrl-C, Ctrl-D, Ctrl-L, Ctrl-A/E, and more
- terminal startup prints a visible Workbench Bash marker and current directory
- Terminal here visibly changes directory and prints the new location
- PDF preview now requests fit-width mode and suppresses navigation/toolbars where Chromium permits it
- keeps the 0.7.1 internal-link fix

## 0.7.1 reliability patch

- fixes the embedded Bash terminal not accepting/focusing keyboard input reliably
- redraws the Bash prompt after the PTY is connected
- clicking the terminal explicitly focuses it
- internal Org `file:` links now open inside the same Workbench window
- linked folders navigate the left file browser instead of spawning another window

## What changed

- no localhost server
- no browser tab
- launches as a normal macOS app
- real Bash terminal backed by a PTY
- tab completion, history, Ctrl-C, Ctrl-D, colors, interactive programs
- file tree over your real filesystem
- Quick edit stays optional
- GitHub-like rendered Org/Markdown/notebook reading
- clickable Org TODO/DONE and plain checkboxes
- PDF preview
- contextual Run / Build PDF / Run notebook actions
- actions are sent to the real Bash terminal
- live filesystem watching
- panel sizes are draggable and remembered

Your files remain the source of truth. There is no Workbench database.

## Install once

This desktop build uses Electron plus `node-pty` for the real terminal.

### 1. Put the source upstream

Recommended:

```bash
mkdir -p ~/Documents/tools
unzip norcini_workbench_desktop_0.7.zip -d ~/Documents/tools/
cd ~/Documents/tools/norcini_workbench_desktop_0.7
```

### 2. Install dependencies

You need Node.js/npm once for building the app.

```bash
npm install
```

### 3. Test it

```bash
npm start
```

A normal desktop window should open. The terminal inside it is a real `/bin/bash -l` session.

### 4. Build the macOS app

```bash
npm run pack:mac
```

The `.app` will be under:

```text
dist/mac-arm64/Norcini Workbench.app
```

(on an Apple Silicon Mac; the exact folder can vary slightly by Electron Builder version).

Move that app to `/Applications` or `~/Applications`.

After that, launch **Norcini Workbench** like any other Mac app. You do not need Terminal or localhost to start it.

## File roots

The app exposes:

- `~/org`
- `~/Documents/hopkins`
- `~/Documents`
- `~/Desktop/inbox`

The left sidebar is just a navigator over those real locations.

## Terminal

The terminal is a genuine Bash PTY:

```text
/bin/bash -l
```

So normal Bash behavior should work:

- Tab completion
- Up/down history
- aliases and login-shell startup
- `cd`
- `ssh`
- Python/R REPLs
- `emacs -nw`
- Ctrl-C / Ctrl-D
- `clear`
- interactive CLI programs

`Terminal here` changes the embedded shell to the currently selected file/folder's directory.

## LaTeX / Python / R / notebooks

Contextual buttons send commands to the real Bash terminal:

- `.tex` -> Build PDF
- `.py`, `.R`, shell -> Run
- `.ipynb` -> Run notebook

The file watcher refreshes previews when generated files change.

For LaTeX, Workbench searches `/Library/TeX/texbin` as well as common Homebrew/system paths.

## Current limitations

This is the first desktop beta.

- PDF rendering uses Chromium/Electron's built-in PDF handling.
- notebook rendering is intentionally lightweight, not a full JupyterLab clone.
- Quick edit is still a textarea, not a full IDE/LSP editor.
- app is not code-signed/notarized yet, so macOS may require right-click -> Open the first time.
- the first `npm install` compiles `node-pty`; Xcode Command Line Tools may be required.

## Why Electron here?

For this prototype, Electron gives us the native desktop shell plus Chromium rendering and a stable path to an embedded PTY terminal. If the workflow proves durable, we can later decide whether a Tauri port is worth the extra build complexity.