<p align="center">
  <img src="assets/readme/icon.png" width="112" alt="Norcini Workbench icon">
</p>

<h1 align="center">Norcini Workbench</h1>

<p align="center"><strong>A local-first desktop workspace for research, teaching, notes, code, documents, and ideas.</strong></p>

<p align="center">Filesystem + Org + PDFs + LaTeX + notebooks + code + a real Bash terminal.</p>

---

## Home screen

Workbench opens to a real **Home** dashboard inside the application. It is not a static marketing image. The **Home** button returns to the same dashboard at any time.

The dashboard provides direct entry points to:

- `home.org`, `inbox.org`, and `master.org`
- DAMIC-M, CCD Discovery, IDG, and RXTR Skippers
- the current AS.171.301 teaching directory
- Meetings, Lab Notebook, Reference, and Teaching sections of the Org library
- the real Bash terminal, which remains visible along the bottom

The file tree and dashboard are simply views over the existing filesystem and Org structure. No duplicate Workbench database is created.

A built-in **Syntax Guide** is planned for the Home screen so common Org, Markdown, LaTeX, linking, checkbox, TODO, table, and source-block syntax is available directly inside Workbench.

---

## What it is

Norcini Workbench is a lightweight macOS desktop front end over the tools that already hold the real work.

- **Filesystem stays canonical** for projects, code, data, documents, manuscripts, figures, and course material.
- **Org stays canonical** for notes, tasks, projects, meetings, logs, and navigation.
- **Zotero stays canonical** for papers and bibliographic metadata.
- **DokuWiki stays useful** for group-facing durable knowledge.
- **Paper agenda remains useful** for daily execution.
- **Workbench does not create a new database.**

The aim is simple: make the existing academic workflow easier to navigate without replacing the underlying tools.

Workbench is a front end over the existing system, not a replacement for it.

---

## Core design principles

Norcini Workbench is intentionally:

- local-first
- reversible
- understandable
- filesystem-native
- compatible with existing tools
- rebuildable from source
- usable without AI
- conservative about modifying existing files

The underlying files remain ordinary files on disk.

Workbench should never require migrating research, teaching, or notes into a proprietary application database.

---

## Current desktop experience

- GitHub-inspired light interface
- dark terminal only
- file navigator over real local folders
- Home dashboard
- rendered Org and Markdown as the primary reading view
- optional Quick Edit with conflict protection
- clickable Org TODO/DONE states
- clickable Org checkboxes
- internal Org/file links open inside Workbench
- PDF preview
- Python execution
- R execution
- shell execution
- LaTeX build workflow
- notebook support under active development
- real `/bin/bash -l` PTY terminal using `node-pty` and xterm
- Tab completion
- shell history
- Ctrl-C
- interactive CLI programs
- **Terminal Here** for the selected file or folder
- live filesystem refresh
- resizable panes
- back/forward navigation
- Open in macOS
- native macOS application name
- NW Dock icon

The application is intended to feel more like a lightweight academic desktop environment than a conventional note-taking app.

---

## Current local roots

Workbench currently exposes these real locations:

```text
~/org
~/Documents/hopkins
~/Documents
~/Desktop/inbox