#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
  if [ -f "$ROOT_DIR/.nvmrc" ]; then
    nvm use >/dev/null
  fi
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found in PATH. Install pnpm@10.6.5 under Node 22 first." >&2
  exit 1
fi

check_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1 && lsof -ti "tcp:${port}" >/dev/null 2>&1; then
    echo "Port ${port} is already in use. Stop the existing process before running dev:all." >&2
    exit 1
  fi
}

check_port 3000
check_port 3001
check_port 3100

declare -a pids=()

start_service() {
  local name="$1"
  shift

  (
    cd "$ROOT_DIR"
    "$@" 2>&1 | awk -v tag="[$name]" '{ print tag, $0; fflush(); }'
  ) &

  pids+=("$!")
}

cleanup() {
  trap - EXIT INT TERM

  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done

  wait >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

start_service "worker" env PERSONA_DISTILL_POLLING_ENABLED=true pnpm dev:worker
start_service "api" pnpm dev:api
start_service "h5" pnpm dev:client:h5

echo "worker/api/h5 are starting. Press Ctrl+C to stop all three."
echo "H5: http://127.0.0.1:3100"
echo "API: http://127.0.0.1:3000"
echo "Worker: http://127.0.0.1:3001"

while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "One of the dev processes exited unexpectedly. Shutting down the rest." >&2
      cleanup
      exit 1
    fi
  done

  sleep 1
done
