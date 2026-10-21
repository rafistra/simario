#!/bin/sh
# Backup of SIMARIO (NFR-014): PostgreSQL dump + every object of the RustFS bucket + a manifest of
# row and object counts. Usage: infra/backup/backup.sh <dir>
# Production: COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod" infra/backup/backup.sh <dir>
set -eu
DIR=${1:?usage: backup.sh <dir>}
COMPOSE=${COMPOSE:-docker compose}
mkdir -p "$DIR"
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$DIR/db.dump"
$COMPOSE exec -T api python manage.py bucket_export - > "$DIR/bucket.tar"
$COMPOSE exec -T api python manage.py backup_manifest - > "$DIR/manifest.json"
echo "Cadangan tersimpan di $DIR"
