# Docker Swarm opsætning

Denne løsning er lavet til Docker Swarm med en separat Nginx reverse proxy foran web-servicen.

## Forudsætninger

- Mindst 1 Docker node til test. Brug 3 eller flere noder for reel failover.
- Docker Engine med Swarm aktiveret.
- Et Docker-image, som alle noder kan hente. Eksempel: `ghcr.io/madsdude/h6-mereoel:latest`.
- Et DNS-navn til adgang, for eksempel `lager.mereoel.dk`.

## Byg og publicer image

GitHub Actions workflowet bygger automatisk imaget ved push til `main`. Hvis du vil gøre det manuelt:

```bash
docker build -t ghcr.io/madsdude/h6-mereoel:latest .
docker push ghcr.io/madsdude/h6-mereoel:latest
```

Hvis GHCR-pakken er privat, skal alle Swarm-noder kunne hente imaget. Log ind på noderne eller brug en registry secret efter jeres normale driftspolitik.

## Initier Swarm

På manager-noden:

```bash
docker swarm init --advertise-addr <MANAGER-IP>
```

Tilføj worker-noder med join-kommandoen fra `docker swarm init`, eller hent den igen:

```bash
docker swarm join-token worker
```

## Deploy stack

```bash
docker stack deploy -c docker-stack.yml mereoel
```

Hvis du vil bruge et andet image-tag:

```bash
MEREOEL_IMAGE=ghcr.io/madsdude/h6-mereoel:sha-<commit> docker stack deploy -c docker-stack.yml mereoel
```

## Services

Stacken opretter to services:

- `mereoel_proxy`: Nginx reverse proxy med 2 replicas og publiceret port 80.
- `mereoel_web`: Statisk lagerhjemmeside med 4 replicas bag proxyen.

Kontroller status:

```bash
docker service ls
docker service ps mereoel_proxy
docker service ps mereoel_web
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
2. Nginx proxyen sender trafik til `web:8080`, hvor Swarm service VIP fordeler videre til de 4 web-replicas.

## Failover

Containerfejl håndteres af Swarm restart policy. Nodefejl håndteres ved, at Swarm scheduler nye tasks på tilbageværende noder, hvis der er kapacitet.

Test en planlagt node-drain:

```bash
docker node update --availability drain <NODE-NAME>
docker service ps mereoel_web
docker service ps mereoel_proxy
```

Sæt noden tilbage:

```bash
docker node update --availability active <NODE-NAME>
```

## Skalering og opdatering

Skaler web-servicen:

```bash
docker service scale mereoel_web=6
```

Rul en ny version ud:

```bash
MEREOEL_IMAGE=ghcr.io/madsdude/h6-mereoel:sha-<commit> docker stack deploy -c docker-stack.yml mereoel
```

Hvis en opdatering fejler, er `failure_action: rollback` sat i stack-filen. Manuel rollback kan køres med:

```bash
docker service rollback mereoel_web
```
