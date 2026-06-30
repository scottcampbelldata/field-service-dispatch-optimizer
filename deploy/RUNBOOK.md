# Deployment runbook

Target: a single Linux host with Postgres, nginx, Python 3.12, and Node 20+.
Two subdomains: `dispatch.scottcampbell.io` (web) and
`dispatch-api.scottcampbell.io` (API).

## 1. Database

```bash
sudo -u postgres psql -c "CREATE USER dispatch WITH PASSWORD 'CHANGEME';"
sudo -u postgres psql -c "CREATE DATABASE dispatch OWNER dispatch;"
```

## 2. Code + backend

```bash
sudo git clone <repo> /opt/dispatch
cd /opt/dispatch
python3.12 -m venv .venv
.venv/bin/pip install -e .
# Seed (also runs via ExecStartPre, idempotent):
DATABASE_URL=postgresql+psycopg://dispatch:CHANGEME@localhost:5432/dispatch \
  .venv/bin/python data-generator/generate_synthetic_data.py
```

## 3. Frontend build

```bash
cd /opt/dispatch/frontend
npm ci
NEXT_PUBLIC_API_BASE=https://dispatch-api.scottcampbell.io npm run build
```

## 4. systemd

```bash
sudo cp deploy/dispatch-api.service /etc/systemd/system/
sudo cp deploy/dispatch-web.service /etc/systemd/system/
# Edit the DATABASE_URL password in dispatch-api.service first.
sudo systemctl daemon-reload
sudo systemctl enable --now dispatch-api dispatch-web
sudo systemctl status dispatch-api dispatch-web
```

## 5. nginx + TLS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/dispatch
sudo ln -s /etc/nginx/sites-available/dispatch /etc/nginx/sites-enabled/
sudo certbot --nginx -d dispatch.scottcampbell.io -d dispatch-api.scottcampbell.io
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Smoke test

```bash
curl https://dispatch-api.scottcampbell.io/health        # {"status":"ok"}
curl https://dispatch-api.scottcampbell.io/api/system     # counts + solver
# Open https://dispatch.scottcampbell.io, click Optimize Schedule.
```

## Updating

```bash
cd /opt/dispatch && git pull
.venv/bin/pip install -e .
cd frontend && npm ci && NEXT_PUBLIC_API_BASE=https://dispatch-api.scottcampbell.io npm run build
sudo systemctl restart dispatch-api dispatch-web
```

## Notes

- The seed is idempotent: existing data is left untouched. To rebuild the
  canonical day, run the generator with `--reset`.
- The optimizer solve time is bounded (`max_solve_seconds`, default 8s, capped at
  30s by the API), so requests always return.
