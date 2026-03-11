#!/usr/bin/env bash

set -euo pipefail

checkout_dir="$(cd "$(dirname "$0")/../.." && pwd)"
client_script="$checkout_dir/scripts/benchmarks/ddp-terminal-client.js"
aggregate_script="$checkout_dir/scripts/benchmarks/aggregate-results.js"

if [[ ! -x "$client_script" ]]; then
  echo "Benchmark client not found or not executable: $client_script" >&2
  exit 1
fi

if [[ ! -f "$aggregate_script" ]]; then
  echo "Aggregate script not found: $aggregate_script" >&2
  exit 1
fi

calls="${DDP_SERVER_BENCHMARK_CALLS:-10000}"
concurrency="${DDP_SERVER_BENCHMARK_CONCURRENCY:-100}"
clients="${DDP_SERVER_BENCHMARK_CLIENTS:-1}"
iterations="${DDP_SERVER_BENCHMARK_ITERATIONS:-3}"
port="${DDP_SERVER_BENCHMARK_PORT:-4096}"
benchmark_method="${DDP_BENCHMARK_METHOD:-ddp_benchmark_noop}"
connect_timeout_ms="${DDP_BENCHMARK_CONNECT_TIMEOUT_MS:-180000}"
benchmark_url="${DDP_BENCHMARK_URL:-ws://127.0.0.1:${port}/websocket}"
output_file="${DDP_SERVER_BENCHMARK_OUTPUT_FILE:-$checkout_dir/scripts/benchmarks/ddp-uws-vs-sockjs-results.csv}"
mode="${1:-uws}"

if [[ "$mode" != "uws" && "$mode" != "sockjs" ]]; then
  echo "Usage: $0 [uws|sockjs]" >&2
  exit 1
fi

app_dir="$(mktemp -d /tmp/meteor-ddp-bench.XXXX)"
meteor_pid=""

