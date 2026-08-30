# Hostinger VPS Deploy

This app is ready to run on a Hostinger VPS with Docker, Caddy, and the private
self-hosted MongoDB service described in
[`self-hosted-mongodb.zh-HK.md`](self-hosted-mongodb.zh-HK.md).

## Server Requirements

- Hostinger VPS with Ubuntu
- Docker Engine
- Docker Compose plugin
- Domain A record pointed to the VPS public IP
- The `hotfix24-data` Docker network and MongoDB service must be running

## One-Time VPS Setup

Install Docker:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in after adding your user to the Docker group.

Open firewall ports:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

## App Setup

Create `.env.production` on the VPS from `.env.production.example` and fill in real values:

```bash
cp .env.production.example .env.production
nano .env.production
```

Required values:

```bash
DOMAIN=your-domain.com
APP_URL=https://your-domain.com
MONGODB_URI=mongodb://hotfix_prod_app:...@127.0.0.1:27018/hotfix_prod?authSource=hotfix_prod&directConnection=true
MONGODB_DATABASE=hotfix_prod
ENABLE_DEMO_LOGIN=false
ENABLE_DATABASE_SEEDING=false
TWILIO_API_KEY=SK...
TWILIO_API_SECRET=...
TWILIO_VERIFY_SERVICE_SID=VA...
DEMO_PASSWORD=strong-random-password
BOOTSTRAP_ADMIN_PASSWORD=strong-random-password
```

The checked-in Compose file also requires an ignored
`.env.mongodb.production` file on the VPS. It contains only the private Docker
connection override, using `hotfix24-mongo:27017`; see the MongoDB operations
document. This keeps the local `.env.production` usable through an SSH tunnel
without exposing MongoDB publicly.

The Twilio values must be the production Verify Service and its Restricted API
key. Never put the Client secret in Git, deployment logs, chat, or MongoDB.
Before the first live OTP test, set the production database's
`feature:smsVerification` document `provider` to `twilio_verify` while leaving
`enabled: false`. The database `enabled` field is the rollout switch for the
environment connected to that database.

Deploy:

```bash
docker compose -f docker-compose.hostinger.yml up -d --build
```

Check status:

```bash
docker compose -f docker-compose.hostinger.yml ps
docker compose -f docker-compose.hostinger.yml logs -f web
```

Health check:

```bash
curl -fsS https://your-domain.com/api/health
```

## Updates

Pull the latest code and rebuild:

```bash
git pull
docker compose -f docker-compose.hostinger.yml up -d --build
docker image prune -f
```

## MongoDB Notes

- Never expose VPS port `27017` publicly. It must remain bound to
  `127.0.0.1` only.
- DEV and PROD use separate databases and separate least-privilege users.
- Keep the retired managed databases until the migration has been verified and
  the rollback window has passed.
- Follow the backup, restore and MongoDB Compass procedures in
  [`self-hosted-mongodb.zh-HK.md`](self-hosted-mongodb.zh-HK.md).
