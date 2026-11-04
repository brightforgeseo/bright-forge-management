#!/bin/bash
set -euo pipefail
cd /mnt/LinuxData/benecho/Projects/bright-forge-management
export PATH="/home/benecho/.local/bin:/usr/local/bin:/usr/bin"
export SUPABASE_INTERNAL_URL="${SUPABASE_INTERNAL_URL:-http://127.0.0.1:54321}"
export ECHO_WORKER_ID="${ECHO_WORKER_ID:-bright-forge-echo-worker}"
export HOME="${HOME:-/home/benecho}"

# Load the local stack key at runtime. Do not write it to disk.
while IFS= read -r line; do
  case "$line" in
    SERVICE_ROLE_KEY=*)
      val="${line#SERVICE_ROLE_KEY=}"
      val="${val#\'}"
      val="${val%\'}"
      val="${val#\"}"
      val="${val%\"}"
      export SUPABASE_SERVICE_ROLE_KEY="$val"
      ;;
  esac
done < <(supabase status -o env)

exec /home/benecho/.local/bin/node /mnt/LinuxData/benecho/Projects/bright-forge-management/scripts/echo-worker.cjs
