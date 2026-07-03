FROM nginxinc/nginx-unprivileged:1.27-alpine

LABEL org.opencontainers.image.title="MEREOEL lagerhjemmeside" \
      org.opencontainers.image.description="Statisk lagerhjemmeside til MEREOEL, bygget til Docker Swarm" \
      org.opencontainers.image.source="https://github.com/madsdude/H6-Mereoel"

COPY src/nginx-app.conf /etc/nginx/conf.d/default.conf
COPY src/public/ /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
