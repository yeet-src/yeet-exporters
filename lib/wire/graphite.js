/* Graphite plaintext, read off the wire on the sender: `path value
 * timestamp` per line over TCP 2003. Every path becomes a gauge named
 * by the path with dots as underscores, carrying the sample's own
 * timestamp, which is what graphite_exporter emits.
 */

import { latin1 } from "../probe.js";

const NAME = /[^a-zA-Z0-9_:]/g;

export class Graphite {
  #gauges = new Map();

  constructor(telemetry) {
    this.telemetry = telemetry;
    this.lines = telemetry.counter("graphite_exporter_lines", { help: "Graphite lines seen on the wire.", labels: ["status"] });
    this.samples = telemetry.gauge("graphite_exporter_last_sample_timestamp_seconds", { help: "Timestamp of the newest sample seen." });
  }

  request(ev, bytes) {
    for (const raw of latin1(bytes).split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const [path, value, ts] = line.split(/\s+/);
      const v = Number(value);
      if (!path || Number.isNaN(v)) { this.lines.labels({ status: "invalid" }).inc(); continue; }
      this.lines.labels({ status: "ok" }).inc();
      const name = path.replace(/\./g, "_").replace(NAME, "_");
      let g = this.#gauges.get(name);
      if (!g) {
        g = this.telemetry.gauge(name, { help: `Graphite metric ${path}, read off the wire.` });
        this.#gauges.set(name, g);
      }
      g.set(v);
      const t = Number(ts);
      if (t > 0) this.samples.set(t);
    }
  }

  response() {}
  tick() {}
}
