#!/usr/bin/env bash
set -euo pipefail

DEFAULT_PORT=7101
BACKUP_SUFFIX=".bak-before-driver-port-patch"
CLASS_PATH="maestro/cli/command/TestCommand.class"
ORIGINAL_PORT=7001

usage() {
  cat <<'EOF'
Usage:
  patch-maestro-driver-port.sh [PORT]
  patch-maestro-driver-port.sh --undo
  patch-maestro-driver-port.sh --status

Patches the installed Maestro CLI jar so `maestro test` uses PORT instead of
the hardcoded iOS driver host port 7001. This is useful when another local
service, such as NoMachine, owns 127.0.0.1:7001.

Defaults:
  PORT=7101

Environment:
  MAESTRO_JAR=/path/to/maestro-cli-<version>.jar
    Override automatic jar discovery.

Notes:
  This patches Maestro's single-device default and the lower bound of its
  sharded fallback range. Use a port from 1024 through 7128.
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

find_maestro_jar() {
  if [[ -n "${MAESTRO_JAR:-}" ]]; then
    [[ -f "$MAESTRO_JAR" ]] || die "MAESTRO_JAR does not exist: $MAESTRO_JAR"
    printf '%s\n' "$MAESTRO_JAR"
    return
  fi

  local maestro_bin
  maestro_bin="$(command -v maestro || true)"
  [[ -n "$maestro_bin" ]] || die "maestro is not on PATH"

  local app_home
  app_home="$(cd "$(dirname "$maestro_bin")/.." && pwd)"

  local jars=("$app_home"/lib/maestro-cli-*.jar)
  [[ -f "${jars[0]:-}" ]] || die "could not find maestro-cli jar under $app_home/lib"
  [[ "${#jars[@]}" -eq 1 ]] || die "multiple maestro-cli jars found; set MAESTRO_JAR explicitly"

  printf '%s\n' "${jars[0]}"
}

validate_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] || die "PORT must be numeric: $port"
  (( port != ORIGINAL_PORT )) || die "PORT is already Maestro's default: $port"
  (( port >= 1024 && port <= 7128 )) || die "PORT must be between 1024 and 7128: $port"
}

port_bytes() {
  local port="$1"
  printf '%d %d\n' "$((port / 256))" "$((port % 256))"
}

count_port_bytecode() {
  local class_file="$1"
  local port="$2"
  local hi lo
  read -r hi lo < <(port_bytes "$port")
  HI="$hi" LO="$lo" perl -0777 -ne '
    my $needle = "\x11" . chr($ENV{HI}) . chr($ENV{LO});
    my $count = () = /\Q$needle\E/g;
    print "$count\n";
  ' "$class_file"
}

extract_class() {
  local jar="$1"
  local work_dir="$2"
  (cd "$work_dir" && jar xf "$jar" "$CLASS_PATH")
  [[ -f "$work_dir/$CLASS_PATH" ]] || die "could not extract $CLASS_PATH from $jar"
}

print_status() {
  local jar="$1"
  local work_dir
  work_dir="$(mktemp -d)"

  extract_class "$jar" "$work_dir"

  echo "Maestro jar: $jar"
  echo "Backup: $jar$BACKUP_SUFFIX"
  if [[ -f "$jar$BACKUP_SUFFIX" ]]; then
    echo "Backup exists: yes"
  else
    echo "Backup exists: no"
  fi
  echo "Bytecode references to 7001: $(count_port_bytecode "$work_dir/$CLASS_PATH" "$ORIGINAL_PORT")"

  if command -v javap >/dev/null 2>&1; then
    echo
    javap -classpath "$(dirname "$jar")/*" -p -c maestro.cli.command.TestCommand \
      | sed -n '/private final int selectPort/,/ireturn/p' \
      | sed -n '1,24p'
  fi

  rm -rf "$work_dir"
}

patch_jar() {
  local jar="$1"
  local port="$2"
  local backup="$jar$BACKUP_SUFFIX"
  local work_dir
  local hi lo count_before count_after

  validate_port "$port"
  read -r hi lo < <(port_bytes "$port")

  work_dir="$(mktemp -d)"

  extract_class "$jar" "$work_dir"
  count_before="$(count_port_bytecode "$work_dir/$CLASS_PATH" "$ORIGINAL_PORT")"
  [[ "$count_before" -gt 0 ]] || die "no $ORIGINAL_PORT bytecode references found; jar may already be patched"

  if [[ ! -f "$backup" ]]; then
    cp "$jar" "$backup"
    echo "Created backup: $backup"
  else
    echo "Using existing backup: $backup"
  fi

  HI="$hi" LO="$lo" perl -0pi -e '
    my $from = "\x11\x1b\x59";
    my $to = "\x11" . chr($ENV{HI}) . chr($ENV{LO});
    s/\Q$from\E/$to/g;
  ' "$work_dir/$CLASS_PATH"

  count_after="$(count_port_bytecode "$work_dir/$CLASS_PATH" "$port")"
  [[ "$count_after" -ge "$count_before" ]] || die "patch verification failed"
  [[ "$(count_port_bytecode "$work_dir/$CLASS_PATH" "$ORIGINAL_PORT")" -eq 0 ]] \
    || die "patch verification failed; $ORIGINAL_PORT references remain"

  (cd "$work_dir" && jar uf "$jar" "$CLASS_PATH")

  echo "Patched $jar"
  echo "Replaced $count_before bytecode reference(s) to $ORIGINAL_PORT with $port."

  rm -rf "$work_dir"
}

undo_patch() {
  local jar="$1"
  local backup="$jar$BACKUP_SUFFIX"
  [[ -f "$backup" ]] || die "backup not found: $backup"
  cp "$backup" "$jar"
  echo "Restored $jar from $backup"
}

main() {
  local action="patch"
  local port="$DEFAULT_PORT"

  case "${1:-}" in
    -h|--help)
      usage
      exit 0
      ;;
    --undo)
      action="undo"
      ;;
    --status)
      action="status"
      ;;
    "")
      ;;
    *)
      port="$1"
      ;;
  esac

  local jar
  jar="$(find_maestro_jar)"

  case "$action" in
    patch) patch_jar "$jar" "$port" ;;
    undo) undo_patch "$jar" ;;
    status) print_status "$jar" ;;
  esac
}

main "$@"
