# <exporter name>, on yeet

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux-1793D1?logo=linux&logoColor=white" alt="Linux">
  <img src="https://img.shields.io/badge/built%20with-yeet%20%2B%20eBPF-8A2BE2" alt="yeet + eBPF">
  <img src="https://img.shields.io/badge/metrics-Prometheus-E6522C?logo=prometheus&logoColor=white" alt="Prometheus">
  <img src="https://img.shields.io/badge/dashboard-Grafana-F46800?logo=grafana&logoColor=white" alt="Grafana">
  <a href="https://github.com/yeet-src/yeet-exporters/actions/workflows/kernel-matrix.yml"><img src="https://github.com/yeet-src/yeet-exporters/actions/workflows/kernel-matrix.yml/badge.svg" alt="kernel matrix"></a>
  <a href="https://discord.gg/JxVseaAVAU"><img src="https://img.shields.io/badge/chat-Discord-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
</p>

![<exporter> on yeet: <what the panels show>](docs/dashboard.png)

<One or two sentences: what upstream exporter this stands in for and
what it reads instead. No architecture.>

## Getting started

```sh
curl -fsSL https://yeet.cx | sh
yeet login
```

```sh
git clone https://github.com/yeet-src/yeet-exporters
cd yeet-exporters/exporters/<exporter dir>
make up
```

The service is on `:<upstream port>` at `/metrics`. Point Prometheus at
it as you would the original:

```yaml
scrape_configs:
  - job_name: <job>
    static_configs:
      - targets: ["myhost:<upstream port>"]
```

```sh
make down       # stop and remove the service
make scrape     # curl /metrics
```

`make up` builds the probe the first time with yeet's vendored static
toolchain, fetched once into `~/.cache/yeet`. <kernel requirement>

## Options

<The make variables and what they change, one line each.>

## What comes out

<The metric families, or the rule that names them.>

## Dashboard

<`dashboard.json` is the dashboard at the top; how to import it, what to change.>

## Differences from <upstream>

<Bullets. Be specific about what is not there.>

## Read more

<Link to the blog post.>
