# Meteor bash completion

_meteor_completion_log() {
  if [[ -z "${METEOR_COMPLETION_DEBUG:-}" ]]; then
    return 0
  fi

  local log_file="${METEOR_COMPLETION_DEBUG_LOG:-${TMPDIR:-/tmp}/meteor-completion.log}"
  printf '%s\n' "$*" >> "$log_file"
}

_meteor_alias_targets_cli() {
  local alias_value="$1"

  case "$alias_value" in
    meteor|meteor\ *|mymeteor|mymeteor\ *|*/meteor|*/meteor\ *)
      return 0
      ;;
  esac

  return 1
}

_meteor_complete() {
  local cur prev words cword
  local -a completion_cmd
  local -a static_top_level_commands=(__METEOR_TOP_LEVEL_COMMANDS__)
  local alias_definition alias_value
  local COMP_WORDBREAKS=${COMP_WORDBREAKS//:/}
  local meteor_cmd="${COMP_WORDS[0]}"
  local completion_status

  _meteor_completion_log "bash start cmd=${meteor_cmd} words=${COMP_WORDS[*]} index=${COMP_CWORD}"

  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  if [ "$COMP_CWORD" -eq 1 ] && [[ "$cur" != -* ]]; then
    local oldifs=$IFS
    IFS=$'\n'
    COMPREPLY=( $(compgen -W "$(printf '%s\n' "${static_top_level_commands[@]}")" -- "$cur") )
    IFS=$oldifs
    _meteor_completion_log "bash static-top-level count=${#COMPREPLY[@]}"
    return 0
  fi

  if alias "$meteor_cmd" >/dev/null 2>&1; then
    alias_definition=$(alias "$meteor_cmd")
    alias_value=${alias_definition#*=}
    alias_value=${alias_value#\'}
    alias_value=${alias_value%\'}
    read -r -a completion_cmd <<< "$alias_value"
    _meteor_completion_log "bash alias cmd=${meteor_cmd} resolved=${completion_cmd[*]}"
  elif command -v "$meteor_cmd" >/dev/null 2>&1; then
    completion_cmd=("$meteor_cmd")
    _meteor_completion_log "bash command cmd=${meteor_cmd} resolved=${completion_cmd[*]}"
  else
    _meteor_completion_log "bash missing cmd=${meteor_cmd}"
    return 0
  fi

  local completions
  completions=$("${completion_cmd[@]}" shell-completion --index "$COMP_CWORD" -- "${COMP_WORDS[@]}" 2>/dev/null)
  completion_status=$?
  _meteor_completion_log "bash result status=${completion_status} count=$(printf '%s\n' "$completions" | sed '/^$/d' | wc -l | tr -d ' ') output=${completions//$'\n'/,}"

  if [ $completion_status -eq 0 ] && [ -n "$completions" ]; then
    local oldifs=$IFS
    IFS=$'\n'
    COMPREPLY=( $(compgen -W "$completions" -- "$cur") )
    IFS=$oldifs
    _meteor_completion_log "bash compreply count=${#COMPREPLY[@]}"
    return 0
  fi

  return 0
}

if type complete &>/dev/null; then
  complete -o default -o bashdefault -F _meteor_complete meteor mymeteor

  while IFS= read -r alias_definition; do
    alias_name=${alias_definition#alias }
    alias_name=${alias_name%%=*}
    alias_value=${alias_definition#*=}
    alias_value=${alias_value#\'}
    alias_value=${alias_value%\'}

    if _meteor_alias_targets_cli "$alias_value"; then
      complete -o default -o bashdefault -F _meteor_complete "$alias_name"
    fi
  done < <(alias -p 2>/dev/null)
fi
