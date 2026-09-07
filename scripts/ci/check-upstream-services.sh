#!/usr/bin/env bash
# Probes the external services CI downloads from and reports them in the job
# summary, so a run that goes red for an external reason says so up front
# instead of looking like a broken branch. Exits 1 when a critical service is
# down; slowness is a warning, except for npm audit, which every npm install
# waits for.
#
# Usage: scripts/ci/check-upstream-services.sh   (curl only; no Meteor needed)
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUNDLE_VERSION="$(sed -n 's/^BUNDLE_VERSION=//p' "$ROOT/meteor" | head -1)"
# Same tarball name the ./meteor script downloads (PLATFORM="${UNAME}_${ARCH}").
DEV_BUNDLE_URL="https://d3sqy0vbqsdhku.cloudfront.net/dev_bundle_$(uname -s)_$(uname -m)_${BUNDLE_VERSION}.tar.gz"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
SLOW_MS=5000
failures=0
rows=""

# probe <critical|optional> <name> <method> <url> [json body] [timeout s] [slow-is-failure]
probe() {
  local level="$1" name="$2" method="$3" url="$4" body="${5:-}" timeout="${6:-20}" slow_fails="${7:-no}"
  local out code secs ms status detail
  # HEAD goes through -I: with -X HEAD curl waits for a body that never comes.
  if [ "$method" = "HEAD" ]; then
    out="$(curl -sS -o /dev/null -m "$timeout" -I -w '%{http_code} %{time_total}' "$url" 2>/dev/null)" || true
  elif [ -n "$body" ]; then
    out="$(curl -sS -o /dev/null -m "$timeout" -X "$method" -H 'content-type: application/json' -d "$body" -w '%{http_code} %{time_total}' "$url" 2>/dev/null)" || true
  else
    out="$(curl -sS -o /dev/null -m "$timeout" -X "$method" -w '%{http_code} %{time_total}' "$url" 2>/dev/null)" || true
  fi
  code="${out%% *}"; secs="${out##* }"
  ms="$(awk -v s="${secs:-0}" 'BEGIN { printf "%d", s * 1000 }')"

  if [ -z "$code" ] || [ "$code" = "000" ]; then
    status="down"; detail="no response within ${timeout}s"
  elif [ "$code" -ge 500 ]; then
    status="down"; detail="HTTP $code"
  elif [ "$code" -ge 400 ]; then
    status="down"; detail="HTTP $code (probe URL may be stale)"
  elif [ "$ms" -gt "$SLOW_MS" ]; then
    status="slow"; detail="HTTP $code in ${ms} ms"
  else
    status="ok"; detail="HTTP $code in ${ms} ms"
  fi

  case "$status" in
    ok) icon="✅" ;;
    slow)
      if [ "$slow_fails" = "yes" ] && [ "$level" = "critical" ]; then
        icon="❌"; failures=$((failures + 1))
        echo "::error title=$name::slow ($detail) - every npm install waits for this"
      else
        icon="⚠️"; echo "::warning title=$name::$detail"
      fi ;;
    down)
      if [ "$level" = "critical" ]; then
        icon="❌"; failures=$((failures + 1)); echo "::error title=$name::$detail"
      else
        icon="⚠️"; echo "::warning title=$name::$detail (not blocking)"
      fi ;;
  esac

  printf '%s %-34s %-6s %s\n' "$icon" "$name" "$method" "$detail"
  rows="$rows| $icon | $name | \`$method $url\` | $detail |
"
}

echo "Probing upstream services (BUNDLE_VERSION=$BUNDLE_VERSION)"

probe critical "npm registry: ping"        GET  https://registry.npmjs.org/-/ping
probe critical "npm registry: packument"   GET  https://registry.npmjs.org/lodash
probe critical "npm registry: tarball"     HEAD https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz
probe critical "npm audit (advisories)"    POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk '{"lodash":["4.17.21"]}' 20 yes
probe critical "Meteor dev bundle (CloudFront)" HEAD "$DEV_BUNDLE_URL"
probe critical "Atmosphere (packages.meteor.com)" GET https://packages.meteor.com/sockjs/info
probe critical "GitHub (git dependencies)" HEAD https://github.com/unetworking/uWebSockets.js
probe critical "GitHub raw (examples.json)" GET https://raw.githubusercontent.com/meteor/examples/main/examples.json
probe critical "Docker apt repo (E2E runners)" HEAD https://download.docker.com/linux/debian/dists/bookworm/Release

{
  echo "### Upstream services"
  echo
  echo "| | Service | Probe | Result |"
  echo "|---|---|---|---|"
  printf '%s' "$rows"
  echo
  if [ "$failures" -gt 0 ]; then
    echo "**$failures critical service(s) unavailable.** Failures in the other checks of this run are probably external; retrigger once the table is green."
  else
    echo "All critical services reachable when this run started."
  fi
} >> "$SUMMARY"

if [ "$failures" -gt 0 ]; then
  echo "$failures critical service(s) unavailable"
  exit 1
fi
echo "All critical services reachable"
