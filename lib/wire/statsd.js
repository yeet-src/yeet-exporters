/* StatsD datagrams, read off the wire on the sending host instead of
 * at a listener: `name:value|type[|@rate][|#tag:v,...]`, several per
 * datagram separated by newlines. Counters accumulate, gauges set
 * (or shift with a +/- prefix), timers feed a histogram in seconds,
 * sets count distinct members. Names take statsd_exporter's default
 * mapping: dots to underscores.
 */

import { LATENCY_BUCKETS, latin1 } from "../probe.js";

const NAME = /[^a-zA-Z0-9_:]/g;

export class Statsd {
  #series = new Map();
  #sets = new Map();

  constructor(telemetry) {
    this.telemetry = telemetry;
    this.lines = telemetry.counter("statsd_exporter_lines", { help: "StatsD lines seen on the wire.", labels: ["status"] });
    this.events = telemetry.counter("statsd_exporter_events", { help: "StatsD events seen on the wire, by type.", labels: ["type"] });
    this.datagrams = telemetry.counter("statsd_exporter_udp_packets", { help: "StatsD datagrams seen on the wire." });
  }

  request(ev, bytes) {
    this.datagrams.inc();
    for (const line of latin1(bytes).split("\n")) {
      if (!line.trim()) continue;
      const m = /^([^:]+):([^|]+)\|([a-z]+)(?:\|@([0-9.]+))?(?:\|#(.*))?$/.exec(line.trim());
      if (!m) { this.lines.labels({ status: "invalid" }).inc(); continue; }
      const [, rawName, rawValue, type, rate, tags] = m;
      const name = rawName.replace(/\./g, "_").replace(NAME, "_");
      const labels = parseTags(tags);
      const sample = 1 / (Number(rate) || 1);
      this.lines.labels({ status: "ok" }).inc();
      this.events.labels({ type }).inc();
      const value = Number(rawValue);
      try { this.#apply(name, type, rawValue, value, labels, sample); }
      catch (e) { this.lines.labels({ status: "rejected" }).inc(); }
    }
  }

  // A family's label set is fixed by its first line; a later line
  // with other tags is rejected rather than crashing the collector.
  #apply(name, type, rawValue, value, labels, sample) {
    switch (type) {
      case "c": this.#family(name, "counter", labels).labels(labels.values).inc(value * sample); break;
      case "g": {
        const g = this.#family(name, "gauge", labels).labels(labels.values);
        g.set(/^[+-]/.test(rawValue) ? Number(g.sample()) + value : value);
        break;
      }
      case "ms":
      case "h":
      case "d":
        this.#family(name, "histogram", labels).labels(labels.values).observe(type === "ms" ? value / 1000 : value);
        break;
      case "s": {
        const key = name + JSON.stringify(labels.values);
        const set = this.#sets.get(key) ?? new Set();
        set.add(rawValue);
        this.#sets.set(key, set);
        this.#family(name, "gauge", labels).labels(labels.values).set(set.size);
        break;
      }
      default: this.lines.labels({ status: "unknown_type" }).inc();
    }
  }

  response() {}
  tick() {}

  #family(name, type, labels) {
    const key = `${type}:${name}`;
    let f = this.#series.get(key);
    if (!f) {
      const opts = { help: `StatsD ${type} ${name}, read off the wire.`, labels: labels.names };
      if (type === "histogram") opts.buckets = LATENCY_BUCKETS;
      f = this.telemetry[type](name, opts);
      this.#series.set(key, f);
    }
    return f;
  }
}

const parseTags = (tags) => {
  const names = [];
  const values = {};
  for (const t of (tags ?? "").split(",")) {
    if (!t) continue;
    const [k, v = "true"] = t.split(":");
    const name = k.replace(NAME, "_");
    names.push(name);
    values[name] = v;
  }
  return { names, values };
};

