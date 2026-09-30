/* The memcached text protocol. A request is a command word and its
 * arguments on one line; a reply is STORED, NOT_STORED, VALUE…END,
 * DELETED, NOT_FOUND, TOUCHED, a number, or an error line. get/gets
 * replies say whether the key was found, which is the hit ratio the
 * exporter reads from `stats`.
 */

import { LATENCY_BUCKETS, Pending, latin1 } from "../probe.js";

const STORAGE = new Set(["set", "add", "replace", "append", "prepend", "cas"]);

export class Memcached {
  #pending = new Pending();

  constructor(telemetry) {
    this.commands = telemetry.counter("memcached_commands", { help: "Commands seen on the wire, by command and outcome.", labels: ["command", "status"] });
    this.duration = telemetry.histogram("memcached_command_duration_seconds", { help: "Wire latency from command to reply.", labels: ["command"], buckets: LATENCY_BUCKETS });
    this.readBytes = telemetry.counter("memcached_read_bytes", { help: "Request payload bytes seen on the wire." });
    this.writtenBytes = telemetry.counter("memcached_written_bytes", { help: "Reply payload bytes seen on the wire." });
  }

  request(ev, bytes, now) {
    this.readBytes.inc(Number(ev.total_len));
    const text = latin1(bytes);
    let i = 0;
    while (i < text.length) {
      const nl = text.indexOf("\r\n", i);
      const line = nl < 0 ? text.slice(i) : text.slice(i, nl);
      const [word, , , , len] = line.split(" ");
      const command = (word ?? "").toLowerCase();
      if (!command) break;
      this.#pending.push(ev, { command }, now);
      // A storage command's data block follows on the next line.
      i = nl < 0 ? text.length : STORAGE.has(command) ? nl + 2 + Number(len ?? 0) + 2 : nl + 2;
    }
  }

  response(ev, bytes) {
    this.writtenBytes.inc(Number(ev.total_len));
    const text = latin1(bytes);
    const first = text.split("\r\n")[0] ?? "";
    const paired = this.#pending.pair(ev);
    if (!paired) return;
    const { command } = paired;
    let status;
    if (command === "get" || command === "gets") status = first.startsWith("VALUE") ? "hit" : "miss";
    else if (first.startsWith("ERROR") || first.startsWith("CLIENT_ERROR") || first.startsWith("SERVER_ERROR")) status = "error";
    else if (first === "NOT_FOUND" || first === "NOT_STORED" || first === "EXISTS") status = first.toLowerCase();
    else status = "ok";
    this.commands.labels({ command, status }).inc();
    this.duration.labels({ command }).observe(paired.seconds);
  }

  tick(now) { this.#pending.prune(now); }
}
