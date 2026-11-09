#!/usr/bin/env bash
# Build the dashboard bundle IN THIS REPO from a rendered .env.
#
#   bin/dashboard-build.sh
#
# What is deliberately NOT here: SOPS, group_vars, the box, nginx. The values this
# bundle carries are infra facts (Caddy stanza hosts, section order, the HA token),
# so the repo that owns those facts renders .env and hands it to this build. Vite
# INLINES import.meta.env.VITE_* at build time, which is why the values must exist
# as a file before the compiler runs - and why a changed URL is a rebuild, never a
# restart (docs/operations.md).
#
# Inputs:  ./.env  (the VITE_* contract; infra keeps it in dashboard.env.example)
# Output:  ./dist  (gitignored, carries the token: never commit it)
# Env:     DASH_ENV=/path/to/.env to build with values that live elsewhere
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT"
ENV="$APP/.env"

for need in node npm python3; do
  command -v "$need" >/dev/null || { echo "error: '$need' not found" >&2; exit 1; }
done

if [ -n "${DASH_ENV:-}" ]; then
  [ -f "$DASH_ENV" ] || { echo "error: DASH_ENV points at nothing: $DASH_ENV" >&2; exit 1; }
  cp "$DASH_ENV" "$ENV" && chmod 600 "$ENV"
fi
[ -f "$ENV" ] || {
  echo "error: no .env in $APP - the bundle would build, deploy, and ask for data it never has."
  echo "       infra renders it (infra/bin/dashboard-env.sh); standalone, copy the names from infra's dashboard.env.example." >&2
  exit 1
}

# --- the build -------------------------------------------------------------
cd "$APP"
[ -f package-lock.json ] || echo "note: no package-lock.json (it is gitignored); installing from package.json." >&2
[ -f package-lock.json ] && npm ci || npm install
npm run build

# --- assert the bundle CARRIES what .env declares -------------------------
# A build that dropped the config deploys a page with blank cards and no error
# anywhere here. Every check is grep -qF: fixed string, quiet, so a token is never
# printed. The needles come out of .env itself, so this stays true for any renderer.
val() { grep -m1 "^$1=" "$ENV" | cut -d= -f2- | sed "s/^'//;s/'$//"; }
tok=$(val VITE_HA_TOKEN); ha=$(val VITE_HA_URL); fr=$(val VITE_FRIGATE_URL)
for name in VITE_HA_TOKEN VITE_HA_URL VITE_FRIGATE_URL; do
  [ -n "$(val "$name")" ] || { echo "error: .env has no $name" >&2; exit 1; }
done
for needle in "$tok" "$ha" "$fr"; do
  grep -qrF "$needle" dist || {
    echo "error: the built bundle does not carry a value .env declares - Vite's"
    echo "       inlining changed, and the deployed page would ask for data it never has." >&2
    exit 1
  }
done
# The services panel lists the proxy's doors from VITE_CADDY/VITE_GROUPS. A bundle
# that dropped them prints an empty (or ungrouped) panel and still looks healthy,
# so assert one host and one section id out of the JSON .env carries.
for pair in "VITE_CADDY:host" "VITE_GROUPS:group"; do
  key=${pair%%:*}; field=${pair##*:}
  probe=$(python3 -c '
import sys, json
raw = sys.argv[1]
data = json.loads(raw)
first = data[1] if len(data) > 1 else data[0]
print(first[sys.argv[2]] if isinstance(first, dict) else first)' "$(val "$key") "$field" 2>/dev/null) || true
  [ -n "${probe:-}" ] || { echo "error: .env's $key is not the JSON list the page expects" >&2; exit 1; }
  grep -qrF "$probe" dist || {
    echo "error: the built bundle does not carry $key - the services panel would print"
    echo "       its rows ungrouped, or nothing at all, instead of an error." >&2
    exit 1
  }
done

SIZE=$(du -sh dist | cut -f1)
echo "built: $APP/dist ($SIZE) - gitignored, holds the token, never commit it; pushing it is infra's 'make services' (github.com/AbstractSignal/infra)"
