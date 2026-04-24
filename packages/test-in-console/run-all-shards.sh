#!/usr/bin/env bash
#
# Run every test-in-console shard in parallel on a single host. This is
# the local equivalent of the CI matrix in .github/workflows/test-packages.yml
# — useful to smoke-test the full suite before pushing.
#
# Usage:
#   ./packages/test-in-console/run-all-shards.sh           # 6 shards, 6 in parallel
#   ./packages/test-in-console/run-all-shards.sh --shards 12
#   ./packages/test-in-console/run-all-shards.sh --parallelism 3
#   ./packages/test-in-console/run-all-shards.sh --shards 12 --parallelism 4
#
# Each shard gets:
#   - its own app port (4000 + i*100), so the mongo port (app+1) doesn't
#     collide with the next shard's app port;
#   - its own log at /tmp/test-in-console-shard-<i>.log;
#   - its own puppeteer chromium instance.
#
# The script prewarms the Meteor babel cache before forking so the six
# concurrent `./meteor` processes don't race on .babel-cache/*.json.

set -u

cd "$(dirname "$0")/../.."
REPO_ROOT="$(pwd)"

TOTAL_SHARDS=6
PARALLELISM=""
PER_SHARD_TIMEOUT_S=${PER_SHARD_TIMEOUT_S:-1500}  # 25 min default

while [ $# -gt 0 ]; do
  case "$1" in
    --shards)
      TOTAL_SHARDS="$2"
      shift 2
      ;;
    --shards=*)
      TOTAL_SHARDS="${1#--shards=}"
      shift
      ;;
    --parallelism)
      PARALLELISM="$2"
      shift 2
      ;;
    --parallelism=*)
      PARALLELISM="${1#--parallelism=}"
      shift
      ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown flag: $1" >&2
      exit 2
      ;;
  esac
done
PARALLELISM="${PARALLELISM:-$TOTAL_SHARDS}"

if ! [[ "$TOTAL_SHARDS" =~ ^[0-9]+$ ]] || [ "$TOTAL_SHARDS" -lt 1 ]; then
  echo "--shards must be a positive integer (got $TOTAL_SHARDS)" >&2
  exit 2
fi
if ! [[ "$PARALLELISM" =~ ^[0-9]+$ ]] || [ "$PARALLELISM" -lt 1 ]; then
  echo "--parallelism must be a positive integer (got $PARALLELISM)" >&2
  exit 2
fi
if [ "$PARALLELISM" -gt "$TOTAL_SHARDS" ]; then
  PARALLELISM="$TOTAL_SHARDS"
fi

echo "Running $TOTAL_SHARDS shards with up to $PARALLELISM in parallel (per-shard timeout ${PER_SHARD_TIMEOUT_S}s)."

# Pre-warm the babel cache. Without this, concurrent `./meteor` forks can
# race on .babel-cache/<hash>.json and crash at startup (same issue the
# Phase 5 self-test worker pool handled the same way).
echo "Prewarming Meteor babel cache..."
"$REPO_ROOT/meteor" self-test --list > /dev/null 2>&1 || true
echo "Prewarm done."

# Launch shards, respecting the parallelism cap.
PIDS=()
LOG_FILES=()
PORTS=()
SHARD_INDEXES=()
active=0

start_shard() {
  local i=$1
  local port=$((4000 + i * 100))
  local log="/tmp/test-in-console-shard-${i}.log"
  rm -f "$log"
  echo "  → shard ${i}/${TOTAL_SHARDS} on port ${port} (log: ${log})"
  METEOR_TEST_PACKAGES_PORT="$port" \
  TIMEOUT_SCALE_FACTOR="${TIMEOUT_SCALE_FACTOR:-3}" \
  PUPPETEER_TRIGGER_TIMEOUT_MS="${PUPPETEER_TRIGGER_TIMEOUT_MS:-120000}" \
  PUPPETEER_POLL_TIMEOUT_MS="${PUPPETEER_POLL_TIMEOUT_MS:-600000}" \
    "$REPO_ROOT/packages/test-in-console/run.sh" --shard "${i}/${TOTAL_SHARDS}" \
    > "$log" 2>&1 &
  PIDS+=($!)
  LOG_FILES+=("$log")
  PORTS+=("$port")
  SHARD_INDEXES+=("$i")
}

