# Déploiement VPS

```bash
git clone <repo> /opt/iot-platform
cd /opt/iot-platform

cp .env.example .env
nano .env

docker compose config
docker compose build
docker compose up -d
```

## Vérification

```bash
docker compose ps
docker compose logs -f mqtt-ingestor
curl http://127.0.0.1:8080/api/health
```
