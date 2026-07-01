#!/usr/bin/env sh

VENV_DIR=${MINDMAP_ENV_DIR:-"$PWD/.venv"}
VENV_BIN="$VENV_DIR/bin"
PNPM_VERSION=${MINDMAP_PNPM_VERSION:-10.23.0}

mkdir -p "$VENV_BIN"

if ! command -v pnpm >/dev/null 2>&1 && [ ! -x "$VENV_BIN/pnpm" ]; then
  if ! command -v corepack >/dev/null 2>&1; then
    echo "corepack is required to prepare pnpm@$PNPM_VERSION."
    echo "Install Node.js 20.19.0+ or add pnpm to PATH manually."
    exit 1
  fi

  corepack prepare "pnpm@$PNPM_VERSION" --activate >/dev/null 2>&1 || {
    echo "Failed to prepare pnpm@$PNPM_VERSION with corepack."
    echo "Check your network connection or install pnpm manually."
    exit 1
  }

  cat >"$VENV_BIN/pnpm" <<'EOF'
#!/usr/bin/env sh
exec corepack pnpm "$@"
EOF
  chmod +x "$VENV_BIN/pnpm"
fi

if [ -z "${_MINDMAP_OLD_PATH:-}" ]; then
  export _MINDMAP_OLD_PATH="$PATH"
fi

if [ -z "${_MINDMAP_OLD_PROMPT:-}" ] && [ -n "${PROMPT:-}" ]; then
  export _MINDMAP_OLD_PROMPT="$PROMPT"
fi

if [ -z "${_MINDMAP_OLD_PS1:-}" ] && [ -n "${PS1:-}" ]; then
  export _MINDMAP_OLD_PS1="$PS1"
fi

export VIRTUAL_ENV="$VENV_DIR"
export PATH="$VENV_BIN:$PATH"

VENV_LABEL="(${VENV_DIR##*/}) "

if [ -n "${PROMPT:-}" ]; then
  case $PROMPT in
    "$VENV_LABEL"*) ;;
    *) PROMPT="$VENV_LABEL$PROMPT" ;;
  esac
  export PROMPT
fi

if [ -n "${PS1:-}" ]; then
  case $PS1 in
    "$VENV_LABEL"*) ;;
    *) PS1="$VENV_LABEL$PS1" ;;
  esac
  export PS1
fi

deactivate() {
  if [ -n "${_MINDMAP_OLD_PATH:-}" ]; then
    export PATH="$_MINDMAP_OLD_PATH"
    unset _MINDMAP_OLD_PATH
  fi
  if [ -n "${_MINDMAP_OLD_PROMPT:-}" ]; then
    PROMPT="$_MINDMAP_OLD_PROMPT"
    export PROMPT
    unset _MINDMAP_OLD_PROMPT
  fi
  if [ -n "${_MINDMAP_OLD_PS1:-}" ]; then
    PS1="$_MINDMAP_OLD_PS1"
    export PS1
    unset _MINDMAP_OLD_PS1
  fi
  unset VIRTUAL_ENV
  unset -f deactivate 2>/dev/null || true
}

echo "Activated project environment at $VENV_DIR"
echo "Run: pnpm --version"
