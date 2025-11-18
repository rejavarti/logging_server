#!/usr/bin/env bash
set -euo pipefail

CFG_FILE=${CFG_FILE:-/config/ingestion-state.json}
INTERVAL=${INTERVAL:-2}

log() { echo "[port-guardian] $*"; }

require_tools() {
  for t in iptables jq; do
    if ! command -v "$t" >/dev/null 2>&1; then
      echo "Missing tool: $t" >&2; exit 1
    fi
  done
}

# Apply drop/allow based on desired state
apply_state() {
  local proto="$1"; local port="$2"; local enabled="$3"
  local comment="port-guardian ${port}/${proto}"

  # Remove any existing DROP rule we own (idempotent)
  while iptables -C INPUT -p "$proto" --dport "$port" -m comment --comment "$comment" -j DROP 2>/dev/null; do
    iptables -D INPUT -p "$proto" --dport "$port" -m comment --comment "$comment" -j DROP || true
  done

  if [[ "$enabled" == "false" ]]; then
    # Insert a DROP rule early in the chain
    iptables -I INPUT 1 -p "$proto" --dport "$port" -m comment --comment "$comment" -j DROP
    log "blocked ${port}/${proto}"
  else
    log "unblocked ${port}/${proto}"
  fi
}

load_and_apply() {
  if [[ ! -f "$CFG_FILE" ]]; then
    log "config $CFG_FILE not found; creating default (all disabled)"
    mkdir -p "$(dirname "$CFG_FILE")"
    cat >"$CFG_FILE" <<'JSON'
{
  "tcp": { "601": false, "12202": false, "5044": false, "9880": false, "8082": false },
  "udp": { "514": false, "12201": false }
}
JSON
  fi

  local tcp_ports udp_ports
  tcp_ports=$(jq -r '.tcp | to_entries[] | "\(.key)=\(.value)"' "$CFG_FILE" 2>/dev/null || true)
  udp_ports=$(jq -r '.udp | to_entries[] | "\(.key)=\(.value)"' "$CFG_FILE" 2>/dev/null || true)

  # Apply TCP
  while IFS='=' read -r port enabled; do
    [[ -z "$port" ]] && continue
    apply_state tcp "$port" "$enabled"
  done <<< "$tcp_ports"

  # Apply UDP
  while IFS='=' read -r port enabled; do
    [[ -z "$port" ]] && continue
    apply_state udp "$port" "$enabled"
  done <<< "$udp_ports"
}

require_tools
log "starting with config: $CFG_FILE"
# First apply to ensure baseline
load_and_apply

# Watch for changes by polling (portable)
last_sum=""
while true; do
  if [[ -f "$CFG_FILE" ]]; then
    sum=$(sha256sum "$CFG_FILE" | awk '{print $1}')
    if [[ "$sum" != "$last_sum" ]]; then
      log "config changed, applying"
      load_and_apply
      last_sum="$sum"
    fi
  fi
  sleep "$INTERVAL"
done
