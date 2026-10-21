#!/bin/sh
# Restore of SIMARIO from infra/backup/backup.sh output, on a stack where api and db run.
# Writers are stopped (Celery worker and beat; STOP_EXTRA names more, e.g. nginx in production),
# the database is replaced in one transaction (pg_restore --clean --single-transaction), pending
# migrations are applied, bucket objects are written back, then the manifest is compared.
# Usage: PYTHON=python3 infra/backup/restore.sh <dir>
set -eu
DIR=${1:?usage: restore.sh <dir>}
COMPOSE=${COMPOSE:-docker compose}
STOP="worker beat ${STOP_EXTRA:-}"
$COMPOSE stop $STOP
trap '$COMPOSE start $STOP' EXIT
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$DIR/db.dump"
$COMPOSE exec -T api python manage.py migrate --noinput
$COMPOSE exec -T api python manage.py init_storage
$COMPOSE exec -T api python manage.py bucket_import - < "$DIR/bucket.tar"
$COMPOSE exec -T api python manage.py backup_manifest - > "$DIR/manifest.restored.json"
"${PYTHON:-python3}" "$(dirname "$0")/verify.py" "$DIR/manifest.json" "$DIR/manifest.restored.json"
