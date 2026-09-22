# Norcini Workbench Release and Installation

## Normal local install

From the repository root:

    npm run install:mac

This runs `./scripts/install-mac.sh`, builds the macOS app, backs up any existing installed copy, installs the new build at:

    /Applications/Norcini Workbench.app

and launches it.

For a new machine or a damaged installation, read `RECOVERY.md` first and run
`./scripts/doctor.sh` before installing.

The previous installed copy is preserved as:

    /Applications/Norcini Workbench.app.previous

## Development mode

Run:

    npm start

Use this only while developing. For normal daily use, launch the packaged app in `/Applications`.

## Build without installing

Run:

    npm install
    npm run pack:mac

Find the built app with:

    find dist -maxdepth 3 -name "Norcini Workbench.app" -print

## macOS signing warning

electron-builder may report that it skipped macOS code signing because no valid Developer ID Application identity was found.

That is expected for the current local build. Signing and notarization are needed before distributing the app broadly to other Macs.

## Release checklist

Before pushing a release, verify:

- Home opens
- Filesystem navigation works
- terminal `cd` and Files stay synchronized
- `wb FILE` opens the requested file
- Quick Edit works
- autosave works
- Org TODO and checkbox interaction works
- LaTeX builds and refreshes PDF output
- Python, R, C and C++ execution works
- ROOT macros run
- generated plots render correctly
- Help menu works

Then:

    git status
    grep '"version"' package.json
    git add -A
    git commit -m "Finalize Norcini Workbench <version>"
    git push origin "$(git branch --show-current)"

## Normal update workflow

    cd ~/Software/norcini_workbench
    git pull
    npm run install:mac
