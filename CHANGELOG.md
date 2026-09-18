# Changelog

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
