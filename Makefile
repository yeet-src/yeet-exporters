# yeet-exporters: Prometheus exporters replaced by yeet scripts.
#
#   make            build every probe into lib/bpf/bin/ (vendored toolchain)
#   make check      syntax-check every script
#   sudo make veristat        this kernel's verifier over every probe
#   make veristat-matrix      the same across booted kernels (Linux + KVM)
#   make clean
#
# To run an exporter: cd exporters/<name> && make up

.DEFAULT_GOAL := all

include build/toolchain.mk
include build/bpf.mk

all: bpf

check:
	@set -e; for f in $$(find . -name '*.js' -not -path './node_modules/*'); do node --check "$$f"; done; echo "js ok"
	@set -e; for f in build/*.sh exporters/*/deploy.sh; do sh -n "$$f"; done; echo "sh ok"

clean: clean-bpf
	rm -rf .kmatrix

.PHONY: all check clean
