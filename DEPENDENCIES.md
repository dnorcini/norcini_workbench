# Dependencies

Norcini Workbench is intentionally small. The application has no database and no local server.

## Required to build

- macOS
- Node.js and npm
- Xcode Command Line Tools when `node-pty` needs native compilation

Check:

```bash
node --version
npm --version
xcode-select -p
```

## Application dependencies

| Package | Version | Role |
| --- | --- | --- |
| Electron | 44.4.3 | macOS desktop shell and Chromium renderer |
| node-pty | ^1.1.0 | real pseudo-terminal backend |
| xterm | 5.3.0 | terminal renderer |
| xterm-addon-fit | 0.8.0 | fit terminal to pane |
| @electron/rebuild | 4.2.0 | rebuild native modules for Electron's ABI |
| electron-builder | ^26.0.12 | package the macOS `.app`, DMG, and ZIP |

## External tools used when available

Workbench launches ordinary command-line tools rather than bundling replacements. Depending on what you do, this may include Bash, Python, R, Jupyter, LaTeX, Git, SSH, or Emacs.

LaTeX lookup includes `/Library/TeX/texbin` and common Homebrew/system locations.

## Lockfile

After the first successful `npm install`, keep the generated `package-lock.json` in the repository. It is part of the reproducible build record.

Do not routinely use `npm audit fix --force`. Major dependency changes should be explicit, documented, and tested against the PTY terminal.
