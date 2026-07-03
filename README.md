# MEREØL lagerhjemmeside

En enkel lagerhjemmeside til MEREØL, pakket som Docker-image og klar til Docker Swarm. Fokus er drift: flere replicas, Nginx reverse proxy, load balancing, health checks, failover og adgang via et fælles DNS-navn.

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
- `.github/workflows/docker-image.yml` bygger og publicerer Docker-imaget til GHCR ved push til `main`.

## Lokal test

```bash
docker compose up --build
curl http://localhost:8080/healthz
```

Åbn derefter `http://localhost:8080`.

Ryd lokal Compose-test op før Swarm-deploy, hvis du har testet lokalt på samme maskine:

```bash
docker compose down --remove-orphans
```

## Build image

```bash
docker build -t ghcr.io/madsdude/h6-mereoel:latest .
docker run --rm -p 8080:8080 ghcr.io/madsdude/h6-mereoel:latest
```

## Docker Swarm deployment

Før `docker stack deploy` skal imaget være bygget og tilgængeligt for alle Swarm-noder, for eksempel via GHCR. I et enkelt-node lab kan du bygge imaget lokalt med samme tag før deployment.

```bash
docker swarm init --advertise-addr <MANAGER-IP>
docker build -t ghcr.io/madsdude/h6-mereoel:latest .
docker stack deploy -c docker-stack.yml mereoel
docker service ls
docker service ps mereoel_web
docker service ps mereoel_proxy
```

Sitet eksponeres på port 80 på alle Swarm-noder via routing mesh. Sæt DNS-navnet, for eksempel `lager.mereoel.dk`, til en ekstern load balancer foran Swarm-noderne eller til flere A-records mod noderne i et labmiljø.

## Fejlfinding

Hvis `docker stack deploy` fejler med `network with name mereoel_app already exists`, ligger der et gammelt Docker-network med samme navn. Det sker typisk efter lokal Compose-test eller et tidligere afbrudt stack-deploy.

```bash
docker network inspect mereoel_app --format '{{.Name}} {{.Driver}} {{.Scope}}'
```

Hvis networket er `bridge`, ryd lokal Compose-test op:

```bash
docker compose down --remove-orphans
docker network rm mereoel_app
```

Hvis networket er `overlay`, ryd stacken op og deploy igen:

```bash
docker stack rm mereoel
docker network rm mereoel_app
docker stack deploy -c docker-stack.yml mereoel
```

Hvis du får `permission denied while trying to connect to the docker API`, skal kommandoen køres med `sudo`, eller også skal brugeren tilføjes Docker-gruppen og logge ind igen.

## Hurtige driftstests

```bash
curl http://lager.mereoel.dk/healthz
for i in {1..20}; do curl -s http://lager.mereoel.dk/ | grep -o "MEREØL" | head -n 1; done

docker service scale mereoel_web=6
docker service update --force mereoel_web
docker service rollback mereoel_web
```

Se flere testscenarier i `docs/TESTPLAN.md`.
