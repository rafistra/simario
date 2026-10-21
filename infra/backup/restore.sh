#!/bin/sh
# Restore of SIMARIO from infra/backup/backup.sh output: the database is replaced (pg_restore
# --clean), bucket objects are written back, then the manifest is compared.
# Usage: infra/backup/restore.sh <dir>   (stop the api/worker/beat traffic first; PYTHON= any
# Python 3 for the manifest check)
set -eu
DIR=${1:?usage: restore.sh <dir>}
COMPOSE=${COMPOSE:-docker compose}
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$DIR/db.dump"
$COMPOSE exec -T api python manage.py init_storage
$COMPOSE exec -T api python manage.py bucket_import - < "$DIR/bucket.tar"
$COMPOSE exec -T api python manage.py backup_manifest - > "$DIR/manifest.restored.json"
python3 "$(dirname "$0")/verify.py" "$DIR/manifest.json" "$DIR/manifest.restored.json" \
  || python "$(dirname "$0")/verify.py" "$DIR/manifest.json" "$DIR/manifest.restored.json"
