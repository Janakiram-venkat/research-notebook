# Deploying Research Notebook on AWS

The simplest setup that is safe: **one small server (EC2 or Lightsail) running the Docker container, with Caddy in front for HTTPS**.
The notebook uses SQLite, which suits one server and a few hundred users. Do not run several copies of the container: each would have
its own database and its own rate limits. If you outgrow one box, the next step is moving `app/db.py` to Postgres (RDS); that is a code change, not a config change.

The AI assistant is optional at launch: with no `ANTHROPIC_API_KEY` the app works fully and the assistant says it is not set up yet.
Add the key later and restart.

## 1. Create the server
- **Lightsail** (easiest): Linux instance, Ubuntu 24.04, 1 GB RAM is enough. Attach a static IP.
- **EC2**: `t4g.small` or `t3.small`, Ubuntu 24.04, a 20 GB gp3 volume. Attach an Elastic IP.
- Security group / firewall: allow **80 and 443** from anywhere, **22** only from your own IP. Do not open 8000.

## 2. Point a domain at it
Create an `A` record (Route 53 or your registrar) for e.g. `notes.example.com` pointing to the server's static IP. Wait until it resolves.

## 3. Install Docker and get the code
```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER   # log out and back in
git clone <your repo url> research-notebook && cd research-notebook
```

## 4. Configure
```bash
cp backend/.env.example backend/.env
nano backend/.env
```
Set at least:
```
NB_AUTH_MODE=accounts
NB_SECRET_KEY=<output of: openssl rand -hex 32>
NB_CORS_ORIGINS=https://notes.example.com
# Later, when you add the AI:
# ANTHROPIC_API_KEY=sk-ant-...
# NB_AGENT_DAILY_CALLS=30
```
`backend/.env` is git-ignored. Keep it out of the repo and out of the image.
(To keep the key out of a file on disk, store it in AWS Secrets Manager or SSM Parameter Store and write `.env` from it at start-up.)

## 5. Start it
```bash
export DOMAIN=notes.example.com
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Caddy fetches the HTTPS certificate on first start. Open `https://notes.example.com`, create the first account (it also receives any notes that existed before accounts), then, if you want a closed group, set `NB_ALLOW_REGISTRATION=0` in `.env` and run the same `up -d` again.

## 6. Add the AI later
1. Put `ANTHROPIC_API_KEY=...` in `backend/.env`.
2. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` (recreates the container with the new value).
3. `curl https://notes.example.com/api/health` should now show `"ai": true`.

Watch the cost: each user gets `NB_AGENT_DAILY_CALLS` requests a day (default 50); every request can make several model calls. Set an
AWS/Anthropic spend limit as well.

## 7. Backups (do this before inviting anyone)
The database is in the Docker volume `nbdata`. Make a consistent copy while the app runs, and send it off the server:
```bash
# one-off
docker compose exec notebook python scripts/backup.py /data/backup.db
docker compose cp notebook:/data/backup.db ./backup-$(date +%F).db
# nightly to S3 (needs an instance role or credentials with PutObject on one bucket)
aws s3 cp ./backup-$(date +%F).db s3://YOUR-BUCKET/notebook/
```
Put these in a cron job. Restore by stopping the container and copying the file back to `/data/notebook.db` in the volume. Also enable EBS snapshots (AWS Backup or Data Lifecycle Manager).

## 8. Updating
```bash
git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
The database upgrades itself on start. Take a backup first.

## Checklist before opening it to the public
- [ ] HTTPS works, and http redirects to https
- [ ] `NB_SECRET_KEY` set (changing it later signs everyone out)
- [ ] Port 8000 and 22 not open to the world
- [ ] Backups tested by restoring one
- [ ] Spend limit set; `NB_AGENT_DAILY_CALLS` chosen
- [ ] A privacy notice and terms of your own: notes the assistant reads are sent to Anthropic; there is no password reset or email verification yet
- [ ] Monitoring: an uptime check on `/api/health` (Route 53 health check, UptimeRobot) and CloudWatch or `docker compose logs` for errors

## Alternatives
- **ECS Fargate + EFS**: works, but SQLite on EFS is slow and locking can misbehave; prefer Postgres on RDS if you want Fargate.
- **App Runner**: its disk is ephemeral, so SQLite data would be lost on every deploy. Not suitable without moving to RDS.
