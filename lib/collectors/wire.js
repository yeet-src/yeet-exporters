/* The line-protocol collector: one tcx probe captures the payload
 * prefix of every packet to or from the configured ports, and a
 * decoder per protocol turns it into series. The four exporters
 * snapshot this one worker and each keeps the families with its own
 * prefix.
 *
 * A shared worker does not see its opener's yeet.args, so the port
 * table arrives as a message from the keeper: `{ configure, ports }`,
 * with `ports` as lib/ports.js builds it. Until it arrives the probe
 * is attached but its port map is empty, so nothing is captured.
 */

import { BpfObject, HashMap, RingBuf } from "yeet:bpf";
import Telemetry from "yeet:telemetry";

import { Dedup, bytesOf, loopbackIndex, tcxTarget } from "../probe.js";
import { PROTOCOLS, describe } from "../ports.js";
import { Graphite } from "../wire/graphite.js";
import { Memcached } from "../wire/memcached.js";
import { Redis } from "../wire/redis.js";
import { Statsd } from "../wire/statsd.js";

const telemetry = new Telemetry({ service: "exporter-swap" });
const dropped = telemetry.counter("wire_collector_dropped_events", { help: "Ring buffer events lost to a slow consumer." });
const configured = telemetry.gauge("wire_collector_ports", { help: "Ports the wire collector captures.", labels: ["protocol", "port"] });

const decoders = {
  statsd: new Statsd(telemetry),
  redis: new Redis(telemetry),
  memcached: new Memcached(telemetry),
  graphite: new Graphite(telemetry),
};
const byPort = new Map();
const dedup = new Dedup();
const DIR_INGRESS = 1;
const lo = await loopbackIndex();

function onEvent(raw) {
  const ev = raw.wire_event ?? raw;
  if (ev.dir === DIR_INGRESS && ev.ifindex === lo) return;
  const now = Date.now();
  if (ev.proto === 6 && dedup.duplicate(ev, now)) return;
  const bytes = bytesOf(ev);
  const decoder = byPort.get(ev.dport) ?? byPort.get(ev.sport);
  if (!decoder) return;
  if (byPort.has(ev.dport)) decoder.request(ev, bytes, now);
  else decoder.response(ev, bytes, now);
}

setInterval(() => {
  const now = Date.now();
  dedup.prune(now);
  for (const d of Object.values(decoders)) d.tick(now);
}, 1000);

const tcx = await tcxTarget();
const control = await new BpfObject({ exe: "../bpf/bin/wire.bpf.o", base: import.meta.dirname })
  .bind("events", { kind: "ringbuf", btf_struct: "wire_event" })
  .bind("ports", { kind: "hash" })
  .attach("on_ingress", tcx)
  .attach("on_egress", tcx)
  .start();
const ports = new HashMap(control, "ports");
await new RingBuf(control, "events").subscribe(onEvent, () => dropped.inc());

// Replace the port table: drop what is no longer wanted, add the rest.
async function configure(table) {
  const next = new Map();
  for (const proto of PROTOCOLS) for (const port of table[proto] ?? []) next.set(port, proto);
  for (const port of byPort.keys()) {
    if (next.has(port)) continue;
    byPort.delete(port);
    try { await ports.delete(port); } catch {}
  }
  for (const [port, proto] of next) {
    byPort.set(port, decoders[proto]);
    await ports.update(port, 1);
    configured.labels({ protocol: proto, port: String(port) }).set(1);
  }
  console.log(`wire collector capturing ${describe(table)}`);
}

telemetry.serve();
const served = globalThis.onconnect;
globalThis.onconnect = (e) => {
  served(e);
  const port = e.ports[0];
  const answer = port.onmessage;
  port.onmessage = (m) => {
    if (!m.data?.configure) return answer(m);
    configure(m.data.ports)
      .then(() => port.postMessage({ configured: describe(m.data.ports) }))
      .catch((err) => port.postMessage({ configured: null, error: String(err?.stack ?? err) }));
  };
};
