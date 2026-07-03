# Testplan

Brug denne testplan til at dokumentere, at hjemmesiden, Docker build, Swarm deployment, load balancing og failover virker.

## 1. Lokal Docker Compose test

```bash
sudo docker compose up --build
```

Forventet:

- `mereoel-local-web-1` bliver healthy.
- `mereoel-local-proxy-1` bliver healthy.
- Siden kan åbnes på `http://localhost:8080`.
- Health endpoint svarer `ok`.

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/upstream-health
```

Ryd op efter lokal test, før du deployer med Swarm på samme maskine:

```bash
sudo docker compose down --remove-orphans
```

## 2. Image build

```bash
sudo docker build -t ghcr.io/madsdude/h6-mereoel:test .
sudo docker run --rm -p 8081:8080 ghcr.io/madsdude/h6-mereoel:test
curl http://localhost:8081/healthz
```

Forventet: `curl` returnerer `ok`.

## 3. Swarm deploy

```bash
sudo docker swarm init --advertise-addr <MANAGER-IP>
sudo docker build -t ghcr.io/madsdude/h6-mereoel:latest .
sudo docker stack deploy -c docker-stack.yml mereoel
sudo docker service ls
```

Forventet:

- `mereoel_web` viser `4/4` replicas.
- `mereoel_proxy` viser `2/2` replicas.
- `curl http://<NODE-IP>/healthz` returnerer `ok`.

Hvis deploy fejler med `network with name mereoel_app already exists`, se typen og ryd op:

```bash
sudo docker network inspect mereoel_app --format '{{.Name}} {{.Driver}} {{.Scope}}'
sudo docker compose down --remove-orphans
sudo docker stack rm mereoel
sudo docker network rm mereoel_app
sudo docker stack deploy -c docker-stack.yml mereoel
```

## 4. Load balancing

Kør flere requests mod DNS-navnet eller en node-IP:

```bash
for i in {1..30}; do curl -s http://<NODE-IP>/healthz; done
```

Forventet: Alle svarer `ok`. Kontroller access logs på proxy-tasks for at se trafik gennem flere proxy-containere:

```bash
sudo docker service logs --tail 50 mereoel_proxy
```

## 5. Container failover

Find en web-container på en node og stop den:

```bash
sudo docker ps --filter name=mereoel_web
```

På noden hvor containeren kører:

```bash
sudo docker kill <CONTAINER-ID>
```

Forventet:

- `sudo docker service ps mereoel_web` viser, at en ny task startes.
- Siden er fortsat tilgængelig via proxyen.
- `curl http://<NODE-IP>/upstream-health` returnerer `ok` efter kort tid.

## 6. Node failover

Dræn en node for at simulere planlagt vedligehold:

```bash
sudo docker node update --availability drain <NODE-NAME>
sudo docker service ps mereoel_web
sudo docker service ps mereoel_proxy
```

Forventet:

- Tasks flyttes væk fra noden.
- Servicen bevarer ønsket antal replicas, hvis der er kapacitet.
- Siden kan stadig tilgås via DNS eller en anden node.

Aktiver noden igen:

```bash
sudo docker node update --availability active <NODE-NAME>
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
