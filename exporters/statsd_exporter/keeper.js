/* The eager unit of the standalone statsd_exporter service: holds the
 * wire collector open for the life of the service and hands it the
 * port table from this unit's yeet.args (`--statsd 8125,8126`). A
 * shared worker stops with its last connection and a scrape's isolate
 * lives milliseconds, so something has to keep the port; and a worker
 * does not see its opener's args, so the table travels as a message.
 * The top level settles so the service counts the unit up, and the
 * graph subscription keeps the isolate alive after that.
 */
import Telemetry from "yeet:telemetry";

import { describe, portsFrom } from "../../lib/ports.js";

const ports = portsFrom({ ...yeet.args, redis: "", memcached: "", graphite: "" });
const worker = Telemetry.keep("../../lib/collectors/wire.js");
worker.addEventListener("error", (e) => console.error(`wire collector: ${e.message}`));

// A message posted before the worker's top level settles is flushed
// to the snapshot handler, which ignores it; a snapshot round trip
// first proves the handler is installed.
await Telemetry.snapshot(worker, { timeout: 30000, throwOnDeadWorker: true });
worker.port.onmessage = (m) => {
  if (m.data?.configured) console.log(`capturing ${m.data.configured}`);
  else if (m.data?.error) console.error(`configure failed: ${m.data.error}`);
};
worker.port.postMessage({ configure: true, ports });

yeet.graph.subscribe(`subscription { host(interval_ms: 60000) { uptime { uptime } } }`, "keep", () => {});
console.log(`statsd_exporter keeper up, ${describe(ports)}`);
