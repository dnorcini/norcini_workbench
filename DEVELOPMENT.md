# Development

Run the development app with `npm start`.

Important files:

- `src/main.js`: Electron main process, filesystem IPC, file watching, PTY, run/build commands
- `src/preload.js`: renderer IPC bridge
- `src/renderer/index.html`: application shell
- `src/renderer/style.css`: layout and GitHub-inspired light theme
- `src/renderer/app.js`: file navigation, rendering, editing, terminal UI
- `assets/icon.png`: packaging icon source

Development rules:

- preserve the real Bash PTY path unless a change is specifically intended to replace it
- keep filesystem operations explicit and reversible
- do not introduce a Workbench content database
- keep privileged filesystem/process access in the main process
- prefer small releases from a known-good baseline
- test terminal typing and interactive behavior after every Electron/native-module upgrade
