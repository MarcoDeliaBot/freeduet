#!/bin/sh
# Migrations, for the embedded database only.
#
# An external database is somebody else's release process: two replicas starting together would
# race, and a failed migration should stop a deploy rather than leave a half-migrated database
# serving. An embedded one has exactly one process and no deploy pipeline, so doing it here is the
# difference between the container working and the operator reading a runbook.
set -eu
[ "${EMBEDDED_POSTGRES:-off}" = "on" ] || exit 0

# The `postgres` service is `up` as soon as its process starts, not when it answers. Postgres refuses
# connections (57P03, "the database system is starting up") until it has finished starting, and the
# migration exits 1 on the first refusal. So wait until it accepts connections, for at most
# MIGRATE_WAIT_SECONDS (default 60), then migrate. Running out of time exits 1, as a failed migration does.
#
# Host, port and user are the ones DATABASE_URL names in this image and postgres/run binds. The URL
# itself is not given to pg_isready: its password would sit in this process's argument list, where
# any user in the container can read it with ps. pg_isready only asks whether the server answers, so
# it needs no password.
wait_for_postgres() {
  limit="${MIGRATE_WAIT_SECONDS:-60}"
  deadline=$(( $(date +%s) + limit ))
  announced=0
  while ! pg_isready -q -h 127.0.0.1 -p 5432 -U openbot; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "migrate: embedded Postgres did not accept connections within ${limit}s (MIGRATE_WAIT_SECONDS), so nothing was migrated." >&2
      exit 1
    fi
    if [ "$announced" = 0 ]; then
      echo "migrate: waiting for embedded Postgres to accept connections"
      announced=1
    fi
    sleep 1
  done
}
wait_for_postgres
cd /app/server
export HOME=/home/apiuser
# `scripts/migrate.ts`, not `drizzle-kit`. The CLI is a development dependency and needs esbuild to
# read its TypeScript config, which `bun install --production` leaves out of this image: asked to
# migrate here it exits 1 without printing why, and the container comes up against an empty database.
exec s6-setuidgid apiuser /usr/local/bin/bun scripts/migrate.ts
