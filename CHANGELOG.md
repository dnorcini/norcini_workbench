# Changelog

## 0.8.1 - release baseline

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
- Tab completion, history, Ctrl-C/Ctrl-D, interactive programs, and Terminal Here verified in the architecture.
