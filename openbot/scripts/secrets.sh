# shellcheck shell=bash
# The values this repository used to publish as defaults, for the secrets scripts/start.sh now makes
# fresh for each installation (docs/M1_PLAN.md D39). Sourced by start.sh, after `require-bash.sh`.
#
# A value in the settings file that is one of these is not a choice anybody made. It is what an older
# start.sh wrote into `.env` for the person, or what `cp .env.example .env` copied from an older
# example, and every other installation holds the same one. start.sh treats it as no value at all and
# replaces it, where replacing it cannot lose anything.
#
# THIS IS THE ONLY FILE THE LITERALS ARE WRITTEN IN. scripts/start-restart-guard.test.ts keeps them out
# of every other file the one-command start reads, so a default cannot quietly come back.
#
# Nothing here writes a file, prints a value or starts a process, so it can be sourced and asked
# anywhere. Bash 3.2 is enough (macOS ships it): no namerefs, no associative arrays.

# Whether VALUE is a public default of the setting NAME. Only the settings start.sh can make a value for
# are known; for any other name the answer is no.
secret_is_public_default() {
  local name="$1" value="$2"
  case "$name:$value" in
    COMPUTER_TOKEN:openbot-dev-computer-token) ;;
    SUPERVISOR_TOKEN:openbot-dev-supervisor-token) ;;
    WORKER_SHARED_SECRET:openbot-dev-worker-secret) ;;
    # Thirty-two zero bytes, base64. It passes every shape check, so only its being the example tells.
    KEY_ENCRYPTION_KEY:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=) ;;
    DATABASE_URL:*) database_url_is_public_default "$value" ;;
    *) return 1 ;;
  esac
}

# The one database address the example ever named: user openbot, password openbot, on this machine.
# Compose's own `postgres` service, in other words, and nothing the person pointed it at. A URL with any
# other password, user, host or database is theirs.
database_url_is_public_default() {
  local pattern='^postgres(ql)?://openbot:openbot@(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?/openbot(\?.*)?$'
  [[ "$1" =~ $pattern ]]
}

# The same URL with PASSWORD in place of the public one. Only for a URL that passed the check above.
database_url_with_password() {
  printf '%s' "${1/openbot:openbot@/openbot:$2@}"
}

# A new password for the database, in a form that needs no quoting in a URL, in Compose's settings or
# in the one SQL statement that sets it.
new_database_password() {
  openssl rand -hex 24
}

# The question start.sh asks the database before it will replace the vault key: how many rows hold
# something sealed with it. One number. The tables are the ones that hold anything the key seals:
#   credentials    every connection, token and pasted secret the vault keeps (`encrypted_value`)
#   saved_logins   a person's saved site passwords (`encrypted_password`)
#   sso_providers  a company sign-in provider's client secret and signing material
# A table that does not exist counts as empty, so a database from before one existed can be asked. All
# rows count, revoked ones included: a row nobody can use is still a row the old key may be the only
# way to read, and a start that cannot tell would rather leave the key. A test against a real database
# (server/tests/vault-rows-query.integration.test.ts) runs this text, and fails when a column named for
# what it holds appears in a table that is not listed here.
vault_rows_query() {
  cat <<'SQL'
select coalesce(sum(
  case when to_regclass('public.' || t) is null then 0
       else (xpath('/row/c/text()',
                   query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text::bigint
  end), 0)
from unnest(array['credentials', 'saved_logins', 'sso_providers']) as t
SQL
}
