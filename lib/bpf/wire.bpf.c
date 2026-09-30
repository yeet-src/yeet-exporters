// SPDX-License-Identifier: GPL-2.0
//
// wire — capture the first bytes of every TCP or UDP payload to or from
// a small set of well-known ports, at the TC layer on every interface.
// One passive observer feeds every line-protocol exporter. The kernel
// side only matches the port against the `ports` map, which the script
// fills from its arguments, and copies a bounded prefix; each protocol
// is decoded in JavaScript.
//
// Header walking follows httptop: Ethernet or loopback carry a 14-byte
// link header, tun carries none, and the absolute bpf_skb_load_bytes
// reads across paged frags, which the payload usually is.

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

#define ETH_P_IP   0x0800
#define ETH_P_IPV6 0x86DD
#define L2_ETH     14

#define TCX_NEXT (-1)

#define DATA_MAX 512           /* power of two: see the mask below */

#define DIR_EGRESS  0
#define DIR_INGRESS 1


struct wire_event {
    __u64 ts;           /* bpf_ktime_get_ns() at capture */
    __u16 sport;
    __u16 dport;
    __u32 seq;          /* TCP sequence, 0 for UDP */
    __u32 ifindex;      /* a loopback packet fires egress and ingress */
    __u8  family;       /* 4 or 6 */
    __u8  proto;        /* IPPROTO_TCP or IPPROTO_UDP */
    __u8  dir;
    __u8  pad;
    __u32 total_len;    /* payload bytes on the wire */
    __u32 captured;     /* bytes copied into data[] */
    __u8  data[DATA_MAX];
};
__attribute__((used)) static const struct wire_event __wire_event_anchor;

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 8 << 20);
} events SEC(".maps");

/* The ports worth capturing, filled by the script. */
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 64);
    __type(key, __u16);
    __type(value, __u8);
} ports SEC(".maps");

static __always_inline int wanted(__u16 sport, __u16 dport)
{
    return bpf_map_lookup_elem(&ports, &sport) != NULL
        || bpf_map_lookup_elem(&ports, &dport) != NULL;
}

static __always_inline int handle(struct __sk_buff *skb, __u8 dir)
{
    __u32 l3;
    __u8  family;
    __u16 etype = 0;
    bpf_skb_load_bytes(skb, 12, &etype, 2);
    if (etype == bpf_htons(ETH_P_IP))        { l3 = L2_ETH; family = 4; }
    else if (etype == bpf_htons(ETH_P_IPV6)) { l3 = L2_ETH; family = 6; }
    else {
        __u8 b0 = 0;
        if (bpf_skb_load_bytes(skb, 0, &b0, 1) < 0)
            return TCX_NEXT;
        __u8 v = b0 >> 4;
        if (v == 4)      { l3 = 0; family = 4; }
        else if (v == 6) { l3 = 0; family = 6; }
        else return TCX_NEXT;
    }

    __u32 l4;
    __u8  proto = 0;
    if (family == 4) {
        __u8 vihl = 0;
        if (bpf_skb_load_bytes(skb, l3, &vihl, 1) < 0)
            return TCX_NEXT;
        if ((vihl >> 4) != 4)
            return TCX_NEXT;
        __u32 ihl = (vihl & 0x0f) * 4;
        if (ihl < 20)
            return TCX_NEXT;
        if (bpf_skb_load_bytes(skb, l3 + 9, &proto, 1) < 0)
            return TCX_NEXT;
        l4 = l3 + ihl;
    } else {
        if (bpf_skb_load_bytes(skb, l3 + 6, &proto, 1) < 0)
            return TCX_NEXT;
        l4 = l3 + 40;
    }
    if (proto != IPPROTO_TCP && proto != IPPROTO_UDP)
        return TCX_NEXT;

    __u16 sport = 0, dport = 0;
    bpf_skb_load_bytes(skb, l4,     &sport, 2);
    bpf_skb_load_bytes(skb, l4 + 2, &dport, 2);
    sport = bpf_ntohs(sport);
    dport = bpf_ntohs(dport);
    if (!wanted(sport, dport))
        return TCX_NEXT;

    __u32 seq = 0;
    __u32 poff;
    if (proto == IPPROTO_TCP) {
        __u8 doffb = 0;
        bpf_skb_load_bytes(skb, l4 + 4, &seq, 4);
        if (bpf_skb_load_bytes(skb, l4 + 12, &doffb, 1) < 0)
            return TCX_NEXT;
        __u32 doff = (doffb >> 4) * 4;
        if (doff < 20)
            return TCX_NEXT;
        poff = l4 + doff;
        seq = bpf_ntohl(seq);
    } else {
        poff = l4 + 8;
    }

    if (skb->len <= poff)
        return TCX_NEXT;
    __u32 plen = skb->len - poff;
    __u32 cap = plen > DATA_MAX - 1 ? DATA_MAX - 1 : plen;
    cap &= (DATA_MAX - 1);
    /* Pin the bound the verifier sees: without the barrier clang folds
       the zero test into the length compare above and the load below
       is checked against [0, 511]. */
    asm volatile("" : "+r"(cap));
    if (cap == 0)
        return TCX_NEXT;

    struct wire_event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e)
        return TCX_NEXT;
    e->ts        = bpf_ktime_get_ns();
    e->sport     = sport;
    e->dport     = dport;
    e->seq       = seq;
    e->ifindex   = skb->ifindex;
    e->family    = family;
    e->proto     = proto;
    e->dir       = dir;
    e->pad       = 0;
    e->total_len = plen;
    e->captured  = cap;
    if (bpf_skb_load_bytes(skb, poff, e->data, cap) < 0) {
        bpf_ringbuf_discard(e, 0);
        return TCX_NEXT;
    }
    bpf_ringbuf_submit(e, 0);
    return TCX_NEXT;
}

SEC("tcx/ingress")
int on_ingress(struct __sk_buff *skb) { return handle(skb, DIR_INGRESS); }

SEC("tcx/egress")
int on_egress(struct __sk_buff *skb)  { return handle(skb, DIR_EGRESS); }

char LICENSE[] SEC("license") = "GPL";