cleanup() {
  if [[ -n "$meteor_pid" ]] && kill -0 "$meteor_pid" 2>/dev/null; then
    kill "$meteor_pid" 2>/dev/null || true
    wait "$meteor_pid" 2>/dev/null || true
  fi
  rm -rf "$app_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

stop_server() {
  if [[ -z "$meteor_pid" ]]; then
    return
  fi

  if kill -0 "$meteor_pid" 2>/dev/null; then
    kill "$meteor_pid" 2>/dev/null || true
    wait "$meteor_pid" 2>/dev/null || true
  fi

  meteor_pid=""
}

wait_for_server() {
  local mode="$1"
  local startup_timeout="${DDP_SERVER_BENCHMARK_STARTUP_TIMEOUT:-180}"
  local attempt

  for attempt in $(seq 1 "$startup_timeout"); do
    if ! kill -0 "$meteor_pid" 2>/dev/null; then
      return 1
    fi

    if DDP_BENCHMARK_URL="$benchmark_url" \
      DDP_BENCHMARK_METHOD="$benchmark_method" \
      DDP_SERVER_BENCHMARK_CALLS=1 \
      DDP_SERVER_BENCHMARK_CONCURRENCY=1 \
      DDP_BENCHMARK_CONNECT_TIMEOUT_MS=1000 \
      DDP_BENCHMARK_VERIFY_RESULT=1 \
      node "$client_script" >/dev/null 2>&1; then
      return 0
    fi

    sleep 1
  done

  echo "Timed out waiting for mode=${mode} readiness" >&2
  return 1
}

create_benchmark_app() {
  local main_file="$app_dir/server/main.js"

  "$checkout_dir/meteor" create --bare "$app_dir" >/dev/null
  mkdir -p "$(dirname "$main_file")"

  cat > "$main_file" <<APP
import { Meteor } from 'meteor/meteor';

Meteor.methods({
  "${benchmark_method}"(value) {
    return value;
  },
});
APP
}

start_server() {
  local mode="$1"
  local log_file="$app_dir/meteor-${mode}.log"

  if [[ "$mode" == "uws" ]]; then
    (
      cd "$app_dir"
      env -u METEOR_SETTINGS \
      DISABLE_SOCKJS=1 \
      METEOR_PACKAGE_DIRS="$checkout_dir/packages" \
      "$checkout_dir/meteor" run --port "$port" >"$log_file" 2>&1
    ) &
  else
    (
      cd "$app_dir"
      env -u DISABLE_SOCKJS -u METEOR_SETTINGS \
      METEOR_PACKAGE_DIRS="$checkout_dir/packages" \
      "$checkout_dir/meteor" run --port "$port" >"$log_file" 2>&1
    ) &
  fi

  meteor_pid="$!"
}

run_clients() {
  local mode="$1"
  local run_index="$2"
  local run_dir
  local calls_per_client=$((calls / clients))
  local extra_calls=$((calls % clients))
  local start_ns
  local end_ns

  run_dir="$(mktemp -d /tmp/meteor-ddp-clients.${mode}-${run_index}.XXXX)"

  local -a pids=()
  local -a result_files=()
  local -a error_files=()

  start_ns="$(node -e "process.stdout.write(process.hrtime.bigint().toString())")"

  local client_index
  for client_index in $(seq 1 "$clients"); do
    local client_calls="$calls_per_client"
    if [[ "$client_index" -le "$extra_calls" ]]; then
      client_calls=$((client_calls + 1))
    fi

    if [[ "$client_calls" -le 0 ]]; then
      continue
    fi

    local result_file="$run_dir/client-${client_index}.json"
    local error_file="$run_dir/client-${client_index}.err"

    DDP_BENCHMARK_URL="$benchmark_url" \
    DDP_BENCHMARK_METHOD="$benchmark_method" \
    DDP_SERVER_BENCHMARK_CALLS="$client_calls" \
    DDP_SERVER_BENCHMARK_CONCURRENCY="$concurrency" \
    DDP_BENCHMARK_CONNECT_TIMEOUT_MS="$connect_timeout_ms" \
    node "$client_script" >"$result_file" 2>"$error_file" &

    pids+=("$!")
    result_files+=("$result_file")
    error_files+=("$error_file")
  done

  local failed=0
  local pid
  for pid in "${pids[@]}"; do
    if ! wait "$pid"; then
      failed=1
    fi
  done

  end_ns="$(node -e "process.stdout.write(process.hrtime.bigint().toString())")"

  if [[ "$failed" -ne 0 ]]; then
    local error_file
    for error_file in "${error_files[@]}"; do
      if [[ -s "$error_file" ]]; then
        echo "Benchmark client error ($error_file):" >&2
        cat "$error_file" >&2
        break
      fi
    done
    rm -rf "$run_dir" >/dev/null 2>&1 || true
    return 1
  fi

  local aggregate_json
  aggregate_json="$(node "$aggregate_script" "$start_ns" "$end_ns" "${result_files[@]}")"
  rm -rf "$run_dir" >/dev/null 2>&1 || true
  echo "$aggregate_json"
}

append_csv_row() {
  local mode="$1"
  local run_index="$2"
  local result_json="$3"

  local parsed
  parsed="$(node -e "const result = JSON.parse(process.argv[1]); process.stdout.write([result.method_calls, result.time_to_process_s, result.calls_per_second].join(','));" "$result_json")"

  echo "${mode},${run_index},${parsed},${clients},${concurrency}" >> "$output_file"
}

run_mode() {
  local mode="$1"
  start_server "$mode"
  if ! wait_for_server "$mode"; then
    echo "Server did not become ready for mode=${mode}" >&2
    echo "Server log: $app_dir/meteor-${mode}.log" >&2
    stop_server
    exit 1
  fi

  local run_index
  for run_index in $(seq 1 "$iterations"); do
    echo "Running ${mode} benchmark (${run_index}/${iterations})..."

    local result_json
    if ! result_json="$(run_clients "$mode" "$run_index")"; then
      echo "Benchmark failed for mode=${mode}, run=${run_index}" >&2
      echo "Server log: $app_dir/meteor-${mode}.log" >&2
      stop_server
      exit 1
    fi

    append_csv_row "$mode" "$run_index" "$result_json"

    echo "Result ${mode} run ${run_index}: $result_json"
    sleep 1
  done

  stop_server
}

if [[ ! -s "$output_file" ]]; then
  echo "mode,iterations,method_calls,time_to_process,calls_per_second,clients,concurrency" > "$output_file"
fi

create_benchmark_app
run_mode "$mode"

echo "CSV saved to: $output_file"
cat "$output_file"
