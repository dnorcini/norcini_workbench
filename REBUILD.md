# Rebuild Norcini Workbench on a clean Mac

This file is the shortest path from source code to a normal macOS application.

## 1. Install build prerequisites

Install Node.js/npm. Homebrew is convenient but not required.

```bash
brew install node
xcode-select --install
```

The current tested environment is Node.js 26.0.0 with npm 11. Use `nvm use`
from the repository when using nvm.

If the Xcode Command Line Tools are already installed, macOS will say so.

## 2. Obtain the source

Clone the Git repository or copy the release source folder to a permanent location such as:

```text
~/Documents/tools/norcini_workbench
```

## 3. Install dependencies

```bash
cd ~/Documents/tools/norcini_workbench
npm install
```

Run `./scripts/doctor.sh` before packaging to identify missing tools or paths.

The `postinstall` step runs `@electron/rebuild` for `node-pty`. This native rebuild is required for the real Bash PTY.

Keep the resulting `package-lock.json`.

## 4. Test the development build

```bash
npm start
```

Verify at minimum:

- the window opens as Norcini Workbench
- the NW icon appears in the Dock
- terminal input works
- Tab completion and shell history work
- Ctrl-C works
- Files navigation changes the terminal directory, and terminal `cd` updates Files
- `wb FILE` and `wb .` open paths in Workbench
- Org/Markdown files render
- a PDF opens

## 5. Build the normal macOS app

```bash
npm run pack:mac
```

Electron Builder writes `Norcini Workbench.app` under `dist/` in an architecture-specific folder.

For normal installation to `/Applications`, follow [`RELEASE.md`](RELEASE.md) and run `npm run install:mac` from the repository root.

## 6. Build distributable artifacts

```bash
npm run dist:mac
```

This produces a DMG and ZIP in `dist/`.

## 7. First launch

The current app is not code-signed or notarized. macOS may block the first ordinary double-click. If so, right-click the app and choose **Open** once.

## Rebuild philosophy

The filesystem remains canonical. Rebuilding Workbench should never require importing a Workbench database or migrating user content. The application simply reconnects to the same local roots.
