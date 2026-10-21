#!/bin/sh
# Backup of SIMARIO (NFR-014): PostgreSQL dump + every object of the RustFS bucket + a manifest of
# row and object counts. Usage: infra/backup/backup.sh <dir>
# Writers are stopped for the duration so the dump, manifest and bucket agree: Celery worker and
# beat always; STOP_EXTRA names more (production: STOP_EXTRA="nginx", a short maintenance window).
# Production: COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod" \
#   STOP_EXTRA=nginx infra/backup/backup.sh <dir>
set -eu
DIR=${1:?usage: backup.sh <dir>}
COMPOSE=${COMPOSE:-docker compose}
STOP="worker beat ${STOP_EXTRA:-}"
mkdir -p "$DIR"
$COMPOSE stop $STOP
trap '$COMPOSE start $STOP' EXIT
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$DIR/db.dump"
$COMPOSE exec -T api python manage.py backup_manifest - > "$DIR/manifest.json"
$COMPOSE exec -T api python manage.py bucket_export - > "$DIR/bucket.tar"
echo "Cadangan tersimpan di $DIR"
