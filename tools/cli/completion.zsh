# Meteor zsh completion

_meteor_completion_log() {
  if [[ -z "${METEOR_COMPLETION_DEBUG:-}" ]]; then
    return 0
  fi

  local log_file="${METEOR_COMPLETION_DEBUG_LOG:-${TMPDIR:-/tmp}/meteor-completion.log}"
  print -r -- "$*" >> "$log_file"
}

_meteor_alias_targets_cli() {
  local alias_name="$1"
  local -a alias_words

  alias_words=(${=aliases[$alias_name]})
  if (( ${#alias_words[@]} == 0 )); then
    return 1
  fi

  case "${alias_words[1]}" in
    meteor|mymeteor|*/meteor)
      return 0
      ;;
  esac

  return 1
}

_meteor() {
  local -a completions
  local -a completion_cmd
  local -a static_top_level_commands=(__METEOR_TOP_LEVEL_COMMANDS__)
  local index=$((CURRENT - 1))
  local meteor_cmd="${words[1]}"
  local completion_output
  local completion_status

  _meteor_completion_log "zsh start cmd=${meteor_cmd} words=${(j:|:)words} index=${index}"

  if (( index == 1 )) && [[ "${words[CURRENT]}" != -* ]]; then
    completions=("${static_top_level_commands[@]}")
    _meteor_completion_log "zsh static-top-level count=${#completions}"
    if [[ -n "${completions[(r)?*]}" ]]; then
      compadd -a completions
      _meteor_completion_log "zsh compadd count=${#completions}"
      return 0
    fi
  fi

  if (( ${+aliases[$meteor_cmd]} )); then
    completion_cmd=(${=aliases[$meteor_cmd]})
    _meteor_completion_log "zsh alias cmd=${meteor_cmd} resolved=${(j:|:)completion_cmd}"
  elif command -v "$meteor_cmd" >/dev/null 2>&1; then
    completion_cmd=("$meteor_cmd")
    _meteor_completion_log "zsh command cmd=${meteor_cmd} resolved=${(j:|:)completion_cmd}"
  else
    _meteor_completion_log "zsh missing cmd=${meteor_cmd}"
    return 0
  fi

  completion_output=$("${completion_cmd[@]}" shell-completion --index "$index" -- "${words[@]}" 2>/dev/null)
  completion_status=$?
  completions=("${(@f)${completion_output}}")
  _meteor_completion_log "zsh result status=${completion_status} count=${#completions} output=${completion_output//$'\n'/,}"

  if [[ -n "${completions[(r)?*]}" ]]; then
    compadd -a completions
    _meteor_completion_log "zsh compadd count=${#completions}"
    return 0
  fi

  if (( $+functions[_default] )); then
    _meteor_completion_log "zsh fallback=_default"
    _default
  fi
}

if type compdef &>/dev/null; then
  compdef _meteor meteor mymeteor

  for alias_name in ${(k)aliases}; do
    if _meteor_alias_targets_cli "$alias_name"; then
      compdef _meteor "$alias_name"
    fi
  done
fi
