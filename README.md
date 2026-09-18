# Norcini Workbench Desktop 0.8.0

Norcini Workbench is a local-first desktop workspace for academic and research work. It is a front end over your real filesystem and tools, not a replacement database.

## 0.8.0

0.8.0 builds directly on the known-good Electron 0.7.4 terminal and execution architecture.

- preserves the real `/bin/bash -l` PTY using `node-pty` + xterm
- keeps Terminal Here, interactive Bash, Python/R/script execution, notebook execution, and LaTeX build commands
- keeps Org TODO/DONE and checkbox interaction
- keeps internal Org file links inside Workbench
- introduces the light GitHub-inspired application shell; terminal remains dark
- adds Back / Forward navigation and a visible current path
- adds Open in macOS for the current file
- improves file-tree and panel styling
- adds a macOS app icon asset
- begins the rebuildable-project documentation set

Your files remain the source of truth. There is no Workbench database.

## Install and test

Requires Node.js/npm and macOS Xcode Command Line Tools for the native `node-pty` build. From this folder:

```bash
npm install
npm start
```

`npm install` runs `electron-rebuild` automatically so `node-pty` matches Electron's Node ABI.

## Build the macOS app

```bash
npm run pack:mac
```

The generated `Norcini Workbench.app` will be under `dist/` (typically `dist/mac-arm64/` on Apple Silicon). Move it to `/Applications` or `~/Applications`. It is not yet signed/notarized.

## Exposed roots

- `~/org`
- `~/Documents/hopkins`
- `~/Documents`
- `~/Desktop/inbox`

## Safety

Workbench operates directly on real files. Saving, renaming, moving, creating folders, and moving items to Trash affect the filesystem immediately. Large-scale migration/reorganization is intentionally not part of the app.

See `ARCHITECTURE.md`, `DEPENDENCIES.md`, `REBUILD.md`, `DEVELOPMENT.md`, `CHANGELOG.md`, and `AI_INTEGRATION.md`.
