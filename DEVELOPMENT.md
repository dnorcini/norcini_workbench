# Development

## Normal development loop

```bash
npm install
npm start
```

Application source lives under `src/`.

- `src/main.js` owns native filesystem, PTY, shell, and packaging-facing behavior.
- `src/preload.js` exposes the controlled IPC bridge.
- `src/renderer/` owns the visible desktop interface.
- `assets/icon.png` is the canonical application/Dock icon source.

## Do not casually replace the PTY path

Electron 0.7.4 established the stable terminal architecture:

```text
xterm -> preload IPC -> Electron main -> node-pty -> /bin/bash -l
```

That path is foundational. UI work should not replace it with `exec`, a fake command box, or a browser terminal abstraction.

## Versioning

Keep `main` usable. Mark known-good releases with annotated Git tags such as:

```bash
git tag -a v0.8.1 -m "Norcini Workbench v0.8.1"
git push origin v0.8.1
```

Use branches for substantial experiments. Tauri is not an active development target unless explicitly revived.

## Packaging checks

Before calling a version stable:

1. `npm audit`
2. `npm start`
3. terminal typing / Tab / history / Ctrl-C
4. Terminal Here
5. Org rendering and Quick Edit
6. PDF preview
7. Python or shell execution
8. LaTeX build if available
9. `npm run pack:mac`
10. launch the packaged `.app` from Finder or `/Applications`

## Canonical source directory

The canonical, live Norcini Workbench source tree is:

    ~/Documents/tools/norcini_workbench

All development, testing, packaging, Git commits, and releases must be
performed from this directory.

The directory:

    ~/Documents/tools/norcini_workbench_versions_backup

contains historical snapshots only. Do not edit, build, run releases from,
or restore `.git` metadata inside these snapshots during normal development.

Before making changes, verify:

    cd ~/Documents/tools/norcini_workbench
    pwd
    git status
    grep '"version"' package.json