# Hostinger VPS：DEV／Production 分場部署

快修24在同一部 VPS 運行兩個完全獨立的 Next.js service，再由單一 Caddy
按 hostname 分流：

| 環境       | 網址                       | Env file          | MongoDB       | Docker service |
| ---------- | -------------------------- | ----------------- | ------------- | -------------- |
| DEV        | `https://dev.hotfix24.com` | `.env.dev`        | `hotfix_dev`  | `web-dev`      |
| Production | `https://hotfix24.com`     | `.env.production` | `hotfix_prod` | `web-prod`     |

兩個 app container 不共用環境變數、session 或資料庫。Caddy 是唯一對外佔用
80／443 的 service，並繼續代理同一 VPS 上的 Wonderwall 網站。

## 收費基準

師傅月費固定為 HK$100，每月收取一次；首次成功綁卡後享有 3 個香港日曆月
免費試用。DEV 使用 Stripe sandbox，Production 使用 Stripe live mode，兩邊的
Price ID、secret key 及 webhook signing secret 必須分開。

## DNS

在 Hostinger DNS Zone 建立／確認以下 A records：

| Type | Name  | Points to       |
| ---- | ----- | --------------- |
| A    | `@`   | `76.13.212.102` |
| A    | `dev` | `76.13.212.102` |

`www` 可使用 CNAME 指向 `hotfix24.com`；Caddy 會永久 redirect 到 apex domain。
DNS 生效前，Caddy 無法為 `dev.hotfix24.com` 取得 TLS certificate。

## VPS 前置要求

- Ubuntu、Docker Engine 及 Docker Compose plugin
- Firewall 開放 22、80/tcp、443/tcp 及 443/udp
- 外部 Docker network `hotfix24-data`
- `hotfix24-mongo` 正在該 network 運行
- Repo 位於 `/root/fix-go-web`

MongoDB 詳情見
[`self-hosted-mongodb.zh-HK.md`](self-hosted-mongodb.zh-HK.md)。MongoDB 的
27017 只可綁定 VPS `127.0.0.1`，不得公開到 Internet。

## Environment files

本機及 VPS 均需要以下 ignored files：

- `.env.dev`：`DOMAIN=dev.hotfix24.com`、`APP_URL=https://dev.hotfix24.com`、
  DEV MongoDB／Twilio／Stripe credentials。
- `.env.production`：`DOMAIN=hotfix24.com`、`APP_URL=https://hotfix24.com`、
  Production MongoDB／Twilio／Stripe credentials。
- `.env.mongodb.dev`：DEV container 連接 `hotfix24-mongo:27017` 的 private override。
- `.env.mongodb.production`：Production container 的 private MongoDB override。

Env files 必須是 mode `600`，不得提交到 Git、貼到 chat 或寫入 logs。

Local `npm run dev -- -p 3001` 仍會讀取 `.env.dev` 的 DEV database／service
credentials，但 script 會將 `APP_URL` 暫時 override 成
`http://localhost:3001`，避免 browser callback 跳去 DEV domain。

## 首次分場部署

在 repo 已包含最新分場 Compose/Caddy 設定，而且兩份 env files 已放到 VPS 後：

```bash
cd /root/fix-go-web
docker compose -f docker-compose.hostinger.yml config --quiet
docker compose -f docker-compose.hostinger.yml up -d --build --remove-orphans
docker compose -f docker-compose.hostinger.yml exec -T caddy \
  caddy validate --config /etc/caddy/Caddyfile
```

檢查兩個 app 及 Caddy：

```bash
docker compose -f docker-compose.hostinger.yml ps
curl -fsS https://hotfix24.com/api/health
curl -fsS https://dev.hotfix24.com/api/health
```

核對 container 所用 database，但不要輸出 connection string：

```bash
docker compose -f docker-compose.hostinger.yml exec -T web-dev \
  sh -lc 'printf "%s\n" "$MONGODB_DATABASE"'
docker compose -f docker-compose.hostinger.yml exec -T web-prod \
  sh -lc 'printf "%s\n" "$MONGODB_DATABASE"'
```

預期分別為 `hotfix_dev` 及 `hotfix_prod`。

## 日常部署

只更新 DEV，並安全上傳本機 `.env.dev`：

```bash
npm run deploy:dev
```

只更新 Production，並安全上傳本機 `.env.production`：

```bash
npm run deploy:production
```

兩個 scripts 都會原子替換遠端 env file、`git pull --ff-only`、只 rebuild
目標 app，再 validate 及 reload 共用 Caddy。任何一步失敗都會停止，不會聲稱部署
成功。

## Stripe 分場注意

- DEV webhook：`https://dev.hotfix24.com/api/stripe/webhook`
- Production webhook：`https://hotfix24.com/api/stripe/webhook`
- Stripe webhook 是訂閱狀態的主要依據。
- Production live credentials 未配置及真人付款流程未驗證前，不應開放正式師傅
  綁卡。

## SMS 分場注意

Local／DEV 連接 DEV DB；Production 連接 PROD DB。每個環境只由自己資料庫的
`feature:smsVerification.enabled` 控制 SMS rollout。Production credentials、
provider 及真人香港電話端到端測試完成前，PROD DB 必須保持 `enabled: false`。
