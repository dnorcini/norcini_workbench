#!/bin/bash
set -e

cd "$(dirname "$0")/.."

if [ "$(uname -s)" != "Darwin" ]; then
  echo "ERROR: macOS is required to install Norcini Workbench.app"
  exit 1
fi

echo "===== INSTALL DEPENDENCIES ====="
npm install

echo
echo "===== BUILD MAC APP ====="
npm run pack:mac

echo
echo "===== FIND BUILT APP ====="
APP="$(find dist -maxdepth 3 -name "Norcini Workbench.app" -print -quit)"

if [ -z "$APP" ]; then
  echo "ERROR: Could not find built Norcini Workbench.app"
  exit 1
fi

if [ ! -f "$APP/Contents/Resources/app.asar" ] || \
   [ ! -f "$APP/Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node" ]; then
  echo "ERROR: Built app is missing app.asar or the native node-pty module"
  exit 1
fi

echo "Built app:"
echo "$APP"

echo
echo "===== INSTALL TO /Applications ====="

DEST="/Applications/Norcini Workbench.app"
BACKUP="/Applications/Norcini Workbench.app.previous"

if [ -d "$DEST" ]; then
  rm -rf "$BACKUP"
  mv "$DEST" "$BACKUP"
  echo "Previous app backed up to:"
  echo "$BACKUP"
fi

cp -R "$APP" "$DEST"

if [ ! -f "$DEST/Contents/Resources/app.asar" ] || \
   [ ! -f "$DEST/Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node" ]; then
  echo "ERROR: Installed app failed bundle verification"
  exit 1
fi

echo
echo "Installed:"
echo "$DEST"

echo
echo "===== LAUNCH ====="
open "$DEST"

echo
echo "Done."
