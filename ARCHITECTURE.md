# Architecture

## Principle

The filesystem is canonical for working files. Org is canonical for notes/tasks/navigation. Zotero remains external and canonical for literature. Workbench is a desktop front end, not a database.

## Electron processes

`src/main.js` owns privileged operations: filesystem access, file watching, shell integration, command construction, and PTY creation. `src/preload.js` exposes a narrow IPC bridge with `contextIsolation` enabled and `nodeIntegration` disabled. `src/renderer/` owns the visible workspace.

## Filesystem model

Workbench exposes named roots and converts between virtual paths such as `org:/home.org` and absolute paths. Resolution rejects paths that escape an allowed root. File saves use SHA-256 conflict checking before overwrite.

## PTY model

`node-pty` spawns `/bin/bash` with `--rcfile workbench-bashrc -i`. Workbench writes that rc file in Electron's user data directory; it sources `~/.bash_profile` if present, otherwise `~/.bashrc`, and configures `wb` and directory reporting. xterm sends its native `onData` stream to the PTY over IPC, preserving Tab completion, history, control keys, colors, and interactive programs. Run/build actions send shell commands to the same terminal. Files navigation sends directory changes to Bash, while Bash prompt reporting updates Files after terminal directory changes.

## Rendering

Org, Markdown, notebooks, plain code/text, images, and PDFs are rendered in the main view. PDF display uses Electron/Chromium's built-in PDF support. Org task state changes are written back to the source `.org` file.

## Why Electron

Electron is retained because 0.7.4 demonstrated reliable native PTY integration, Chromium document rendering, and straightforward macOS packaging. The earlier Tauri experiment is not part of the active architecture.
