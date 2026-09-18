# Rebuild on a clean Mac

1. Install Apple Xcode Command Line Tools.
2. Install a current Node.js/npm compatible with this repository. Record any future required version here before upgrading the project.
3. Copy or clone the Workbench source tree.
4. In Terminal, `cd` into the source tree.
5. Run `npm install`. This also rebuilds `node-pty` for Electron.
6. Run `npm start` and verify the embedded Bash terminal accepts typing, Tab, history arrows, and Ctrl-C.
7. Run `npm run pack:mac`.
8. Launch the generated `Norcini Workbench.app` from `dist/`.
9. Move the tested app to `/Applications` or `~/Applications`.

Before changing Electron versions, make a known-good source snapshot. Native PTY compatibility is the highest-risk dependency boundary.
