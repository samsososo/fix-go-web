# Facebook Group 香港工作線索資料流程

最後更新：2026-09-01

狀態：內部原型記錄；未取得 Meta 明確書面許可前，不得重複或擴展為 Facebook Group 自動收集

## 2026-09-05：獲授權保留 Page 聯絡資料

使用者已明確要求今次 DEV Page 匯入保留聯絡資料。Page 同步指令新增
`--preserve-contacts`：保留完整原帖於 `sourceMessage`，摘要亦保留聯絡途徑，
並標記 `redactionState: contacts_preserved`。未加選項仍維持遮蔽。
本例外優先於下文 Page／MongoDB staging 必須遮蔽的描述；不改變 Group
canonical 規則、待人工覆核狀態、禁止直接建立正式工作單、保存期限及
禁止將私人資料寫入 Git／logs／chat 的要求。原帖聯絡資料更新亦會觸發重新覆核。

## 目的

快修24要先建立足夠的香港工作供應，令師傅有持續使用平台的理由；但數量只可以在資料質素門檻之上增加。這個流程的目標是把外部可見的維修、裝修、水電及相關招聘帖整理成可人工覆核的工作線索，並輸出以下四欄：

1. `title`
2. `工作內容`
3. `聯絡方式`
4. `錢`（optional）

本流程不會把 Facebook 帖文直接當成快修24正式訂單，也不代表發帖人已同意接收推廣訊息。

## 兩條資料來源必須分開

| 資料來源                          | 可用方法                                                                                                                                                        | 現況                                                                                | 不可混淆的限制                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 由快修24帳戶管理的 Facebook Pages | 官方 Meta Graph API                                                                                                                                             | Repository 已有 [`tools/facebook_page_sync`](../tools/facebook_page_sync/README.md) | 只可讀取 token 擁有人獲授權管理的 Pages，不能用來讀 Groups                     |
| Facebook Groups                   | 預設由使用者人手瀏覽後提供 export／screenshots／明確 URLs，再由系統離線處理；任何 Playwright、bot 或 programmatic browser collection 都要先有 Meta 明確書面許可 | 今次兩個香港群組的 browser-assisted 資料只屬一次性本機原型記錄，不構成重跑授權      | Page API 不涵蓋 Groups；不得以「低量」或「有人監督」當成免除 Meta 自動收集條款 |
| 使用者提供的 CSV／JSON／Excel     | 離線清理及篩選                                                                                                                                                  | 只有保存 immutable input、來源時間及 hash 後才可重現                                | 必須保存來源識別及資料使用權限                                                 |

Page API 工具預設使用截至 2026-09-01 的 Graph API `v26.0`，亦可由環境或 CLI 明確指定版本。每次準備投入新環境前，仍必須先核對 Meta 當時支援的版本、permissions 及 App Review 要求，不能把任何預設版本當成永久規格。

Meta 已在 Graph API v19.0 changelog 公布移除 Groups API、`publish_to_groups` 及 `groups_access_member_info`，並由 2024-04-22 起套用至所有 API versions。因此截至本文件日期，沒有一般商業用途的官方 Graph API 路徑可以批量讀取任意公開或已加入 Group 的 posts；Page API 及 Page Public Content Access 都不是替代方案。

## 今次 Group 原型流程

```text
Facebook Group UI（今次一次性 browser-assisted prototype）
  → partial JSON + 只讀 screenshots
  → 14 日 normalize／dedupe／date OCR／redaction／QA
  → 7 日 strict lead filter
  → 人工逐帖覆核
  → 私人 Excel（四欄）
```

14 日來源窗提供日期校正及覆核緩衝；最終工作清單只保留以同一個 `source_generated_at` 為終點的精確 7×24 小時窗口。所有可比較時間應以 UTC 保存，香港顯示及人工理解則使用 `Asia/Hong_Kong`。

