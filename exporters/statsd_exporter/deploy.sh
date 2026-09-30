#!/usr/bin/env bash
# Run just this exporter as its own yeet service.
#
#   ./deploy.sh                       # /metrics on 0.0.0.0:9102, statsd_exporter's port
#   ./deploy.sh 9102 --statsd 8125,8126
#   ./deploy.sh remove
#
# Flags after the port reach the keeper as yeet.args. The daemon reads
# a unit's script when the service is imported, so rerun after editing.
set -euo pipefail
cd "$(dirname "$0")"
svc=statsd-exporter

if [[ ${1:-} == remove ]]; then
  yeet service remove -f "$svc"
  exit
fi
port=${1:-9102}
shift $(( $# > 0 ? 1 : 0 ))

[[ -f ../../lib/bpf/bin/wire.bpf.o ]] || { echo "build the probe first: make -C ../.. lib/bpf/bin/wire.bpf.o (or just: make up)" >&2; exit 1; }

yeet service remove -f "$svc" >/dev/null 2>&1 || true
yeet service new "$svc" -R always -q >/dev/null
yeet service unit add "$svc/gateway" -W "http://0.0.0.0:$port"
yeet service unit add "$svc/keeper" -I "$PWD/keeper.js" -q -- "$@"
yeet service unit add "$svc/metrics" -I "$PWD/metrics.js" --lazy -q
yeet service mount "$svc/gateway" -L /metrics -t metrics -p console -T per-connection -d "statsd_exporter"
yeet service enable "$svc" >/dev/null
yeet service start "$svc" | tail -1
yeet service tree "$svc"
