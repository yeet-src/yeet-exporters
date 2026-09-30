# <exporter name>, on yeet

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

## Differences from <upstream>

<Bullets. Be specific about what is not there.>

## Read more

<Link to the blog post.>