以上流程是今次 artifact 的 provenance，不是已批准的日常收集方案。後續如未有 Meta 明確書面許可，只可處理使用者人手取得並有權使用的輸入檔；不得由 agent 控制 browser 重跑 Group collection。

### 2026-08-15 單次 snapshot

以下數字只描述今次本機資料，不是長期 KPI 或 acceptance threshold：

| 階段／指標                         | 數量 |
| ---------------------------------- | ---: |
| partial input rows                 |  146 |
| finalized rows                     |  139 |
| 14 日內、日期已知                  |  121 |
| 日期未能確認、保留作 review        |   18 |
| 內容可能被截短                     |   68 |
| 缺少 permalink                     |   39 |
| 7 日內、日期已知（首兩個來源群組） |   75 |
| automatic strict candidates        |    5 |
| automatic candidates 有明確金額    |    3 |

今次私人 Excel 亦有 5 筆，但與 automatic strict candidates 不是同一批；根據今次人工重建的 source mapping，只有 2 個 `stable_id` 重疊。現有 `selected.json` 沒有 `stable_id` 或 source object，所以最終選擇不能由現有檔案完整重現。Excel 內 3 筆經原帖人工核對後補回公開 WhatsApp／電話，另外 2 筆未能驗證公開電話，所以只保留 Facebook 原帖留言／私訊連結。Group canonical JSON、CSV 及 SQLite 仍維持聯絡資料遮蔽。

## 資料層及用途

| 資料層                          | 內容                                                       | 可否含 raw 聯絡資料                                     | 是否可提交 Git             |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- | -------------------------- |
| Partial capture                 | 可見帖文、來源 metadata、截圖參照                          | 不應                                                    | 不可；位於 ignored `data/` |
| Finalized 14-day dataset        | Normalize、dedupe、日期、redaction、QA 後的 posts          | 不可；使用 `[PHONE]`／`[EMAIL]`                         | 不可；位於 ignored `data/` |
| 7-day intermediate              | Candidates、rejection reasons、audit signals               | 不可                                                    | 不可；位於 ignored `data/` |
| Selected export payload（現況） | 最終四欄資料及 selection note；沒有 per-row source lineage | 預設不可                                                | 不可；位於 ignored `data/` |
| Private Excel                   | 只供內部人工跟進的四欄輸出                                 | 只可包含原帖當時清楚公開、並經人工核對的聯絡資料        | 不可                       |
| Managed Page SQLite／CSV        | 官方 API 的 Page posts 及 aggregate engagement             | 會原樣保存 Page `message`，可能含聯絡資料；不保存 token | 不可                       |

`data/` 已由 repository `.gitignore` 排除。今次 Excel 只由目前工作站的 `.git/info/exclude` 排除，`outputs/` 並沒有 repository-wide ignore 規則；任何 agent 或開發者在 stage 前都必須再次執行 `git status`，不得提交 Excel、screenshots 或私人聯絡資料。

今次 partial capture 仍偵測到 contact-like raw values，而 source screenshots 亦可能顯示姓名及電話；不能只相信檔案內的 privacy metadata。現有 `data/` 目錄及私人 Excel 使用工作站預設檔案權限，未構成多使用者環境下的 access control。搬到 server、共享磁碟或 CI 前，必須改用受限目錄及檔案權限。

## Canonical Group post contract

Normalized post 的最低 audit fields 是：

| 欄位                                                 | 用途                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `stable_id`                                          | Dedupe、人工覆核及 contact enrichment 的唯一對應鍵                                                  |
| `group_id`, `group_name`                             | 驗證來源是否在明確 allowlist                                                                        |
| `post_id`, `synthetic_id`                            | 可用的來源 identity；兩者皆缺時，`stable_id` 由 group、author 及 message 的 deterministic hash 產生 |
| `permalink`                                          | 回到原帖覆核；缺少時必須標記                                                                        |
| `date_label`, `estimated_created_time`               | 原畫面日期及可比較 UTC 時間                                                                         |
| `date_precision`, `date_source`, `needs_date_review` | 日期可信度及來源                                                                                    |
| `message`, `media_description`, `message_truncated`  | 帖文內容及完整度                                                                                    |
| `contact_redacted`, `contact_types`                  | 只描述聯絡方式類型，不保存 canonical raw value                                                      |
| `captured_at`, `source`                              | Capture provenance                                                                                  |
| `in_window_status`                                   | Finalized retained rows 為 `in_window` 或 `unknown`；`out_of_window` 只在中途分類後被移除           |

