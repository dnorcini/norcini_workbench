# Changelog

## 0.9.0 in development

- Polished the Home dashboard, Help menu, Create dialog, generated-output gallery, and notebook rendering.
- Added configurable Home cards, recent Org notes, independent Workbench instances, and Files navigation to the parent folder or macOS home folder.
- Added rendered Org and Markdown editing experiments with autosave, source synchronization, list handling, and conflict protection.
- Added Markdown and Org syntax reference material, keyboard shortcut documentation, and packaged-app verification.
- Added read-only portability diagnostics, `scripts/doctor.sh`, and the recovery workflow for new Macs and rebuilds.
- Recorded the tested Node.js 26 and npm 11 environment without upgrading application dependencies.
- The 0.9.0 work remains in development and is not yet a frozen release baseline.

## 0.8.3 final baseline

- Added file and folder creation, autosave, smart list continuation, and LaTeX live save/build/PDF refresh.
- Added the 60-day Org agenda and preserved rendered scroll position when toggling Org checkboxes and TODO states.
- Synchronized Files and the Bash terminal in both directions; `wb FILE` and `wb .` open terminal paths in Workbench.
- Added C, C++, and ROOT execution. Uppercase `.C` macros run with `root -l -q`.
- Added a generated-output gallery with source-aware matching where possible, plus the Help dropdown.
- Kept the top filesystem shortcuts to `org`, `hopkins`, and `teaching`, and Help as the last top-toolbar button.
- Added `RELEASE.md` and `npm run install:mac` for the normal packaged install at `/Applications/Norcini Workbench.app`.
- `v0.8.3-final` marks the frozen baseline; `v0.8.3` marks an earlier 0.8.3 commit.

## 0.8.3 earlier tag

- Added the Home dashboard as the default launch view, with links to core Org files, projects, teaching, and Org library sections.
- Home navigation closes Quick Edit and disables file-specific actions until a file is selected.
- Updated the displayed application version to 0.8.3.

## 0.8.2

- Refined macOS packaging configuration and artifact naming for the app, DMG, and ZIP builds.
- Set the development app name and Dock icon.
- Updated installation and rebuild documentation.

## 0.8.1

### Security and dependencies
- Electron pinned to 44.4.3.
- `@electron/rebuild` pinned to 4.2.0.
- `node-pty` retained on the stable 1.1.x line.
- Native PTY rebuild remains part of `npm install`.

### macOS application
- Stable product name: **Norcini Workbench**.
- Stable bundle identifier: `org.norcini.workbench`.
- NW application icon configured for packaged macOS builds.
- Development launches set the NW Dock icon on macOS as well.
- `npm run pack:mac` creates a normal `.app`.
- `npm run dist:mac` creates macOS DMG and ZIP artifacts.
- `INSTALL.command` provides a one-time build/install path and can copy the app into `/Applications`.

### Presentation and documentation
- Rebuilt README as the project landing page.
- Added product overview artwork and icon assets for the README.
- Retained architecture, dependency, rebuild, development, changelog, and AI integration documentation.
- Corrected the visible application version to 0.8.1.

### Architecture
- No Workbench database introduced.
- Stable 0.7.4 Bash PTY architecture preserved.
- Existing filesystem, Org, rendering, execution, and Quick Edit paths retained.

## 0.8.0
- Light GitHub-inspired desktop shell.
- Dark terminal only.
- Back/forward navigation and current-path display.
- Cleaner file browser and rendered-view-first layout.
- Open-in-macOS action.

## 0.7.4
- Known-good Electron PTY baseline.
- Real Bash keyboard input restored through xterm `onData`.
- Tab completion, history, Ctrl-C/Ctrl-D, and interactive programs verified in the architecture.
