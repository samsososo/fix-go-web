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

師傅月費固定為 HK$100，每月收取一次；首次成功綁卡後享有 1 個月
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

## 一次性建立 Production 管理員

Production 不可開啟 demo seeding。首次公開前，在 Mac repo 建立一個不會上傳到
VPS、亦已被 Git ignore 的 `.env.production.admin`：

```dotenv
PRODUCTION_ADMIN_1_FULL_NAME=<第一位管理員姓名>
PRODUCTION_ADMIN_1_EMAIL=<第一位管理員登入電郵>
PRODUCTION_ADMIN_1_PASSWORD=<第一位管理員密碼，最少 8 個字元>
PRODUCTION_ADMIN_2_FULL_NAME=<第二位管理員姓名>
PRODUCTION_ADMIN_2_EMAIL=<第二位管理員登入電郵>
PRODUCTION_ADMIN_2_PASSWORD=<第二位管理員密碼，最少 8 個字元>
```

管理員只以電郵登入，不需要電話。`PRODUCTION_ADMIN_1_PHONE` 及
`PRODUCTION_ADMIN_2_PHONE` 應省略；管理員密碼復原由受控管理流程處理。
客戶及師傅仍按一般規則提供香港手提電話。

先經 SSH tunnel 連接 MongoDB，再執行 dry run：

```bash
PRODUCTION_ADMIN_DRY_RUN=true npm run db:provision-admin
```

確認輸出包含 `"readyToProvision":true` 後，才正式建立：

```bash
npm run db:provision-admin
```

Script 只容許 `NODE_ENV=production`、production database、demo／seeding 關閉、
兩組不同而且並非範例的管理員登入資料，並只會在尚未有任何正式帳戶或工作
資料時執行。兩個密碼只會由 `.env.production.admin` 讀取，不會印在 terminal。
兩個 account 會以同一批操作建立；任何一步失敗均會刪除今次新增資料。成功後
再次執行會因資料庫已非空而停止。

## 既有 Production 管理員改用電郵識別

既有 PROD 不可重跑首次建立管理員的 bootstrap。使用
`db:migrate-admin-email-only` 將 `.env.production.admin` 內兩個電郵對應的
現有管理員改為只用電郵識別。先經 SSH tunnel 連接 MongoDB，核對目標為
`hotfix_prod`，再執行只輸出數量的 dry run：

```bash
PRODUCTION_ADMIN_DRY_RUN=true npm run db:migrate-admin-email-only
```

核對 dry run 結果後套用：

```bash
npm run db:migrate-admin-email-only
```

Script 驗證 PROD 目標、seeding 關閉，以及兩個電郵各自對應一個有效管理員
和登入 credential。遷移將管理員電話索引改為 unique+sparse，只移除該兩個
管理員的電話及電話驗證欄位，並記錄 migration metadata；重跑不會新增帳戶。
姓名、電郵、密碼、權限、sessions、客戶／師傅資料及訂閱保持不變，也不複製
DEV 帳戶。完成後核對管理員電郵登入；聯絡資料與 credentials
不得輸出到 terminal、logs 或對話。

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
