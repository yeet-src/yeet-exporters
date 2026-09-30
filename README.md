# yeet-exporters

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux-1793D1?logo=linux&logoColor=white" alt="Linux">
  <img src="https://img.shields.io/badge/built%20with-yeet%20%2B%20eBPF-8A2BE2" alt="yeet + eBPF">
  <img src="https://img.shields.io/badge/metrics-Prometheus-E6522C?logo=prometheus&logoColor=white" alt="Prometheus">
  <a href="https://github.com/yeet-src/yeet-exporters/actions/workflows/ci.yml"><img src="https://github.com/yeet-src/yeet-exporters/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <a href="https://github.com/yeet-src/yeet-exporters/actions/workflows/kernel-matrix.yml"><img src="https://github.com/yeet-src/yeet-exporters/actions/workflows/kernel-matrix.yml/badge.svg" alt="kernel matrix"></a>
  <a href="https://discord.gg/JxVseaAVAU"><img src="https://img.shields.io/badge/chat-Discord-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
</p>

Prometheus exporters, replaced one at a time by a [yeet](https://yeet.cx)
script that reads the kernel instead of running a daemon next to it. Each
directory under `exporters/` is named after the exporter it stands in
for, serves the same metric names on the same port, and runs on its own:

```sh
curl -fsSL https://yeet.cx | sh
yeet login
git clone https://github.com/yeet-src/yeet-exporters
cd yeet-exporters/exporters/<name>
make up
```

## Released

| directory | stands in for | how |
|---|---|---|
| [`exporters/statsd_exporter`](exporters/statsd_exporter) | [prometheus/statsd_exporter](https://github.com/prometheus/statsd_exporter) | reads the datagrams off the wire with eBPF, no listener on 8125 |

More are on the way, one post each: nginx, redis, cadvisor, memcached,
process-exporter, node_exporter. Each lands here when its post does.

## Layout

```
exporters/<name>/      one released exporter: README, Makefile, deploy.sh, the scripts
exporters/README.template.md   what every exporter's README follows
lib/bpf/               the probes (C), built into lib/bpf/bin/
lib/collectors/        shared workers that load a probe and serve snapshots
lib/wire/              line-protocol decoders
build/                 the vendored static toolchain and the kernel matrix
```

A scrape is a fresh isolate that lives a few milliseconds and has no
network access; yeet's web server owns the socket. The collector is a
shared worker that watches the wire for the life of the service.

## Build and CI

```sh
make            # lib/bpf/bin/*.bpf.o via the vendored toolchain
make check      # syntax over every script
sudo make veristat        # this kernel's verifier over every probe
make veristat-matrix      # the same across booted kernels (Linux + KVM)
```

clang, bpftool and veristat are static binaries pinned in
`build/toolchain.lock` and fetched once into `~/.cache/yeet`. CI builds
the probes on every push and the kernel matrix loads every program in
every object on 6.6, 6.12 and bpf-next.