cleanup_all() {
  echo ""
  echo "Cleaning up any surviving shard processes..."
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null || continue
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done
  sleep 2
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null || continue
    pkill -9 -P "$pid" 2>/dev/null || true
    kill -9 "$pid" 2>/dev/null || true
  done
  # Catch orphans from the ports we used.
  for port in "${PORTS[@]}"; do
    lsof -ti:"$port" -ti:"$((port + 1))" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  done
  pkill -9 -f "Chrome for Testing" 2>/dev/null || true
}
trap cleanup_all SIGINT SIGTERM EXIT

# Simple round-robin dispatcher: keep up to $PARALLELISM shards running.
# Wait for any to finish, then start the next one until all are launched.
next_to_launch=1
running_indexes=()
while [ "$next_to_launch" -le "$TOTAL_SHARDS" ] || [ "$active" -gt 0 ]; do
  # Launch while under the cap.
  while [ "$active" -lt "$PARALLELISM" ] && [ "$next_to_launch" -le "$TOTAL_SHARDS" ]; do
    start_shard "$next_to_launch"
    running_indexes+=("$next_to_launch")
    next_to_launch=$((next_to_launch + 1))
    active=$((active + 1))
    sleep 2  # small stagger to ease disk I/O spike
  done

  # Wait for any one to finish.
  wait -n 2>/dev/null || true
  # Rescan which are still alive.
  new_running=()
  new_active=0
  for idx in "${running_indexes[@]}"; do
    pid_idx=$((idx - 1))
    pid=${PIDS[$pid_idx]}
    if kill -0 "$pid" 2>/dev/null; then
      new_running+=("$idx")
      new_active=$((new_active + 1))
    fi
  done
  running_indexes=("${new_running[@]}")
  active="$new_active"
done

trap - SIGINT SIGTERM EXIT

# Aggregate results.
echo ""
echo "===================================================="
echo "All shards finished. Summary:"
echo "===================================================="
printf "%-10s %-12s %-8s %-8s %s\n" "SHARD" "STATUS" "PASSES" "FAILS" "NOTES"
printf "%-10s %-12s %-8s %-8s %s\n" "-----" "------" "------" "-----" "-----"
overall_status=0
total_pass=0
total_fail=0
for idx in "${SHARD_INDEXES[@]}"; do
  log="/tmp/test-in-console-shard-${idx}.log"
  summary=$(grep "Tests complete with" "$log" 2>/dev/null | tail -1)
  if [ -n "$summary" ]; then
    fails=$(echo "$summary" | grep -oE "[0-9]+ failures" | head -1 | grep -oE "^[0-9]+")
    passes=$(echo "$summary" | grep -oE "[0-9]+ passes" | head -1 | grep -oE "^[0-9]+")
    fails=${fails:-0}
    passes=${passes:-0}
    total_pass=$((total_pass + passes))
    total_fail=$((total_fail + fails))
    if [ "$fails" -gt 0 ]; then
      status="FAIL"
      overall_status=1
    else
      status="PASS"
    fi
    printf "%-10s %-12s %-8s %-8s %s\n" "${idx}/${TOTAL_SHARDS}" "$status" "$passes" "$fails" "$log"
  else
    status="INCOMPLETE"
    overall_status=1
    observed_ok=$(grep -cE "^(C|S):.*: OK$" "$log" 2>/dev/null || echo 0)
    observed_fail=$(grep -cE "^(C|S):.*failed:" "$log" 2>/dev/null || echo 0)
    printf "%-10s %-12s %-8s %-8s %s\n" \
      "${idx}/${TOTAL_SHARDS}" "$status" "~$observed_ok" "~$observed_fail" \
      "$log (never reached summary)"
  fi
done
echo ""
echo "Total: $total_pass passes, $total_fail failures across completed shards."
echo "Exit: $overall_status"
exit $overall_status
