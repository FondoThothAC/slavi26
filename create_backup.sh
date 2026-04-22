#!/bin/bash
cd "$(dirname "$0")"

# --- SLAVI Backup Utility ---
# Creates a ZIP archive of the source code and configuration.

VERSION="2.2.0"
DATE=$(date +"%Y-%m-%d_%H-%M")
BACKUP_DIR="backups"
BACKUP_NAME="slavi_v${VERSION}_${DATE}.zip"

# Create backups directory if not exists
mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup: $BACKUP_NAME ..."

# Zip src, scripts, config, and root files
zip -r "$BACKUP_DIR/$BACKUP_NAME" src scripts config .env package.json tsconfig.json README.md start_slavi.* -x "*.DS_Store*" "*/node_modules/*" "*/dist/*" "*/logs/*" "*/data/*" "*/.git/*"

if [ $? -eq 0 ]; then
    echo "✅ Backup created successfully in $BACKUP_DIR/$BACKUP_NAME"
else
    echo "❌ Error: Failed to create backup."
    exit 1
fi
