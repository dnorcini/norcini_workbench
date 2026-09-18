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


## 0.8.1 security baseline

The runtime/toolchain refresh pins Electron to `44.4.3` and `@electron/rebuild` to `4.2.0`. `node-pty` remains at stable 1.1.0. Because the build environment used to prepare this source archive could not reliably reach the npm registry, a new lockfile is intentionally not fabricated here. Run `npm install` on the target Mac, verify `npm audit`, then commit the generated `package-lock.json` to the repository.
