#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Norcini Workbench Desktop 0.8.0 installer"
echo

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm are required to build the desktop app."
  echo "Install Node with Homebrew, then run this installer again:"
  echo
  echo "  brew install node"
  echo
  read -p "Press Return to close..."
  exit 1
fi

echo "Installing dependencies..."
npm install

echo
echo "Building the macOS app..."
npm run pack:mac

echo
echo "Build complete."
APP=$(find dist -maxdepth 3 -name "Norcini Workbench.app" -print -quit 2>/dev/null || true)
if [ -n "$APP" ]; then
  echo "App: $APP"
  open -R "$APP"
fi

echo
read -p "Press Return to close..."