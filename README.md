<p align="center">
  <img src="assets/readme/icon.png" width="112" alt="Norcini Workbench icon">
</p>

<h1 align="center">Norcini Workbench</h1>

<p align="center"><strong>A local-first desktop workspace for research, teaching, notes, code, documents, and ideas.</strong></p>

<p align="center">Filesystem + Org + PDFs + LaTeX + notebooks + code + a real Bash terminal.</p>



## Build and install the Mac app

For the normal local release/install workflow:

    npm run install:mac

This packages Norcini Workbench, installs it at:

    /Applications/Norcini Workbench.app

and launches the installed application.

See `RELEASE.md` for the full packaging, backup, code-signing, and release procedure.

For a new Mac, macOS upgrade, or broken installation, follow `RECOVERY.md` and
run `scripts/doctor.sh`. Canonical files remain in ordinary folders and
external systems so the app can be rebuilt or replaced.

## Home screen

Workbench now opens to a real **Home** dashboard inside the application. It is not a static marketing image. The Home button returns to the same dashboard at any time.

The dashboard provides direct entry points to:

- `home.org`, `inbox.org`, and `master.org`
- DAMIC-M, CCD Discovery, IDG, and RXTR Skippers
- the current AS.171.301 teaching directory
- Meetings, Lab Notebook, Reference, and Teaching sections of the Org library
- the real Bash terminal, which remains visible along the bottom

The file tree and dashboard are simply views over the existing filesystem and Org structure. No duplicate Workbench database is created.

## Independent Workbench instances

To keep separate Workbench sessions on different macOS desktops, launch another app process with:

    open -n -a "Norcini Workbench"

Each instance has its own Files location, rendered view, Quick Edit state, and integrated terminal. The filesystem and Org files remain shared and canonical. A `wb FILE` command is handled by the instance whose terminal ran it.

Org and Markdown open in rendered view and can be edited directly in that view. **Show source** still opens the synchronized source editor when you need it. Notebook files render their cells and outputs, while code files open with source visible. LaTeX opens its source first, with a sibling PDF available for viewing after a build. Org and Markdown previews update while keeping their scroll position.

The Files pane includes controls to move up one folder or jump to your macOS home folder. Home can also show the most recently edited notes from the Org library.

### Keyboard shortcuts

- `⌘S` or `Ctrl-S` saves the current file.
- `Esc` closes the Help menu.
- In rendered Org or Markdown, `Enter` splits a block and `Backspace` or `Delete` joins blocks at their boundaries.
- In Quick Edit, `Enter` continues a non-empty bullet, checkbox, or numbered list. Pressing `Enter` on an empty item exits the list.
- In the Bash terminal, `Tab` completes commands, the arrow keys browse shell history, `Ctrl-C` interrupts a command, and `Ctrl-D` sends EOF or exits the shell.

These terminal keys retain ordinary Bash and xterm behavior. Workbench does not replace the underlying Org editing conventions.

Click **Edit** at the lower right of the Home header to change its text and the cards inside Workbench. You can add, remove, and reorder cards; change their labels, titles, notes, links, and agenda display; and save the result. The settings live in a local `home-shortcuts.json` file. Existing project and course shortcuts are carried into the editor on first use. This file contains Home presentation and navigation preferences only.

## What it is

Norcini Workbench is a lightweight macOS desktop front end over the tools that already hold the real work.

- **Filesystem stays canonical** for projects, code, data, documents, manuscripts, figures, and course material.
- **Org stays canonical** for notes, tasks, projects, meetings, logs, and navigation.
- **Zotero stays canonical** for papers and bibliographic metadata.
- **DokuWiki stays useful** for group-facing durable knowledge.
- **Workbench does not create a new database.**

The aim is simple: make the existing academic workflow easier to navigate without replacing the underlying tools.

## Current desktop experience

- GitHub-inspired light interface
- file navigator over real local folders
- rendered Org and Markdown as the primary reading view
- optional Quick Edit with conflict protection
- clickable Org TODO/DONE states and checkboxes
- internal Org/file links open inside Workbench
- PDF preview
- Python, R, shell, LaTeX, and notebook actions
- real interactive Bash PTY terminal using `node-pty` and xterm
- Tab completion, shell history, Ctrl-C, interactive CLI programs
- Files and terminal directory stay synchronized in both directions
- `wb FILE` and `wb .` open terminal paths in Workbench
- live filesystem refresh
- resizable panes
- native macOS application name and NW Dock icon

## Install the macOS app

Run `npm run install:mac` from the repository root. It installs dependencies, builds the app, backs up the previous installed copy, installs to `/Applications/Norcini Workbench.app`, and launches it. See [`RELEASE.md`](RELEASE.md) for the canonical release and install workflow, including build-only and distributable artifact commands.

## Development launch

```bash
npm install
npm start
```

The development build also sets the NW Dock icon so it does not present as generic Electron while testing on macOS.

## Local roots

Workbench currently exposes these real locations:

```text
~/org
~/Documents/hopkins
~/Documents
~/Desktop/inbox
```

No project files are copied into Workbench. The sidebar is a navigator over the filesystem.

## Terminal architecture

The embedded terminal is not a fake command box. It is a real Bash pseudo-terminal:

```text
Electron main process
       │
       ├── node-pty
       │      └── /bin/bash --rcfile workbench-bashrc -i
       │
       └── IPC bridge
              └── xterm renderer
```

The generated rc file sources `~/.bash_profile` if present, otherwise `~/.bashrc`, and sets up Workbench's `wb` command and directory reporting. This preserves ordinary interactive shell behavior, including Tab completion, history, `ssh`, REPLs, `emacs -nw`, and Ctrl-C.

## Source-of-truth philosophy

Workbench is intentionally a **navigator + viewer + launcher + lightweight editor**.

It is not intended to become the place where research data, notes, references, or project metadata have to be migrated. The design is local-first, reversible, and understandable.

## Documentation

- [`RELEASE.md`](RELEASE.md): canonical release and install workflow
- [`ARCHITECTURE.md`](ARCHITECTURE.md): application structure and major architectural choices
- [`DEPENDENCIES.md`](DEPENDENCIES.md): runtime and build dependencies
- [`REBUILD.md`](REBUILD.md): reconstruct the application on a clean Mac
- [`DEVELOPMENT.md`](DEVELOPMENT.md): development workflow
- [`CHANGELOG.md`](CHANGELOG.md): version history
- [`AI_INTEGRATION.md`](AI_INTEGRATION.md): future optional AI boundary

## Version

Current development version: **0.9.0**. The frozen functional 0.8.3 baseline remains available at tag `v0.8.3-final`. The earlier `v0.8.3` tag points to a prior 0.8.3 commit.

## Future AI

AI is deliberately **not** fundamental to the Workbench architecture. A future optional layer may receive explicit context such as the open file, selected text, project folder, Org tasks, terminal output, Zotero references, or a local search result. The filesystem, Org, and Zotero remain the sources of truth.
