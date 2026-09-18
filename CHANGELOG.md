# Changelog

## 0.8.1 - Security dependency refresh

- Upgraded Electron from the 37.x line to pinned `44.4.3`.
- Upgraded `@electron/rebuild` from 3.7.2 to pinned `4.2.0`.
- Kept `node-pty` at stable 1.1.0 and retained the existing PTY/application architecture.
- Removed the 0.8.0 lockfile rather than shipping a stale lockfile that no longer matched `package.json`.
- The first `npm install` on the target Mac regenerates `package-lock.json`; that generated lockfile should be committed to GitHub after the install/audit succeeds.
- No filesystem reorganization or user-data migration is performed.

## 0.8.0

- Built directly from Electron 0.7.4.
- Preserved the working `node-pty` / xterm Bash architecture.
- Switched the application chrome to a light GitHub-inspired design while retaining a dark terminal.
- Added Back and Forward navigation.
- Added visible current-path context.
- Added Open in macOS for the current file.
- Added a macOS application icon source.
- Added initial architecture, dependency, rebuild, development, changelog, and AI integration documentation.

## 0.7.4

- Restored xterm native `onData` keyboard forwarding to the PTY.
- Fixed carriage-return handling.
- Confirmed normal typing, Tab completion, history, Ctrl-C/Ctrl-D, and interactive Bash behavior.
