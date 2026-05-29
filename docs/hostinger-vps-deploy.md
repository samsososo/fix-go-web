# Hostinger VPS Deploy

This app is ready to run on a Hostinger VPS with Docker, Caddy, and an external MongoDB database.

## Server Requirements

- Hostinger VPS with Ubuntu
- Docker Engine
- Docker Compose plugin
- Domain A record pointed to the VPS public IP
- MongoDB Atlas or another external MongoDB server

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
STORAGE_DRIVER=mongodb
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=hotfix_prod
ENABLE_DEMO_LOGIN=false
ENABLE_DATABASE_SEEDING=false
DEMO_PASSWORD=strong-random-password
BOOTSTRAP_ADMIN_PASSWORD=strong-random-password
```

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

## MongoDB Atlas Notes

- Add the Hostinger VPS public IP in MongoDB Atlas Network Access.
- Use a dedicated database user for this app.
- Keep production data in a separate database from development data.
