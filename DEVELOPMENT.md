# Development

## Normal development loop

```bash
npm install
npm start
```

Use Node.js 26.0.0 with npm 11 (`nvm use` reads `.nvmrc`). Run
`./scripts/doctor.sh` for a read-only machine and dependency report.

Application source lives under `src/`.

- `src/main.js` owns native filesystem, PTY, shell, and packaging-facing behavior.
- `src/preload.js` exposes the controlled IPC bridge.
- `src/renderer/` owns the visible desktop interface.
- `assets/icon.png` is the canonical application/Dock icon source.

## Do not casually replace the PTY path

Electron 0.7.4 established the terminal path, which the current implementation extends with a generated Bash rc file:

```text
xterm -> preload IPC -> Electron main -> node-pty -> /bin/bash --rcfile workbench-bashrc -i
```

That path is foundational. UI work should not replace it with `exec`, a fake command box, or a browser terminal abstraction.

## Versioning

The current development line is `0.9.0`. The frozen functional baseline is `0.8.3` at `v0.8.3-final`.

Keep `main` usable. Mark known-good releases with annotated Git tags such as:

```bash
git tag -a v<version> -m "Norcini Workbench v<version>"
git push origin v<version>
```

Use branches for substantial experiments. Tauri is not an active development target unless explicitly revived.

## Packaging checks

Before calling a version stable:

1. `npm audit`
2. `npm start`
3. terminal typing / Tab / history / Ctrl-C
4. Files navigation changes the terminal directory, and terminal `cd` updates Files
5. `wb FILE` and `wb .` open the requested paths
6. Org rendering and Quick Edit
7. keyboard shortcuts in Help match the actual Workbench, Quick Edit, and terminal behavior
8. PDF preview
9. Python or shell execution
10. LaTeX build if available
11. `npm run pack:mac`
12. launch the packaged `.app` from Finder or `/Applications`

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