相同 `stable_id` 或相同 `group_id + post_id` 不得在同一個 finalized dataset 重複出現。Synthetic identity 只可由穩定的來源欄位產生，不可用 list index。

## 最終 lead contract

| 欄位       | 必須 | 規則                                                                        |
| ---------- | ---- | --------------------------------------------------------------------------- |
| `title`    | 是   | 一行、簡短、忠於原帖；優先包含地區、工種及「搵師傅／招聘／工作」意圖        |
| `工作內容` | 是   | 保留具體工種、地點、工期、時間、資格及工作範圍；不得補作推測                |
| `聯絡方式` | 是   | 可為公開電話／WhatsApp、原帖明示的 PM／留言，或可用原帖 permalink；不得猜測 |
| `錢`       | 否   | 只保留明確價錢、預算、日薪、時薪或月薪；「報價」、「幾錢」不算金額          |

如果 Facebook 帖文沒有獨立 title，可以由內容生成描述性標題，但不得把模型推測當成帖文事實。

## 入選規則

每筆 lead 必須同時符合：

- 日期明確在指定 7 日窗口內；日期未知不進最終清單。
- 來源群組在本次明確批准的 allowlist。
- 有明確需求意圖：客戶搵師傅、工種招聘，或具工作時間／地點／薪酬的結構化工作。
- 有具體工種或可執行工作內容。
- 目前 deterministic classifier 會先移除 URL、聯絡 placeholder 及標點，再要求最少 8 個 substantive characters；這只是最低機械檢查，不能取代人工判斷。
- 有可用聯絡途徑；若帖文沒有直接聯絡資料，只有仍可開啟的原帖 permalink 才可作人工留言／私訊入口。
- 內容足以讓人工判斷工作，不以圖片或被截斷句子作無根據推測。

## 排除規則

以下內容必須排除：

- 求職者自行搵工，而不是工作需求或招聘。
- 課程、培訓、招生或考牌班。
- 物料、工具、二手貨或供應商銷售。
- 樓盤租售或一般地產廣告。
- 只有「承接工程／歡迎查詢／免費報價」的服務廣告，沒有具體客戶需求或招聘。
- 新聞、完工展示、一般討論及無明確工作意圖的帖文。
- 日期未知、超出窗口、來源不明或重複的帖文。
- 缺少具體工作內容、工種或可用聯絡方法的帖文。

邊界情況一律由人工覆核；原帖截斷而無法展開、日期矛盾或多個聯絡候選無法對應時，不應勉強入選。

## Data quality gates

### Hard gates

- 必填欄空值：`0`
- 重複 `stable_id`：`0`
- 重複 `group_id + post_id`：`0`
- Group canonical datasets 的已支援電話／電郵 pattern leakage：`0`，並另做較廣 privacy scan 及人工 spot check。
- Logs、terminal summaries、docs 及 commits 的 raw 電話／電郵外洩：`0`
- 最終 7 日清單內的日期未知或超出窗口：`0`
- 未在 allowlist 的 group：`0`
- 推測出來的價錢或聯絡資料：`0`

### 每次 run 要報告、但暫未設固定門檻的 metrics

- 每個 group 的 captured posts、7-day in-window posts 及 candidates。
- `message_truncated` rate。
- `missing_permalink` rate。
- `needs_date_review`／unknown-date rate。
- 有可用聯絡方法及有明確金額的比例。
- 排除原因分布。
- 人工覆核後的 false-positive count。

