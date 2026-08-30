# 快修24 自建 MongoDB 操作手冊

最後更新：2026-08-30

## 架構

MongoDB 以官方 `mongo:8.0` Docker image 運行於 Hostinger VPS：

- VPS：`76.13.212.102`
- Container：`hotfix24-mongo`
- Docker network：`hotfix24-data`
- Persistent volume：`hotfix24_mongodb_data`
- Host listener：只綁定 `127.0.0.1:27017`
- DEV database／user：`hotfix_dev`／`hotfix_dev_app`
- PROD database／user：`hotfix_prod`／`hotfix_prod_app`
- WiredTiger cache：1 GB，為同一部 4 GB VPS 上的 web services 預留記憶體

DEV 與 PROD 共用同一個 MongoDB process，但 database、application user 及
password 完全分開。Application users 只擁有所屬 database 的 `readWrite`
權限，不能讀取另一個環境。

## Secrets 放置位置

以下檔案全部必須保持 `600` 權限，而且不會提交到 Git：

- VPS `/root/hotfix24-mongodb/.env.mongodb`：MongoDB root bootstrap credentials
- VPS `/root/hotfix24-mongodb/app-credentials.env`：DEV／PROD application passwords
- VPS `/root/fix-go-web/.env.mongodb.dev`：DEV Docker connection override
- VPS `/root/fix-go-web/.env.mongodb.production`：PROD Docker connection override
- Mac repo `.env.dev`：經 SSH tunnel 使用的 DEV connection string
- Mac repo `.env.production`：經 SSH tunnel 使用的 PROD connection string

切勿將以上內容貼入 Git、ticket、chat、screenshots 或 command logs。

## 啟動及檢查 MongoDB

在 VPS 執行：

```bash
cd /root/hotfix24-mongodb
docker compose -f docker-compose.mongodb.yml up -d
docker compose -f docker-compose.mongodb.yml ps
docker inspect --format '{{.State.Health.Status}}' hotfix24-mongo
```

檢查 MongoDB 只在 localhost 監聽：

```bash
ss -lntp | grep 27017
```

預期只會看到 `127.0.0.1:27017`，不應看到 `0.0.0.0:27017` 或
`[::]:27017`。

## Mac SSH 存取

專用 private key 位於：

```text
~/.ssh/hotfix24_vps_ed25519
```

測試 SSH：

```bash
ssh hotfix24-vps 'hostname'
```

如果沒有使用 SSH config，完整寫法是：

```bash
ssh -i ~/.ssh/hotfix24_vps_ed25519 root@76.13.212.102
```

## 開 SSH tunnel

開一個 Terminal 並保持以下 command 運行：

```bash
ssh -N -L 27018:127.0.0.1:27017 hotfix24-vps
```

MongoDB 仍然沒有公開到 Internet；Mac 的 `127.0.0.1:27018` 只會經加密
SSH 連到 VPS 的 `127.0.0.1:27017`。

確認 tunnel：

```bash
lsof -nP -iTCP:27018 -sTCP:LISTEN
```

停止 tunnel：在運行 tunnel 的 Terminal 按 `Control-C`。

## MongoDB Compass／GUI

1. 先開啟上述 SSH tunnel。
2. 在 MongoDB Compass 選擇 `New connection`。
3. DEV 直接複製 Mac repo `.env.dev` 內的 `MONGODB_URI` 值。
4. PROD 直接複製 Mac repo `.env.production` 內的 `MONGODB_URI` 值。
5. DEV 應只看到／修改 `hotfix_dev`；PROD user 應只看到／修改
   `hotfix_prod`。
6. 不要將 connection string 儲存在會同步或分享的文件。

兩個 local connection strings 都使用 `127.0.0.1:27018`、指定自己的
`authSource`，並加入 `directConnection=true`。

## Local development

先開 tunnel，再啟動 app：

```bash
ssh -N -L 27018:127.0.0.1:27017 hotfix24-vps
```

另一個 Terminal：

```bash
npm run dev
```

如果 tunnel 未開，local app 會出現 MongoDB server selection／connection
refused 錯誤，這是預期的 fail-closed 行為。

## VPS application connection

VPS 的 Compose files 會將 web container 同時加入 `hotfix24-data` network，
並透過以下 ignored override files 連線：

- `.env.mongodb.dev`
- `.env.mongodb.production`

VPS connection host 必須是 `hotfix24-mongo:27017`，不能使用
`127.0.0.1:27018`。後者只屬於 Mac SSH tunnel。

## 每日備份

`scripts/backup-mongodb.sh` 每次會備份 DEV 及 PROD，預設備份到：

```text
/root/hotfix24-mongodb/backups
```

檔名包括 UTC timestamp，預設保留 7 日。檢查 cron 及最新備份：

```bash
cat /etc/cron.d/hotfix24-mongodb-backup
ls -lh /root/hotfix24-mongodb/backups
```

手動測試：

```bash
/root/hotfix24-mongodb/backup-mongodb.sh
```

這些備份仍在同一部 VPS，只能應付誤刪或 container／volume 問題。Hostinger
weekly backup 是第二層保護，但正式上線後仍應加入另一個 provider 的加密
off-site backup。

## Restore 演練

Restore 會寫入資料；執行前必須再次確認 target database 及 archive。不要在
未驗證 archive 的情況下對 PROD 使用 `--drop`。

列出 archive 內容：

```bash
docker exec -i hotfix24-mongo sh -c '
  exec mongorestore \
    --quiet \
    --host 127.0.0.1 \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --archive \
    --gzip \
    --dryRun
' < /root/hotfix24-mongodb/backups/<archive>
```

建議先 restore 到臨時 database 作驗證，再決定是否切換正式資料。

## Migration rollback

在確認以下項目前，不要刪除舊 managed MongoDB：

- DEV／PROD collection names 及 document counts 與搬遷前一致
- Local app 能經 tunnel 登入及讀取 DEV
- VPS app health check 正常
- DEV app 的新增／更新資料確實寫入新 VPS MongoDB
- PROD config 保持 `feature:smsVerification.enabled: false`
- 每日備份已成功產生非空 archive

如果新 MongoDB 有問題，將相應 `.env` 的 `MONGODB_URI` 改回舊 managed
MongoDB connection string並重啟 web container，即可 rollback；舊 DB 在
rollback window 內必須保持未刪除。

## 常用檢查

```bash
docker ps --filter name=hotfix24-mongo
docker logs --tail 100 hotfix24-mongo
docker stats --no-stream hotfix24-mongo
docker network inspect hotfix24-data
docker volume inspect hotfix24_mongodb_data
```

不要在 support 訊息中貼出 `docker inspect` 的完整 environment，因為當中有
MongoDB root password。
