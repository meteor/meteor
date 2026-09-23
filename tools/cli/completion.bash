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

# Bash splits the line on ":" (see COMP_WORDBREAKS) before the completion
# function runs, so author:package arrives as "author" ":" "package".
_meteor_join_colon_words() {
  local line=$COMP_LINE
  local word previous=""
  local i last

  _meteor_words=()
  _meteor_cword=0

  for (( i = 0; i < ${#COMP_WORDS[@]}; i++ )); do
    word=${COMP_WORDS[i]}
    last=$(( ${#_meteor_words[@]} - 1 ))

    if (( last >= 1 )) && [[ "$line" != [[:blank:]]* ]] &&
      [[ "$word" =~ ^:+$ || "$previous" =~ ^:+$ ]]; then
      _meteor_words[last]="${_meteor_words[last]}${word}"
    else
      _meteor_words[last + 1]=$word
      last=$(( last + 1 ))
    fi

    if (( i == COMP_CWORD )); then
      _meteor_cword=$last
    fi

    line=${line#*"$word"}
    previous=$word
  done
}

# Candidates are matched literally; compgen -W would run them through shell
# expansion.
_meteor_fill_compreply() {
  local cur="$1"
  local candidate

  COMPREPLY=()
  while IFS= read -r candidate; do
    if [[ -n "$candidate" && "$candidate" == "$cur"* ]]; then
      COMPREPLY[${#COMPREPLY[@]}]=$candidate
    fi
  done <<< "$2"
}

# Bash only replaces the text between the last ":" and the cursor, so drop the
# part of each suggestion that is already on the line.
_meteor_trim_colon_prefix() {
  local typed="$1"
  local head=${COMP_LINE:0:COMP_POINT}
  local prefix i

  while [[ -n "$typed" && "$head" != *"$typed" ]]; do
    typed=${typed%?}
  done

  if [[ "$typed" != *:* || "$COMP_WORDBREAKS" != *:* ]]; then
    return 0
  fi

  prefix=${typed%"${typed##*:}"}
  for i in "${!COMPREPLY[@]}"; do
    COMPREPLY[i]=${COMPREPLY[i]#"$prefix"}
  done
}

_meteor_complete() {
  local cur
  local -a completion_cmd
  local -a static_top_level_commands=(__METEOR_TOP_LEVEL_COMMANDS__)
  local alias_definition alias_value
  local -a _meteor_words
  local _meteor_cword
  local meteor_cmd="${COMP_WORDS[0]}"
  local completion_status

  _meteor_join_colon_words
  _meteor_completion_log "bash start cmd=${meteor_cmd} words=${_meteor_words[*]} index=${_meteor_cword}"

  cur="${_meteor_words[_meteor_cword]}"

  if [ "$_meteor_cword" -eq 1 ] && [[ "$cur" != -* ]]; then
    _meteor_fill_compreply "$cur" "$(printf '%s\n' "${static_top_level_commands[@]}")"
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
  completions=$("${completion_cmd[@]}" shell-completion --index "$_meteor_cword" -- "${_meteor_words[@]}" 2>/dev/null)
  completion_status=$?
  if [[ -n "${METEOR_COMPLETION_DEBUG:-}" ]]; then
    local _debug_count _debug_output
    _debug_count=$(printf '%s\n' "$completions" | sed '/^$/d' | wc -l | tr -d ' ')
    _debug_output=${completions//$'\n'/,}
    _meteor_completion_log "bash result status=${completion_status} count=${_debug_count} output=${_debug_output}"
  fi

  if [ $completion_status -eq 0 ] && [ -n "$completions" ]; then
    _meteor_fill_compreply "$cur" "$completions"
    _meteor_trim_colon_prefix "$cur"
    _meteor_completion_log "bash compreply count=${#COMPREPLY[@]}"
    return 0
  fi

  return 0
}

_meteor_register_completions() {
  local alias_definition alias_name alias_value

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
}

if type complete &>/dev/null; then
  _meteor_register_completions
fi
