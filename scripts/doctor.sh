#!/usr/bin/env bash
set -u

# Read-only environment report for Norcini Workbench.
# Status vocabulary is shared with the in-app System Check: OK, WARNING,
# MISSING, and BROKEN.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
HOME_DIR="${HOME:-}"

ok() { printf 'OK       %-24s %s\n' "$1" "$2"; }
warning() { printf 'WARNING  %-24s %s\n' "$1" "$2"; }
missing() { printf 'MISSING  %-24s %s\n' "$1" "$2"; }
broken() { printf 'BROKEN   %-24s %s\n' "$1" "$2"; }

check_command() {
  local label="$1" command_name="$2"
  shift 2
  if ! command -v "$command_name" >/dev/null 2>&1; then
    missing "$label" "$command_name is not on PATH"
    return
  fi
  local detail
  detail="$($command_name "$@" 2>&1 | head -n 1)"
  if [ -n "$detail" ]; then ok "$label" "$detail"; else ok "$label" "available"; fi
}

check_path() {
  local label="$1" target="$2" required="${3:-yes}" writable="${4:-yes}"
  if [ ! -e "$target" ]; then
    if [ "$required" = yes ]; then missing "$label" "$target"; else warning "$label" "$target is not present"; fi
    return
  fi
  if [ ! -r "$target" ]; then broken "$label" "$target is not readable"; return; fi
  if [ "$writable" = yes ] && [ -d "$target" ] && [ ! -w "$target" ]; then broken "$label" "$target is not writable"; return; fi
  if [ "$writable" = yes ] && [ -f "$target" ] && [ ! -w "$target" ]; then broken "$label" "$target is not writable"; return; fi
  if [ "$writable" = yes ]; then ok "$label" "$target (read/write)"; else ok "$label" "$target (readable)"; fi
}

printf 'Norcini Workbench doctor (read-only)\n'
printf 'Repository: %s\n\n' "$REPO"

if [ "$(uname -s)" = Darwin ]; then
  ok "macOS" "$(sw_vers -productVersion 2>/dev/null || printf 'version unavailable')"
else
  warning "macOS" "running on $(uname -s), not macOS"
fi
ok "CPU architecture" "$(uname -m)"
check_command "Node.js" node --version
check_command "npm" npm --version
check_command "Git" git --version
check_command "Bash" bash --version
check_command "Python" python3 --version
check_command "R" Rscript --version
check_command "ROOT" root-config --version
check_command "latexmk" latexmk --version
check_command "pdflatex" pdflatex --version

if [ "$PWD" = "$REPO" ]; then ok "Repository location" "$REPO"; else warning "Repository location" "run from $REPO (current: $PWD)"; fi
check_path "Org root" "$HOME_DIR/org"
check_path "Hopkins root" "$HOME_DIR/Documents/hopkins"
check_path "Teaching root" "$HOME_DIR/Documents/hopkins/teaching" no
check_path "Zotero data" "$HOME_DIR/Zotero" no no
check_path "Zotero application" "/Applications/Zotero.app" no no
check_path "Packaged app" "/Applications/Norcini Workbench.app" no no
check_path "node_modules" "$REPO/node_modules"
check_path "node-pty native module" "$REPO/node_modules/node-pty/build/Release/pty.node"
check_path "package lock" "$REPO/package-lock.json"

if [ -f "$REPO/node_modules/electron/package.json" ]; then
  electron_version="$(node -e "process.stdout.write(require('./node_modules/electron/package.json').version)" 2>/dev/null || true)"
  ok "Electron dependency" "electron ${electron_version:-available}"
else
  missing "Electron dependency" "$REPO/node_modules/electron/package.json"
fi

if [ -r "$HOME_DIR/org" ] && [ -w "$HOME_DIR/org" ]; then
  ok "Canonical data access" "Org and project roots are readable and writable"
else
  broken "Canonical data access" "Org root is not readable and writable"
fi

printf '\nNo files, permissions, installs, or settings were changed.\n'
