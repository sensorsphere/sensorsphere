## build

```bash
# Build Frontend
docker compose build frontend
# Restart w/ new build
docker compose up -d frontend

# Build API
docker compose build api
# Restart w/ new build
docker compose up -d api

```

## Port forwarding

```bash
# Create local port forwarding
printf "\033]81;L=:8080::8080#Proxy on 8080 for IOT-Platform Dashboard\007"

```