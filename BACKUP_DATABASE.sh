#!/bin/bash

# Backup Car Film PostgreSQL Database
# Usage: bash BACKUP_DATABASE.sh [backup_dir]

BACKUP_DIR="${1:-.}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/slim_backup_$TIMESTAMP.sql"

echo "Backing up PostgreSQL database..."
echo "Output: $BACKUP_FILE"

alias docker='/Applications/Docker.app/Contents/Resources/bin/docker'

# Check if container is running
if ! docker ps 2>/dev/null | grep -q postgres-slim; then
    echo "ERROR: PostgreSQL container not running"
    exit 1
fi

# Backup database
docker exec postgres-slim pg_dump -U postgres slim > "$BACKUP_FILE" 2>/dev/null

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "SUCCESS: Backup saved ($SIZE)"
    echo "File: $BACKUP_FILE"
else
    echo "ERROR: Backup failed"
    exit 1
fi
