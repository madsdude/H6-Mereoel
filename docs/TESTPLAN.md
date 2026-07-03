# Testplan

Brug denne testplan til at dokumentere, at hjemmesiden, Docker build, Swarm deployment, load balancing og failover virker.

## 1. Lokal Docker Compose test

```bash
docker compose up --build
```

Forventet:

- `mereoel-web-1` bliver healthy.
- `mereoel-proxy-1` bliver healthy.
- Siden kan åbnes på `http://localhost:8080`.
- Health endpoint svarer `ok`.

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/upstream-health
```

## 2. Image build

```bash
docker build -t ghcr.io/madsdude/h6-mereoel:test .
docker run --rm -p 8081:8080 ghcr.io/madsdude/h6-mereoel:test
curl http://localhost:8081/healthz
```

Forventet: `curl` returnerer `ok`.

## 3. Swarm deploy

```bash
docker swarm init --advertise-addr <MANAGER-IP>
docker stack deploy -c docker-stack.yml mereoel
docker service ls
```

Forventet:

- `mereoel_web` viser `4/4` replicas.
- `mereoel_proxy` viser `2/2` replicas.
- `curl http://<NODE-IP>/healthz` returnerer `ok`.

## 4. Load balancing

Kør flere requests mod DNS-navnet eller en node-IP:

```bash
for i in {1..30}; do curl -s http://<NODE-IP>/healthz; done
```

Forventet: Alle svarer `ok`. Kontroller access logs på proxy-tasks for at se trafik gennem flere proxy-containere:

```bash
docker service logs --tail 50 mereoel_proxy
```

## 5. Container failover

Find en web-container på en node og stop den:

```bash
docker ps --filter name=mereoel_web
```

På noden hvor containeren kører:

```bash
docker kill <CONTAINER-ID>
```

Forventet:

- `docker service ps mereoel_web` viser, at en ny task startes.
- Siden er fortsat tilgængelig via proxyen.
- `curl http://<NODE-IP>/upstream-health` returnerer `ok` efter kort tid.

## 6. Node failover

Dræn en node for at simulere planlagt vedligehold:

```bash
docker node update --availability drain <NODE-NAME>
docker service ps mereoel_web
docker service ps mereoel_proxy
```

Forventet:

- Tasks flyttes væk fra noden.
- Servicen bevarer ønsket antal replicas, hvis der er kapacitet.
- Siden kan stadig tilgås via DNS eller en anden node.

Aktiver noden igen:

```bash
docker node update --availability active <NODE-NAME>
```

## 7. DNS test

Når DNS er sat op:

```bash
nslookup lager.mereoel.dk
curl -I http://lager.mereoel.dk
curl http://lager.mereoel.dk/healthz
```

Forventet:

- DNS returnerer load balancerens IP eller flere Swarm-node-IP'er.
- HTTP svarer `200`.
- `/healthz` svarer `ok`.
