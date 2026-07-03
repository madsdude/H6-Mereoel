# Docker Swarm opsætning

Denne løsning er lavet til Docker Swarm med en separat Nginx reverse proxy foran web-servicen.

## Forudsætninger

- Mindst 1 Docker node til test. Brug 3 eller flere noder for reel failover.
- Docker Engine med Swarm aktiveret.
- Et Docker-image, som alle noder kan hente. Eksempel: `ghcr.io/madsdude/h6-mereoel:latest`.
- Et DNS-navn til adgang, for eksempel `lager.mereoel.dk`.

## Swarm-porte mellem noder

I et multi-node Swarm setup skal noderne kunne tale sammen på Docker Swarm-portene. Hvis de ikke kan det, kan enkelte proxy- eller web-tasks virke, mens andre giver `502 Bad Gateway`.

Åbn disse porte mellem Swarm-noderne:

- `2377/tcp` til manager-noder for cluster management.
- `7946/tcp` og `7946/udp` mellem alle noder for node discovery.
- `4789/udp` mellem alle noder for overlay network traffic.
- `80/tcp` mod de noder, som brugere eller load balanceren skal ramme.

Med `ufw` i et labmiljø kan det for eksempel være:

```bash
sudo ufw allow 2377/tcp
sudo ufw allow 7946/tcp
sudo ufw allow 7946/udp
sudo ufw allow 4789/udp
sudo ufw allow 80/tcp
sudo ufw reload
```

Hvis noderne kører i en cloud, skal de samme porte også åbnes i security groups/firewall-regler mellem noderne.

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

Hvis `curl http://10.1.10.10/healthz` svarer `ok`, men `curl http://10.1.10.10` giver `502 Bad Gateway`, er proxyen startet, men den kan ikke nå web-servicen stabilt.

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

## Fejlfinding: skiftevis 200 og 502

Hvis en loop-test skifter mellem `200` og `502`, rammer Swarm routing mesh sandsynligvis skiftevis en proxy-task der virker og en proxy-task der ikke kan nå web-upstreamen:

```bash
for i in {1..10}; do curl -s -o /dev/null -w "%{http_code}\n" http://10.1.10.10/; done
```

Typiske årsager:

- Proxyen har startet før web-servicen var registreret i Docker DNS.
- En proxy-task har cached en upstream-IP, som ikke længere er korrekt.
- Overlay network mellem noderne mangler portene `7946/tcp`, `7946/udp` eller `4789/udp`.
- En worker-node kan køre containers, men data-plane trafik mellem noderne er blokeret af firewall eller security group.

Tjek først hvilke proxy-tasks der fejler:

```bash
sudo docker service ps mereoel_proxy --no-trunc
sudo docker service logs --tail 80 mereoel_proxy
```

Hvis loggen viser `connect() failed (111: Connection refused) while connecting to upstream`, så tjek overlay-porte mellem noderne og deploy igen efter seneste proxy-konfig:

```bash
git pull
sudo docker stack rm mereoel
sleep 10
sudo docker stack deploy -c docker-stack.yml mereoel
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
