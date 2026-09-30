/* The port table the wire collector captures, from yeet.args:
 *
 *   --statsd 8125,8126 --redis 6379 --memcached 11211 --graphite 2003
 *
 * A flag may repeat or carry a comma list; an empty value turns the
 * protocol off. Anything not given takes the protocol's usual port.
 */

export const DEFAULTS = { statsd: [8125], redis: [6379], memcached: [11211], graphite: [2003] };
export const PROTOCOLS = Object.keys(DEFAULTS);

export function portsFrom(args = yeet.args) {
  const table = {};
  for (const proto of PROTOCOLS) {
    const given = args?.[proto];
    if (given === undefined) { table[proto] = DEFAULTS[proto]; continue; }
    table[proto] = [given].flat().flatMap((v) => String(v).split(",")).map((v) => v.trim()).filter(Boolean).map(toPort);
  }
  const seen = new Map();
  for (const [proto, ports] of Object.entries(table)) {
    for (const port of ports) {
      if (seen.has(port)) throw new Error(`port ${port} given to both ${seen.get(port)} and ${proto}`);
      seen.set(port, proto);
    }
  }
  return table;
}

function toPort(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`not a port: ${v}`);
  return n;
}

// The wire text of a table, for logs and the collector's help strings.
export const describe = (table) =>
  Object.entries(table).map(([p, ports]) => `${p}=${ports.length ? ports.join(",") : "off"}`).join(" ");
