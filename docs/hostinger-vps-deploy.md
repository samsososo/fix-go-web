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

師傅套餐由 2026-10-17 起為 HK$200／1 個月、HK$498／3 個月、HK$898／6 個月及 HK$1,398／12 個月，每期收取全額；首次成功綁卡後享有一次 14 日免費試用。已在試用或有效訂閱的師傅於下一個原定收費點轉用新價，不即時扣款或收取按比例差額，並保留原有試用及帳單週期。DEV 使用 Stripe sandbox，Production 使用 Stripe live mode，兩邊的
Price ID、secret key 及 webhook signing secret 必須分開。

原有無版本後綴的四個 Price ID 環境變數必須繼續指向舊價，作現有訂閱及 webhook 相容；新價分別使用 `STRIPE_PRO_MONTHLY_V2_PRICE_ID`、`STRIPE_PRO_3_MONTHS_V2_PRICE_ID`、`STRIPE_PRO_6_MONTHS_V2_PRICE_ID` 及 `STRIPE_PRO_12_MONTHS_V2_PRICE_ID`。不得將舊變數直接改指向新價。

### 2026-10-17 加價 migration runbook

Migration 預設只做 dry-run；`SUBSCRIPTION_PRICING_APPLY=true` 只可作為單次 command prefix，切勿寫入任何 `.env`。先確認八個 Stripe Prices 均為 active、同週期嘅 v1／v2 Price 屬於同一 Product，並保留舊 Prices 供歷史 webhook 使用。

1. 先備份 `proSubscriptions` 及安排短暫 billing maintenance window，確認沒有未完成 checkout、欠費或期末取消中的待遷移訂閱。
2. 部署同時支援 v1 lifecycle 及 v2 新售價的 application code。
3. 在 DEV 依次執行：

   ```bash
   npm run db:migrate-subscription-pricing:dev
   SUBSCRIPTION_PRICING_APPLY=true npm run db:migrate-subscription-pricing:dev
   npm run db:migrate-subscription-pricing:dev
   ```

4. DEV 驗證通過後，在 Production 依次執行：

   ```bash
   npm run db:migrate-subscription-pricing:production
   SUBSCRIPTION_PRICING_APPLY=true npm run db:migrate-subscription-pricing:production
   npm run db:migrate-subscription-pricing:production
   ```

5. 第二次 dry-run 必須顯示所有可遷移紀錄已是 target；另外在 Stripe 核對現有訂閱下一張 invoice 為新價、沒有 proration，原有 trial end、billing cycle anchor 及 current period 不變。

Script 只容許單向 v1→v2，並以 `pro-pricing-v2-2026-10-17` marker 識別遷移 cohort；不可用通用 v2→v1 command，以免誤降加價後建立的新訂閱。任何 apply／post-verify 失敗都要立即停止，保留新舊 Prices 及已部署的雙版本相容 code，先檢查 marker、MongoDB 備份及 Stripe 狀態。如果 Stripe 已轉新價但 MongoDB 仍是舊價，而且 remote status、trial 及 period 尚未改變，可重跑同一 v2 migration 作冪等 recovery；如果 lifecycle 已前進或已發生扣款／取消，必須按 marker cohort 人手核對 Stripe invoice、status、period 及 MongoDB entitlement 後才修復，不得盲目重跑或未核對 cohort 就批量回復舊價。

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
