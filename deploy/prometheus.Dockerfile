FROM prom/prometheus:v2.54.1

COPY --chown=nobody:nobody ops/prometheus/ /etc/prometheus/