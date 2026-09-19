#!/bin/bash
set -e

cd "$(dirname "$0")/.."

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

echo
echo "Installed:"
echo "$DEST"

echo
echo "===== LAUNCH ====="
open "$DEST"

echo
echo "Done."
