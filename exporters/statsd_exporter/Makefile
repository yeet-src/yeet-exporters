# statsd_exporter on yeet.
#
#   make up                      # build the probe if needed, start the service on :9102
#   make up STATSD=8125,8126     # watch more ports
#   make down                    # stop and remove the service
#   make status                  # the service tree
#   make scrape                  # curl /metrics

PORT   ?= 9102
STATSD ?= 8125
SVC    := statsd-exporter
PROBE  := ../../lib/bpf/bin/wire.bpf.o

.PHONY: up down status scrape probe

up: probe
	./deploy.sh $(PORT) --statsd $(STATSD)

down:
	./deploy.sh remove

status:
	yeet service tree $(SVC)

scrape:
	curl -fsS localhost:$(PORT)/metrics

probe $(PROBE):
	$(MAKE) -C ../.. lib/bpf/bin/wire.bpf.o
