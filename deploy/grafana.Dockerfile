FROM grafana/grafana:11.2.2

COPY --chown=grafana:grafana ops/grafana/provisioning/ /etc/grafana/provisioning/