原型階段的最終 candidates 應由使用者或獲授權人工 reviewer 100% 覆核及 sign-off；AI 自行檢查不能聲稱已完成人工覆核。等有足夠人工標籤後，才設定 precision／recall 或自動發布門檻。

## 聯絡資料及私隱

- 公開可見不等於可以任意重用。香港私隱專員公署指出，從公開領域取得個人資料時仍要考慮原本公開目的、使用限制及資料當事人的合理私隱期望。
- Group canonical processing 預設以 `[PHONE]` 及 `[EMAIL]` 取代 raw value；只保留 `contact_types`。Managed Page sync 的原始 `message` 例外地可能含聯絡資料，所以整份 Page output 要當 restricted source，而不是已遮蔽的 lead dataset。
- Partial capture、source screenshots 及 OCR inputs 一律視為 restricted data，即使 metadata 聲稱已遮蔽亦要重新掃描。
- Raw contact enrichment 必須用 `stable_id` 對應原帖或保存的只讀 screenshot，並只可抄錄當時清楚公開的內容。不得還原被 Facebook 或作者隱藏的資料。
- Raw contact 只可存在於受限的私人 deliverable 及完成 export 所需的短暫 ignored working file。驗證後要刪除 working mapping、OCR text 及 inspect dump。
- 不可在 stdout、structured logs、chat、文件、commit message、issue 或 PR 顯示 raw contact。
- 本流程只建立人工 review queue，不會自動發 WhatsApp、短訊、電郵、PM 或電話。公開電話不等於已同意 direct marketing；任何 outbound promotion 必須先完成香港私隱及 direct-marketing 合規評估。
- 如收到刪除／退出要求、原帖刪除，或資料已不再需要，應停止使用並按已批准 retention policy 刪除相關資料。

官方參考：

