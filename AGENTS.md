# 快修24 專案工作規則

以下規則適用於整個 repository。進行任何工作前，必須同時閱讀及遵守 `docs/business-rules.zh-HK.md`。

## Git 工作流程

- 所有已完成及驗證的改動，直接提交到 `master`。
- 每次建立 commit 後，直接 push 到 `origin/master`；除非使用者另有明確指示，否則不建立 feature branch 或 Pull Request。
- 開始修改及 push 前，先確認目前 branch、working tree 及遠端狀態，避免覆蓋其他人的改動。
- 只 stage 本次工作相關的檔案；不得改動、丟棄或提交使用者的無關變更。
- Commit 前執行與改動風險相稱的測試、lint 及 type-check。
- 不得提交 API keys、付款服務 secrets、密碼或其他敏感資料。
- 如果遇到 merge conflict、測試失敗、branch protection、遠端拒絕 push，或可能破壞正式資料的 migration，必須停止並向使用者清楚交代，不能假裝已成功提交或推送。
- 純分析、研究或回覆而沒有檔案改動時，不建立空 commit。

## 商業規則

- `docs/business-rules.zh-HK.md` 是目前商業邏輯的主要依據。
- 新功能不得默默改變已確認的收費、試用、欠費、取消或權限規則。
- 如果需求與既有商業規則衝突，實作前先指出衝突並請使用者確認。
