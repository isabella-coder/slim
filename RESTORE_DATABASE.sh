#!/bin/bash

# Restore Car Film PostgreSQL Database from Backup
# Usage: bash RESTORE_DATABASE.sh <backup_file>

BACKUP_FILE="$1"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: bash RESTORE_DATABASE.sh <backup_file>"
    echo ""
    echo "Example:"
    echo "  bash RESTORE_DATABASE.sh slim_backup_20260308_172105.sql"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "ERROR: POSTGRES_PASSWORD is required"
    echo "Example: export POSTGRES_PASSWORD='your-db-password'"
    exit 1
fi

echo "Restoring PostgreSQL database from backup..."
echo "Source: $BACKUP_FILE"
echo ""
echo "WARNING: This will drop and recreate the 'slim' database!"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

alias docker='/Applications/Docker.app/Contents/Resources/bin/docker'

# Check if container is running
if ! docker ps 2>/dev/null | grep -q postgres-slim; then
    echo "Starting PostgreSQL container..."
    docker run --name postgres-slim -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
        -p 5432:5432 -v postgres_data:/var/lib/postgresql/data -d postgres:15 > /dev/null 2>&1
    sleep 3
fi

echo "Dropping existing database..."
docker exec postgres-slim psql -U postgres -c "DROP DATABASE IF EXISTS slim;" 2>/dev/null

echo "Creating new database..."
docker exec postgres-slim psql -U postgres -c "CREATE DATABASE slim;" 2>/dev/null

echo "Restoring data from backup..."
cat "$BACKUP_FILE" | docker exec -i postgres-slim psql -U postgres slim > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "SUCCESS: Database restored"
    echo ""
    # Verify
    COUNT=$(docker exec postgres-slim psql -U postgres slim -t -c "SELECT COUNT(*) FROM orders;" 2>/dev/null)
    echo "Verification: $COUNT orders in restored database"
else
    echo "ERROR: Restore failed"
    exit 1
fi
