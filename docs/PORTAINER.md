# Portainer guide til Docker Swarm

Denne guide viser, hvordan du installerer Portainer CE i Docker Swarm og får både manager- og worker-noder vist i Portainer. Portainer installeres som en Swarm stack på manageren. Worker-noder skal ikke tilføjes manuelt i GUI'en, så længe de allerede er joined til samme Swarm.

Officiel Portainer Swarm-installation: https://docs.portainer.io/start/install-ce/server/swarm/linux

## 1. Forudsætninger

På manageren:

```bash
sudo docker node ls
```

Forventet: manageren skal stå som `Leader`, og worker-noden skal være `Ready` og `Active`.

Eksempel:

```text
ID                            HOSTNAME   STATUS    AVAILABILITY   MANAGER STATUS
abc123 *                      manager    Ready     Active         Leader
def456                        worker1    Ready     Active
```

Hvis worker mangler, skal den joines med kommandoen fra manageren:

```bash
sudo docker swarm join-token worker
```

Kør den viste `docker swarm join ...` kommando på worker-noden.

## 2. Åbn nødvendige porte

Portainer og Swarm kræver netværk mellem noderne.

På manageren:

```bash
sudo ufw allow 2377/tcp
sudo ufw allow 7946/tcp
sudo ufw allow 7946/udp
sudo ufw allow 4789/udp
sudo ufw allow 9443/tcp
sudo ufw allow 9001/tcp
sudo ufw reload
```

På worker-noder:

```bash
sudo ufw allow 7946/tcp
sudo ufw allow 7946/udp
sudo ufw allow 4789/udp
sudo ufw allow 9001/tcp
sudo ufw reload
```

Hvis `ufw` ikke bruges, skal de samme porte åbnes i netværks-firewall eller cloud security group.

Portene bruges til:

- `2377/tcp`: Swarm manager API for join/cluster management.
- `7946/tcp` og `7946/udp`: Swarm node discovery.
- `4789/udp`: Overlay network trafik mellem noder.
- `9443/tcp`: Portainer web-GUI.
- `9001/tcp`: Portainer Agent kommunikation mellem noder.

## 3. Installer Portainer på manageren

Kør kun dette på Swarm-manageren:

```bash
curl -L https://downloads.portainer.io/ce-lts/portainer-agent-stack.yml -o portainer-agent-stack.yml
sudo docker stack deploy -c portainer-agent-stack.yml portainer
```

Portainer opretter typisk:

- `portainer_portainer`: Portainer Server, web-GUI'en.
- `portainer_agent`: Portainer Agent, kører globalt på Swarm-noderne.

Tjek status:

```bash
sudo docker service ls
sudo docker service ps portainer_portainer
sudo docker service ps portainer_agent
```

Forventet:

- `portainer_portainer` har `1/1` replica.
- `portainer_agent` har én task pr. Swarm-node.

Hvis du har 1 manager og 1 worker, skal agenten normalt vise `2/2`.

## 4. Log ind i Portainer

Åbn i browseren:

```text
https://10.1.10.10:9443
```

Brug managerens IP-adresse. Browseren kan vise en certifikatadvarsel, fordi Portainer som standard bruger et selvsigneret certifikat. Det er normalt i et labmiljø.

Ved første login:

1. Opret admin-bruger.
2. Vælg det lokale Swarm environment, hvis Portainer spørger.
3. Gå ind på environmentet for at se Swarm clusteret.

## 5. Se manager og worker i Portainer

I Portainer:

1. Vælg dit Docker Swarm environment.
2. Gå til `Swarm` eller `Cluster` afhængigt af Portainer-visningen.
3. Åbn `Nodes`.
4. Kontroller at både manager og worker vises.

Du bør kunne se:

- Node-navn.
- Role, for eksempel manager eller worker.
- Status, for eksempel ready/active.
- CPU og memory.
- Hvilke tasks der kører på noden.

Hvis worker ikke vises i Portainer, men vises i Docker CLI:

```bash
sudo docker node ls
```

så tjek Portainer Agent:

```bash
sudo docker service ps portainer_agent --no-trunc
sudo docker service logs --tail 80 portainer_agent
```

## 6. Se MEREØL-stacken i Portainer

Når Portainer er oppe, kan MEREØL-løsningen ses i GUI'en.

I Portainer:

1. Vælg Swarm environmentet.
2. Gå til `Stacks`.
3. Find stacken `mereoel`.
4. Åbn stacken og se services:
   - `mereoel_web`
   - `mereoel_proxy`
5. Kontroller replicas:
   - `mereoel_web`: 4 replicas.
   - `mereoel_proxy`: 2 replicas.

Du kan også se det fra CLI:

```bash
sudo docker stack services mereoel
sudo docker service ps mereoel_web
sudo docker service ps mereoel_proxy
```

## 7. Test failover visuelt

Portainer er god til at demonstrere failover.

### Stop en web-container

Find en web-container på en node:

```bash
sudo docker ps --filter name=mereoel_web
```

Stop den:

```bash
sudo docker kill <CONTAINER-ID>
```

Se i Portainer:

1. Gå til `Stacks` -> `mereoel`.
2. Åbn `mereoel_web`.
3. Se at Swarm opretter en ny task.
4. Kontroller at antallet af replicas kommer tilbage på 4.

### Dræn en worker-node

På manageren:

```bash
sudo docker node ls
sudo docker node update --availability drain <WORKER-NODE-NAME>
```

Se i Portainer:

1. Gå til `Nodes`.
2. Worker-noden bør stå som drained.
3. Tasks flyttes til andre noder, hvis der er kapacitet.

Aktiver noden igen:

```bash
sudo docker node update --availability active <WORKER-NODE-NAME>
```

## 8. Almindelig fejlfinding

### Portainer GUI åbner ikke

Tjek service og port:

```bash
sudo docker service ls
sudo docker service ps portainer_portainer
sudo ss -tulpn | grep 9443
```

Tjek firewall:

```bash
sudo ufw status
```

### Agent mangler på worker

Tjek om worker stadig er i Swarm:

```bash
sudo docker node ls
```

Tjek agent-service:

```bash
sudo docker service ps portainer_agent --no-trunc
sudo docker service logs --tail 80 portainer_agent
```

### Worker kan ikke nå manager

Kontroller Swarm- og Portainer-porte mellem noderne:

```bash
nc -vz <MANAGER-IP> 2377
nc -vz <MANAGER-IP> 9001
```

UDP-porte som `4789/udp` er sværere at teste med `nc`, men de skal være åbne mellem noderne for overlay networks.

## 9. Fjern Portainer igen

Hvis Portainer skal fjernes:

```bash
sudo docker stack rm portainer
```

Vent nogle sekunder og kontroller:

```bash
sudo docker service ls
```

Hvis Portainer-volumen også skal slettes, så find den først:

```bash
sudo docker volume ls | grep portainer
```

Slet kun volumen, hvis data må fjernes:

```bash
sudo docker volume rm <PORTAINER_VOLUME_NAME>
```
