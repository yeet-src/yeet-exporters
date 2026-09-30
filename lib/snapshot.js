/* Reshape a collector's snapshot into an exporter's document. A
 * snapshot family is `{ type, help, value: [[labels, sample], ...] }`;
 * these fold its series into the names an upstream exporter uses.
 */

import { counter, gauge } from "yeet:telemetry";

// The families whose name starts with any of the prefixes.
export const pick = (doc, ...prefixes) =>
  Object.fromEntries(Object.entries(doc ?? {}).filter(([k]) => prefixes.some((p) => k.startsWith(p))));

const series = (family) => (Array.isArray(family?.value) ? family.value : []);
const num = (v) => (typeof v === "number" ? v : Number(v ?? 0));

// The sum of every series, or of those a predicate keeps.
export const sum = (family, keep = () => true) =>
  series(family).reduce((acc, [labels, v]) => (keep(labels) ? acc + num(v) : acc), 0);

// Series regrouped by a function of their labels, summed per group.
export const regroup = (family, group) => {
  const out = new Map();
  for (const [labels, v] of series(family)) {
    const g = group(labels);
    if (g === null) continue;
    const key = JSON.stringify(g);
    const cur = out.get(key) ?? [g, 0];
    cur[1] += num(v);
    out.set(key, cur);
  }
  return [...out.values()];
};

// The worker's liveness under the exporter's own `<prefix>_up` name.
export const upAs = (doc, name, help) => {
  const v = doc?.yeet_worker_up?.value;
  return { [name]: gauge({ help, value: Array.isArray(v) ? num(v[0]?.[1]) : num(v) }) };
};

export const counterOf = (help, value) => counter({ help, value });
export const gaugeOf = (help, value) => gauge({ help, value });

// Established sockets on a local port, from the socket table: the
// "connected clients" number every daemon exporter reports.
export async function establishedTo(port) {
  const res = await yeet.graph.query(`{ tcp { state local_address { port } } tcp6 { state local_address { port } } }`);
  const d = res?.data ?? res;
  const entries = [...(d.tcp ?? []), ...(d.tcp6 ?? [])];
  return entries.filter((e) => e.state === "Established" && e.local_address?.port === port).length;
}
