/* RESP on the wire. A request is an array of bulk strings whose first
 * element is the command; a reply starts with one of + - : $ * and, in
 * RESP3, _ # , ( ! = % ~ >. Each reply pairs with the oldest request
 * on the flow, which is how redis-cli and every client pipeline.
 */

import { LATENCY_BUCKETS, Pending, latin1 } from "../probe.js";

const REPLY = new Set(["+", "-", ":", "$", "*", "_", "#", ",", "(", "!", "=", "%", "~", ">"]);

export class Redis {
  #pending = new Pending();

  constructor(telemetry) {
    this.commands = telemetry.counter("redis_commands", { help: "Commands seen on the wire, by command.", labels: ["cmd"] });
    this.errors = telemetry.counter("redis_command_errors", { help: "Error replies seen on the wire, by command.", labels: ["cmd"] });
    this.duration = telemetry.histogram("redis_command_duration_seconds", { help: "Wire latency from command to reply.", labels: ["cmd"], buckets: LATENCY_BUCKETS });
    this.durationTotal = telemetry.counter("redis_commands_duration_seconds", { help: "Total wire latency by command, as redis_exporter reports it.", labels: ["cmd"] });
    this.bytes = telemetry.counter("redis_net_input_bytes", { help: "Request payload bytes seen on the wire." });
    this.outBytes = telemetry.counter("redis_net_output_bytes", { help: "Reply payload bytes seen on the wire." });
  }

  request(ev, bytes, now) {
    const text = latin1(bytes);
    this.bytes.inc(Number(ev.total_len));
    for (const cmd of commandsIn(text)) {
      this.commands.labels({ cmd }).inc();
      this.#pending.push(ev, { cmd }, now);
    }
  }

  response(ev, bytes) {
    this.outBytes.inc(Number(ev.total_len));
    const text = latin1(bytes);
    // One segment may carry several pipelined replies; count the
    // top-level ones by their leading byte at a line start.
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (!REPLY.has(c)) break;
      const paired = this.#pending.pair(ev);
      if (!paired) break;
      if (c === "-") this.errors.labels({ cmd: paired.cmd }).inc();
      this.duration.labels({ cmd: paired.cmd }).observe(paired.seconds);
      this.durationTotal.labels({ cmd: paired.cmd }).inc(paired.seconds);
      const nl = text.indexOf("\r\n", i);
      if (nl < 0) break;
      i = skipReply(text, i, nl, c);
    }
  }

  tick(now) { this.#pending.prune(now); }
}

// Every command in a segment of pipelined RESP arrays: the first bulk
// string of each `*N` array, upper-cased. Inline commands count too.
function* commandsIn(text) {
  let i = 0;
  while (i < text.length) {
    if (text[i] === "*") {
      const nl = text.indexOf("\r\n", i);
      if (nl < 0) return;
      const n = Number(text.slice(i + 1, nl));
      i = nl + 2;
      let cmd = null;
      for (let k = 0; k < n && i < text.length; k++) {
        if (text[i] !== "$") return;
        const l = text.indexOf("\r\n", i);
        if (l < 0) return;
        const len = Number(text.slice(i + 1, l));
        const value = text.slice(l + 2, l + 2 + len);
        if (k === 0) cmd = value.toUpperCase();
        i = l + 2 + len + 2;
      }
      if (cmd) yield cmd;
    } else {
      const nl = text.indexOf("\r\n", i);
      const line = (nl < 0 ? text.slice(i) : text.slice(i, nl)).trim();
      if (line) yield line.split(/\s+/)[0].toUpperCase();
      if (nl < 0) return;
      i = nl + 2;
    }
  }
}

// Advance past one reply that starts at `i` with its first line ending at `nl`.
function skipReply(text, i, nl, c) {
  if (c === "$") {
    const len = Number(text.slice(i + 1, nl));
    return len < 0 ? nl + 2 : nl + 2 + len + 2;
  }
  if (c === "*") {
    // Skip the elements of an array roughly: consume lines until the
    // count is exhausted, treating bulk strings by their length.
    let n = Number(text.slice(i + 1, nl));
    let j = nl + 2;
    while (n > 0 && j < text.length) {
      const e = text.indexOf("\r\n", j);
      if (e < 0) return text.length;
      j = text[j] === "$" ? e + 2 + Math.max(0, Number(text.slice(j + 1, e))) + 2 : e + 2;
      n -= 1;
    }
    return j;
  }
  return nl + 2;
}
