# Dependencies

The authoritative dependency versions are `package.json` plus `package-lock.json`. Use `npm install` rather than manually installing individual packages.

Core runtime dependencies:

- Electron: desktop shell and Chromium renderer
- node-pty: real interactive Bash PTY
- xterm: terminal UI
- xterm-addon-fit: fits the terminal to the resizable pane

Build dependencies:

- electron-builder: macOS `.app` packaging
- @electron/rebuild: rebuilds native `node-pty` for Electron's ABI

External tools are optional and discovered from normal macOS/Homebrew locations: Python 3, R/Rscript, Jupyter, `latexmk` or `pdflatex`.

For a reproducible install, do not delete or casually regenerate `package-lock.json`.
