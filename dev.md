## build

```bash
# Build Frontend and Restart w/ new build
docker compose build frontend && docker compose up -d frontend


# Build API
docker compose build api
# Restart w/ new build
docker compose up -d api

# Build Service
docker compose build ingestion-service

```

## Port forwarding

```bash
# Create local port forwarding
printf "\033]81;L=:8080::8080#Proxy on 8080 for IOT-Platform Dashboard\007"

```

## Apply PRs

```ps1
# apply-pr-remotely.ps1

./apply-pr-remotely.ps1 <prfile.tar.gz>

```