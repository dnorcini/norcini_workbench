# Norcini Workbench Recovery

The workflow may be relied upon; the implementation must remain replaceable.
Workbench is a front end over ordinary files and external systems. If the app
disappeared, the canonical Org files, project files, PDFs, code, Zotero data,
and DokuWiki content would still be readable with their normal tools.

## New Mac setup

1. Install macOS updates, Xcode Command Line Tools, Node.js 26, and the tools
   needed for the work you do: Python, R, ROOT, LaTeX, Git, and Zotero.
2. Restore or sync the canonical files so these paths exist when applicable:
   `~/org`, `~/Documents/hopkins`, and `~/Documents/hopkins/teaching`.
3. Clone the repository and select the recorded Node version:

   ```bash
   git clone https://github.com/dnorcini/norcini_workbench.git ~/Documents/tools/norcini_workbench
   cd ~/Documents/tools/norcini_workbench
   nvm use
   npm install
   ```

4. Run the read-only environment check with `./scripts/doctor.sh`.
5. Test with `npm start`, then build and install with `npm run install:mac`.
6. Confirm Files, terminal, Org agenda, PDF view, and the tools you use.

## After a macOS upgrade

Run `./scripts/doctor.sh`, then check permissions for the canonical folders.
If the native terminal or packaged app fails, run `npm install` and
`npm run install:mac` from the repository. Recheck Python, R, ROOT, LaTeX, and
Workbench filesystem access.

## If the packaged app is broken

The canonical files are independent of the app. Open and edit them directly
with Finder, a terminal editor, Emacs, or another application. From the clean
repository, run `npm install` followed by `npm run install:mac`. The installer
keeps the prior app at `/Applications/Norcini Workbench.app.previous`.

## Complete rebuild from source

```bash
xcode-select --install
cd ~/Documents/tools/norcini_workbench
nvm use
npm install
./scripts/doctor.sh
npm start
npm run pack:mac
npm run install:mac
```

The expected native terminal module is
`node_modules/node-pty/build/Release/pty.node`. The local build is unsigned;
macOS may require opening it once from Finder.

## Backup and recovery principles

Back up `~/org`, `~/Documents/hopkins`, the teaching folder, PDFs, code,
Zotero data, and any DokuWiki content or export. The repository, lockfile, and
packaging scripts are reconstructable from Git, but keeping the repository
clone makes recovery faster. Workbench UI preferences such as Home layout are
stored in Electron user data and are useful but not canonical; they can be
recreated in the app.

Workbench must never be the only place where an important note, task, project,
or paper exists.

## New Mac walkthrough

On a brand-new Mac, install prerequisites, restore canonical folders, clone the
repository, run `nvm use`, run `npm install`, and run `./scripts/doctor.sh`.
Fix every required `MISSING` or `BROKEN` result. Start with `npm start` for a
smoke test, then run `npm run install:mac` and open the app from
`/Applications`. The remaining manual step is restoring external Zotero or
DokuWiki connections and confirming macOS permissions.
