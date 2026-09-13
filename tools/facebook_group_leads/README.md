# 每日香港工作帖檢視及同步

使用者於 2026-09-13 授權每日執行：檢視既有香港群組，篩選工作需求，
先匯入 DEV，再把合資格外部快照同步到 PROD。執行前閱讀根目錄
`AGENTS.md`、商業規則及兩份 Facebook workflow／runbook。

## 每次執行

1. 使用 `sources.json` 中 `enabled: true` 的來源。共有 24 個；另一個來源
   已因台灣內容停用。沒有額外授權，不新增來源或加入更多群組。
2. 透過現有 Chrome Facebook 登入及支援的瀏覽器工具，有限度檢視可見帖文。
   每組最多 8 個來源帖；可在 UI 選新帖排序，並展開已見候選及核對原帖連結。
   不作無限捲動、背景 endpoint 擷取、cookie/token 提取或存取權繞過。
   登入失效、驗證碼、checkpoint、封鎖或權限問題須停止並報告。
3. 逐帖保留香港搵師傅、招聘、判頭合作、安裝／維修／工程詢價需求。
   缺少地區可按香港來源語境暫定 `source_context`，顯示
   「香港（地區未提供）」；明確香港地點使用 `post_text`。
   排除海外、服務／產品廣告、自薦求職、純討論及已截止／取消／搵到人需求。
   不以留言自薦當成發帖者需求，核對自動翻譯有歧義的原文。
4. 擷取時即遮蔽電話及電郵，再人工檢視候選；不把聯絡值輸出到對話、logs 或 Git。
   原文日期未確認維持未知；不得用擷取日期聲稱帖文新近或屬於固定日數窗口。
5. 在 owner-only、Git ignored 的 `data/private-runs/<本次 run>/` 保存
   候選 JSON、來源及數量審核結果。候選必須使用以下欄位：

   ```json
   {
     "reviewedAt": "<實際完成逐帖分析的 UTC ISO 時間>",
     "candidates": [
       {
         "sourceUrl": "<sources.json 的完整 URL>",
         "postId": "<原帖 ID，未知則 null>",
         "author": "<缺少 postId 時必填；僅用於穩定 hash>",
         "capturedAt": "<實際擷取 UTC ISO 時間>",
         "body": "<已遮蔽的原帖正文，不含留言>",
         "title": "<忠於原帖的工作標題>",
         "displayLocation": "香港（地區未提供）",
         "regionEvidence": "source_context",
         "intent": "service_request",
         "categoryId": "renovation",
         "truncated": false
       }
     ]
   }
   ```

   `intent` 可為 `service_request` 或 `recruitment`；工種可為
   `plumbing`、`electrical`、`aircon`、`renovation` 或 `cleaning`。
   不猜測聯絡、地址、價錢或發帖日期。去重跨群組交叉帖；未知身份如實保留。

6. 在 repository 根目錄執行 self-test，然後預演。檢查數量及目標正確才 apply：

   ```sh
   node node_modules/tsx/dist/cli.mjs tools/facebook_group_leads/sync.ts --self-test
   node node_modules/tsx/dist/cli.mjs tools/facebook_group_leads/sync.ts --input data/private-runs/<run>/candidates.json --run-dir data/private-runs/<run>
   node node_modules/tsx/dist/cli.mjs tools/facebook_group_leads/sync.ts --input data/private-runs/<run>/candidates.json --run-dir data/private-runs/<run> --apply
   ```

   再跑同一預演，確認 DEV／PROD 均零新增。沒有新候選時，可省略 `--input`，
   只檢查及補同步 DEV 的合資格資料。不得同時執行兩次 apply。

7. 保存每組檢視數、候選／重複／排除數、新增數及兩邊可見總數。
   所有需求維持 `pending_human_review`，不能聲稱人工審批完成。

## 資料庫範圍

指令使用本機 `.env.dev`／`.env.production` 現有設定，驗證 URI、database
及 authSource 分別對應 `hotfix_dev`／`hotfix_prod`。若現有 SSH tunnel 不通，
先檢查既有 `hotfix24-vps` 連線設定；不要顯示 credentials。

只寫 `externalFacebookGroupSnapshots`。先預備兩邊計劃及受限備份，
DEV 驗證通過才寫 PROD。只補新增，保留原始來源、hash、待核實、保存及刪除狀態；
不覆寫既有紀錄、不恢復已刪除來源、不設定或延長保存期限。
既有 identity 衝突須停止；同原帖或正文重複則跳過。人工核對已存在帖文的
內容／有效狀態改變時，另行報告，不在這個 insert-only 同步中改寫。

不建立正式工作單、quote、booking、通知或對外訊息，不改師傅訂閱權限。
新候選聯絡遮蔽；已授權展示的舊 DEV 快照按目前內容同步，不重新擷取聯絡資料。
這是排程啟動的瀏覽器檢視工作，並非 server 上獨立運作的 Facebook scraper。
