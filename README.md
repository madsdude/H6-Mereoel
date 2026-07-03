# MEREOEL lagerhjemmeside

En enkel lagerhjemmeside til MEREOEL, pakket som Docker-image og klar til Docker Swarm. Fokus er drift: flere replicas, Nginx reverse proxy, load balancing, health checks, failover og adgang via et faelles DNS-navn.

## Arkitektur

```text
Bruger
  -> DNS: lager.mereoel.dk
  -> Docker Swarm routing mesh, port 80
  -> Nginx proxy service, 2 replicas
  -> Swarm service VIP
  -> Web service, 4 replicas
  -> Statisk lagerhjemmeside
```

Web-appen er statisk og serveres af en lille Nginx-container. I Swarm ligger der en separat Nginx reverse proxy foran web-servicen. Proxyen eksponerer port 80, mens Docker Swarm fordeler trafik mellem proxy-replicas via routing mesh og mellem web-replicas via service VIP.

## Indhold

- `Dockerfile` bygger web-containeren.
- `compose.yml` bruges til lokal test med reverse proxy.
- `docker-stack.yml` bruges til Docker Swarm deployment.
- `deploy/nginx-proxy.conf` er Nginx reverse proxy/loadbalancer.
- `src/` indeholder lagerhjemmesiden og Nginx-konfigurationen for web-containeren.
- `docs/SWARM.md` beskriver Swarm, DNS og drift.
- `docs/TESTPLAN.md` beskriver test af build, load balancing og failover.

## Lokal test

```bash
docker compose up --build
curl http://localhost:8080/healthz
```

Aabn derefter `http://localhost:8080`.

## Build image

```bash
docker build -t ghcr.io/madsdude/h6-mereoel:latest .
docker run --rm -p 8080:8080 ghcr.io/madsdude/h6-mereoel:latest
```

## Docker Swarm deployment

Foer `docker stack deploy` skal imaget vaere bygget og tilgaengeligt for alle Swarm-noder, for eksempel via GHCR.

```bash
docker swarm init --advertise-addr <MANAGER-IP>
docker stack deploy -c docker-stack.yml mereoel
docker service ls
docker service ps mereoel_web
docker service ps mereoel_proxy
```

Sitet eksponeres paa port 80 paa alle Swarm-noder via routing mesh. Saet DNS-navnet, for eksempel `lager.mereoel.dk`, til en ekstern load balancer foran Swarm-noderne eller til flere A-records mod noderne i et labmiljoe.

## Hurtige driftstests

```bash
curl http://lager.mereoel.dk/healthz
for i in {1..20}; do curl -s http://lager.mereoel.dk/ | grep -o "MEREOEL" | head -n 1; done

docker service scale mereoel_web=6
docker service update --force mereoel_web
docker service rollback mereoel_web
```

Se flere testscenarier i `docs/TESTPLAN.md`.
