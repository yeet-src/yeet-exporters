/* Shared pieces of the eBPF collectors: the tcx attach target (every
 * up interface, loopback included, since the tcx wildcard skips it),
 * a loopback dedup (one packet crosses lo twice), latin-1 decoding of
 * a captured prefix, and a per-flow request queue that pairs each
 * response with the oldest unanswered request to measure latency.
 */

const DEDUP_MS = 4000;
const PENDING_MAX = 64;
const PENDING_MS = 10000;

export async function tcxTarget() {
  const res = await yeet.graph.query(`{ network_interfaces { index name is_up } }`);
  const data = res?.data ?? res;
  const up = (data.network_interfaces ?? []).filter((i) => i.is_up);
  if (!up.length) throw new Error("no up interfaces to attach to");
  return { kind: "tcx", ifindex: up.map((i) => i.index) };
}

// Loopback's ifindex: a packet on lo is seen on egress and again on
// ingress, so collectors keep only the egress copy.
export async function loopbackIndex() {
  const res = await yeet.graph.query(`{ network_interfaces { index name } }`);
  const data = res?.data ?? res;
  return (data.network_interfaces ?? []).find((i) => i.name === "lo")?.index ?? 1;
}

export const bytesOf = (ev) =>
  (ev.data instanceof Uint8Array ? ev.data : Uint8Array.from(Object.values(ev.data)))
    .subarray(0, Number(ev.captured));

export function latin1(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

export class Dedup {
  #seen = new Map();

  duplicate(ev, now) {
    const k = `${ev.family}:${ev.sport}>${ev.dport}#${ev.seq}`;
    if (this.#seen.has(k)) return true;
    this.#seen.set(k, now);
    return false;
  }

  prune(now) {
    for (const [k, t] of this.#seen) if (now - t > DEDUP_MS) this.#seen.delete(k);
  }
}

// The unordered port pair: a response travels the flow in reverse.
export const flowKey = (ev) =>
  `${ev.family}:${Math.min(ev.sport, ev.dport)}-${Math.max(ev.sport, ev.dport)}`;

export class Pending {
  #queues = new Map();

  push(ev, entry, now) {
    const f = flowKey(ev);
    let q = this.#queues.get(f);
    if (!q) { q = []; this.#queues.set(f, q); }
    q.push({ ...entry, ts: Number(ev.ts), at: now });
    if (q.length > PENDING_MAX) q.shift();
  }

  // The oldest request on the flow, with the latency to `ev` in seconds.
  pair(ev) {
    const f = flowKey(ev);
    const q = this.#queues.get(f);
    if (!q?.length) return null;
    const entry = q.shift();
    if (!q.length) this.#queues.delete(f);
    return { ...entry, seconds: Math.max(0, (Number(ev.ts) - entry.ts) / 1e9) };
  }

  prune(now) {
    for (const [f, q] of this.#queues) {
      while (q.length && now - q[0].at > PENDING_MS) q.shift();
      if (!q.length) this.#queues.delete(f);
    }
  }
}

// Latency buckets, 0.5 ms to 4 s.
export const LATENCY_BUCKETS = Array.from({ length: 14 }, (_, i) => 0.0005 * 2 ** i);
