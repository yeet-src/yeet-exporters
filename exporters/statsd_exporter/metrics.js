/* prometheus/statsd_exporter, without the listener: the datagrams
 * apps send to 8125 are read off the wire on this host, whether or
 * not anything receives them. The metrics are the ones the lines
 * name, mapped as statsd_exporter maps them.
 */
import { render } from "yeet:telemetry";

import { emit } from "../../lib/emit.js";
import { pick, upAs } from "../../lib/snapshot.js";

// Everything the wire collector holds that is not another protocol's,
// including the collector's own wire_collector_* families.
const OTHERS = ["redis_", "memcached_", "graphite_"];
emit(await render({ worker: "../../lib/collectors/wire.js" }, ({ worker: w }) => ({
  ...upAs(w, "statsd_exporter_up", "1 when the wire collector answered."),
  ...Object.fromEntries(Object.entries(w).filter(([k, f]) => k !== "yeet_worker_up" && !OTHERS.some((p) => k.startsWith(p)) && !/^Graphite/.test(f?.help ?? ""))),
})));
