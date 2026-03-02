# GABE Deploy Runbook

## Preflight
```bash
cd /root/HearthOS
docker compose -f docker-compose.gabe.yml config >/tmp/gabe-compose.rendered.yml
```

## Deploy
```bash
cd /root/HearthOS
git rev-parse HEAD

docker compose -f docker-compose.gabe.yml up -d --build
docker compose -f docker-compose.gabe.yml ps
```

## Health
```bash
curl -fsS http://127.0.0.1:4100/health
curl -fsS http://127.0.0.1:4100/metrics
curl -fsS http://127.0.0.1:6333/healthz
```

## Smoke
```bash
cd /root/HearthOS/services/gabe-knowledge-engine
npm run test:query
npm run test:regression
```

## Rollback
```bash
cd /root/HearthOS
git checkout <last-known-good-commit>
docker compose -f docker-compose.gabe.yml up -d --build gabe-knowledge-engine
curl -fsS http://127.0.0.1:4100/health
```
