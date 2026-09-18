#!/bin/bash
set -e
cd "$(dirname "$0")"

printf '\nNorcini Workbench 0.8.3\n'
printf '=======================\n\n'

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm are required for the one-time build."
  echo "Install Node, then run INSTALL.command again."
  echo
  echo "With Homebrew:  brew install node"
  echo
  read -r -p "Press Return to close..."
  exit 1
fi

echo "1/3 Installing pinned dependencies and rebuilding node-pty..."
npm install

echo
echo "2/3 Running the dependency audit..."
npm audit || true

echo
echo "3/3 Building the macOS application..."
npm run pack:mac

APP=$(find dist -maxdepth 4 -name "Norcini Workbench.app" -print -quit 2>/dev/null || true)
if [ -z "$APP" ]; then
  echo "Build finished, but the .app could not be located automatically. Check ./dist."
  read -r -p "Press Return to close..."
  exit 0
fi

echo
echo "Built: $APP"
open -R "$APP"

echo
read -r -p "Copy Norcini Workbench.app to /Applications now? [y/N] " ANSWER
case "$ANSWER" in
  y|Y|yes|YES)
    echo "Copying to /Applications..."
    rm -rf "/Applications/Norcini Workbench.app"
    cp -R "$APP" "/Applications/Norcini Workbench.app"
    echo "Installed: /Applications/Norcini Workbench.app"
    open "/Applications/Norcini Workbench.app"
    ;;
  *)
    echo "Not installed. You can drag the .app to Applications later."
    ;;
esac

echo
read -r -p "Press Return to close..."