- [PCPD：Guidance on Use of Personal Data Obtained from the Public Domain](https://www.pcpd.org.hk/english/resources_centre/publications/guidance/files/GN_public_domain_e.pdf)
- [PCPD：Personal Data (Privacy) Ordinance overview](https://www.pcpd.org.hk/english/data_privacy_law/ordinance_at_a_Glance/ordinance.html)
- [Meta Automated Data Collection Terms](https://www.facebook.com/legal/automated_data_collection_terms)
- [Facebook Help Center：Data scraping](https://www.facebook.com/help/463983701520800)
- [Meta Graph API v19.0 changelog：Groups API removal](https://developers.facebook.com/docs/graph-api/changelog/version19.0/)
- [Meta Platform Terms](https://developers.facebook.com/terms/)
- [Meta Developer Policies](https://developers.facebook.com/devpolicy/)

本節是工程及操作風險控制，不是法律意見。

## 與快修24產品資料的界線

Facebook lead 是外部、未驗證線索，不能直接建立現有 `ServiceRequest`、quote 或 booking：

- 現有 `ServiceRequest` 需要平台 customer、地址、分類、狀態及其他正式欄位。
- 外部發帖人的 Facebook contact 不等於已驗證的快修24 customer phone。
- 不得用 Meta Platform Data 判斷某人是否合資格受聘、是否應獲聘用，或決定其聘用條款；如日後的 matching 會影響 employment decision，必須先另行完成政策及法律評估。
- Repository 已有 DEV-only `externalUnverifiedLeads` staging collection，只接受 managed Page 官方 API 產生並已遮蔽受支援直接聯絡格式的 records。所有 records 初始均為 `pending_human_review`／`pending_review`／`not_authorized`，而且不屬於 `MockDb` 正式 marketplace state。`expiresAt` 由 MongoDB TTL index 執行上限，而 combined importer 每次亦會用同一批准日數 secure-delete／VACUUM raw SQLite 過期 rows，並移除已不在 allowlist 的 Pages。
- Staging record 只有在日後另行批准 conversion、consent、retention 及 outreach 流程後，才可考慮轉成正式 request；目前 importer 不設轉換功能。
- 外部 lead 不得繞過 [`docs/business-rules.zh-HK.md`](business-rules.zh-HK.md) 的師傅訂閱及新工作權限。被限制建立報價或接受新工作的師傅，仍不可接收這些 leads 作為繞過途徑。

## 現有本機 artifacts

以下 Group artifacts 位於 ignored `data/`，不是 repository contract，新的 clone／CI 不會有：

- `data/facebook-group-posts-14d.partial.json`
- `data/_finalize_facebook_group_posts.py`
- `data/facebook-group-posts-14d.json`
- `data/facebook-group-posts-14d.csv`
- `data/facebook-group-posts-14d.sqlite3`
- `data/facebook-group-posts-14d.qa.json`
- `data/_extract_job_leads_7d.py`
- `data/facebook-job-leads-7d.intermediate.json`
- `data/facebook-job-leads-7d.selected.json`

私人 Excel 亦不是 canonical source；canonical data 保持遮蔽，Excel 只供受限人工操作。

## 已知限制及下次修正

1. 現有 Group finalizer 使用 `Europe/London` 解讀畫面日期，不符合香港目標；對部分沒有年份的日期亦硬編碼 `2026`。正式化前要改用明確 source UI timezone、`Asia/Hong_Kong` reporting timezone 及 capture reference year，並加入跨午夜、跨年及夏令時間測試。
2. 現有 finalizer 硬編碼兩個 `GROUP_NAMES`，而 7 日 extractor 又依來源資料首次出現次序選「頭兩個 group」。正式化前必須改成同一份必填 allowlist，並驗證 manifest、input 及 finalizer supported IDs 完全一致。
3. 現有 extractor 只接受帖文正文出現的聯絡訊號，但 final human rule 亦接受可用 permalink 作 fallback；這是 automatic candidates 與最終 Excel 不一致的其中一個原因。
4. 現有 selected export payload 沒有 `stable_id`／source lineage，Excel 亦沒有已提交的 deterministic builder；下次應保留不含 raw contact 的 private selection manifest 及輸入 hash。
5. Group scripts 位於 ignored `data/`，沒有 clone／CI 可重現性。只有在取得合適 Meta 授權及內部批准後，才考慮遷移到 tracked `tools/facebook_group_leads/` 並加入 synthetic tests。
6. 現有 Group CSV writer 未處理 spreadsheet formula injection；修正及加測試前，不得直接用 Excel 開啟新 run 的 Group CSV。
7. 現有 contact regex 只能保證已支援格式的 leak count，不能證明匿名化；姓名、permalink、混合 Unicode 或 obfuscated contact 仍可能識別個人。
8. 今次有大量截斷內容及缺 permalink；現有數量不能代表完整 coverage。Facebook UI 搜尋排序及可見結果亦不保證完整。
9. 現有 private artifacts 使用一般工作站權限；新 run 每個建立私人檔案的 shell 都要設定 `umask 077`，再把 private directory 及 files 限制為 owner-only access。
10. 目前未有正式 retention period、outreach consent 流程或 external lead product model；三者未批准前，不可自動分發或聯絡。

## 正式化前的決策門檻

- 確認 Meta 允許的 Group data access 方式，或取得明確書面自動收集許可。
- 批准香港私隱、用途限制、retention、刪除及 outbound contact policy。
- 決定 explicit group allowlist、更新頻率及停止條件。
- 建立 tracked、可測試的 ETL；fixtures 必須是 synthetic，不能提交真實帖文或聯絡資料。
- 為現有 DEV-only `externalUnverifiedLeads` staging model 批准人工審批、consent、outreach 及正式 request conversion 流程；每次匯入仍須由 operator 明確提供已批准 retention 日數，批准前維持隔離及不可派發。
- 定義 quantity、precision、contactability、duplicate、staleness 及 conversion metrics。

AI 執行步驟及 stop conditions 見 [`facebook-group-job-lead-agent-runbook.md`](facebook-group-job-lead-agent-runbook.md)。
