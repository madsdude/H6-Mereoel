# Docker Swarm opsætning

Denne løsning er lavet til Docker Swarm med en separat Nginx reverse proxy foran web-servicen.

## Forudsætninger

- Mindst 1 Docker node til test. Brug 3 eller flere noder for reel failover.
- Docker Engine med Swarm aktiveret.
- Et Docker-image, som alle noder kan hente. Eksempel: `ghcr.io/madsdude/h6-mereoel:latest`.
- Et DNS-navn til adgang, for eksempel `lager.mereoel.dk`.

## Docker-rettigheder

Hvis du får denne fejl:

```text
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

så kør Docker-kommandoerne med `sudo`, eller tilføj brugeren til Docker-gruppen og log ind igen:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

I et skole- eller labmiljø er det ofte hurtigst bare at bruge `sudo docker ...` konsekvent.

## Byg og publicer image

GitHub Actions workflowet bygger automatisk imaget ved push til `main`. Hvis du vil gøre det manuelt:

```bash
docker build -t ghcr.io/madsdude/h6-mereoel:latest .
docker push ghcr.io/madsdude/h6-mereoel:latest
```

Hvis GHCR-pakken er privat, skal alle Swarm-noder kunne hente imaget. Log ind på noderne eller brug en registry secret efter jeres normale driftspolitik.

Til et enkelt-node lab kan du bygge imaget lokalt med samme tag og derefter deploye stacken på samme node:

```bash
sudo docker build -t ghcr.io/madsdude/h6-mereoel:latest .
```

## Initier Swarm

På manager-noden:

```bash
sudo docker swarm init --advertise-addr <MANAGER-IP>
```

Tilføj worker-noder med join-kommandoen fra `docker swarm init`, eller hent den igen:

```bash
sudo docker swarm join-token worker
```

## Deploy stack

```bash
sudo docker stack deploy -c docker-stack.yml mereoel
```

Hvis du vil bruge et andet image-tag:

```bash
sudo MEREOEL_IMAGE=ghcr.io/madsdude/h6-mereoel:sha-<commit> docker stack deploy -c docker-stack.yml mereoel
```

Når `deploy/nginx-proxy.conf` ændres, er det sikrest at fjerne stacken først, fordi Docker Swarm configs ikke altid opdateres rent på samme confignavn:

```bash
sudo docker stack rm mereoel
sudo docker stack deploy -c docker-stack.yml mereoel
```

## Services

Stacken opretter to services:

- `mereoel_proxy`: Nginx reverse proxy med 2 replicas og publiceret port 80.
- `mereoel_web`: Statisk lagerhjemmeside med 4 replicas bag proxyen.

Kontroller status:

```bash
sudo docker service ls
sudo docker service ps mereoel_proxy
sudo docker service ps mereoel_web
```

## Fejlfinding: network findes allerede

Hvis deploy fejler med:

```text
failed to create network mereoel_app: Error response from daemon: network with name mereoel_app already exists
```

så findes der allerede et Docker-network med samme navn. Se først typen:

```bash
sudo docker network inspect mereoel_app --format '{{.Name}} {{.Driver}} {{.Scope}}'
```

Hvis den viser `bridge`, kommer networket typisk fra lokal Compose-test. Ryd op sådan:

```bash
sudo docker compose down --remove-orphans
sudo docker network rm mereoel_app
sudo docker stack deploy -c docker-stack.yml mereoel
```

Hvis den viser `overlay`, er det typisk en gammel eller halv-oprettet Swarm-stack. Ryd op sådan:

```bash
sudo docker stack rm mereoel
sudo docker network rm mereoel_app
sudo docker stack deploy -c docker-stack.yml mereoel
```

Hvis `docker network rm` siger, at networket er i brug, find containerne eller services først:

```bash
sudo docker ps -a --filter network=mereoel_app
sudo docker service ls
```

## Fejlfinding: healthz virker, men forsiden giver 502

Hvis `curl http://10.1.10.10/healthz` svarer `ok`, men `curl http://10.1.10.10` giver `502 Bad Gateway`, er proxyen startet, men den kan ikke nå web-servicen.

Kontroller først web og proxy:

```bash
sudo docker service ls
sudo docker service ps mereoel_web
sudo docker service ps mereoel_proxy
sudo docker service logs --tail 50 mereoel_proxy
```

Ryd stacken og deploy igen efter et `git pull`, så den nye Nginx-konfig bliver brugt:

```bash
sudo docker stack rm mereoel
sudo docker build -t ghcr.io/madsdude/h6-mereoel:latest .
sudo docker stack deploy -c docker-stack.yml mereoel
```

Test derefter upstream gennem proxyen:

```bash
curl http://10.1.10.10/upstream-health
curl http://10.1.10.10
```

## DNS og fælles adgangsnavn

Anbefalet produktion:

1. Sæt `lager.mereoel.dk` som A- eller CNAME-record til en ekstern load balancer foran Swarm-noderne.
2. Lad load balanceren lave health checks mod `http://<node-ip>/healthz`.
3. Hold TTL lav, for eksempel 60 sekunder, hvis DNS failover bruges.

Lab eller skolemiljø:

1. Opret flere A-records for `lager.mereoel.dk`, en pr. Swarm-node.
2. Docker Swarm routing mesh gør port 80 tilgængelig på alle aktive noder.
3. Ved nodefejl skal DNS eller en ekstern load balancer fjerne døde noder for hurtig failover.

Undgå at pege DNS på kun én enkelt node, hvis høj oppetid er målet.

## Load balancing

Trafikken fordeles i to lag:

1. Swarm routing mesh fordeler trafik fra port 80 til en aktiv `proxy` task.
2. Nginx proxyen sender trafik til `mereoel_web:8080`, hvor Swarm service VIP fordeler videre til de 4 web-replicas.

## Failover

Containerfejl håndteres af Swarm restart policy. Nodefejl håndteres ved, at Swarm scheduler nye tasks på tilbageværende noder, hvis der er kapacitet.

Test en planlagt node-drain:

```bash
sudo docker node update --availability drain <NODE-NAME>
sudo docker service ps mereoel_web
sudo docker service ps mereoel_proxy
```

Sæt noden tilbage:

```bash
sudo docker node update --availability active <NODE-NAME>
```

## Skalering og opdatering

Skaler web-servicen:

```bash
sudo docker service scale mereoel_web=6
```

Rul en ny version ud:

```bash
sudo MEREOEL_IMAGE=ghcr.io/madsdude/h6-mereoel:sha-<commit> docker stack deploy -c docker-stack.yml mereoel
```

Hvis en opdatering fejler, er `failure_action: rollback` sat i stack-filen. Manuel rollback kan køres med:

```bash
sudo docker service rollback mereoel_web
```
