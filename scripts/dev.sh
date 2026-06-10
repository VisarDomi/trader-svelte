#!/bin/bash
# Dev server lifecycle management
# Usage: ./scripts/dev.sh {start|stop|restart|status}

PORT=${PORT:-23456}
PID_FILE="/tmp/trader-svelte-dev.pid"
LOG_FILE="/tmp/trader-svelte-dev.log"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Dev server already running (PID $(cat "$PID_FILE"))"
    return
  fi
  cd "$DIR"
  npx vite dev --port "$PORT" --host 0.0.0.0 </dev/null >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 4
  if curl -sk "https://localhost:$PORT/" >/dev/null 2>&1; then
    echo "Dev server started on https://localhost:$PORT"
    echo "Network:     https://$(hostname -I | awk '{print $1}'):$PORT"
  else
    echo "Dev server may not have started. Check $LOG_FILE"
  fi
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found"
    pkill -f "vite dev.*$PORT" 2>/dev/null && echo "Killed by process name" || echo "No process found"
    return
  fi
  PID=$(cat "$PID_FILE")
  kill "$PID" 2>/dev/null && echo "Stopped dev server (PID $PID)"
  rm -f "$PID_FILE"
  pkill -f "vite dev.*$PORT" 2>/dev/null
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Dev server running (PID $(cat "$PID_FILE"))"
    curl -sk "https://localhost:$PORT/" >/dev/null 2>&1 && echo "Responding on https://localhost:$PORT" || echo "Not responding"
  else
    echo "Dev server not running"
  fi
}

case "${1:-status}" in
  start) start ;;
  stop)  stop ;;
  restart) stop; sleep 1; start ;;
  status|*) status ;;
esac
