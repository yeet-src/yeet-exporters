# yeet-exporters

Prometheus exporters, replaced one at a time by a [yeet](https://yeet.cx)
script that reads the kernel instead of running a daemon next to it.
Each exporter is its own repo, named after the exporter it stands in
for, serving the same metric names on the same port:

| repo | stands in for | how |
|---|---|---|
| [yeet-src/statsd-exporter](https://github.com/yeet-src/statsd-exporter) | [prometheus/statsd_exporter](https://github.com/prometheus/statsd_exporter) | reads the datagrams off the wire with eBPF, no listener on 8125 |

More are on the way, one post each: nginx, redis, cadvisor, memcached,
process-exporter, node_exporter. Each gets a repo here when its post
lands.

Every one of them starts the same way:

```sh
curl -fsSL https://yeet.cx | sh
yeet login
git clone https://github.com/yeet-src/<repo> && cd <repo>
make up
```
