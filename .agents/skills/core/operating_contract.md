# Agent 操作契約

## 文件角色

所有 repository 任務都要讀本檔。它規範如何界定範圍、驗證、溝通與交付，不承載產品版本或 solver 現況。

## 開始工作

1. 執行 `git status --short --branch`，辨識既有變更。
2. 判斷任務是 read-only review、diagnosis、implementation、documentation、commit 或 long-run handoff。
3. 依 `AGENTS.md` 路由，只讀完成任務需要的 owner。
4. 若使用者提供 wording、資料、UI 意圖或驗收條件，以它們為本次最高優先；不擴張成無關重構。

## 執行邊界

### Review／diagnosis

- 以目前 code、config、tests 與可重播 evidence 驗證文件敘述。
- 說明原因、影響與證據；沒有實作要求時不修改 runtime。

### Implementation

- 先找真正 owner 與可觀察 failure contract。
- 保留使用者與既有工作；修改最小必要範圍。
- 對會改變 mechanics、solver、condition、objective 或 session 解碼的變更更新對應 identity。
- 驗證強度依風險決定：小型文件變更不需要假裝完成視覺 QA；核心計算變更不能只跑格式檢查。

### Documentation

- 先改 canonical owner，再更新必要路由或摘要；不在多份文件複製同一 current-state 數字。
- 歷史結果移入 archive 或 evidence output，不讓過時的「下一步」留在 active owner。
- `README.md` 只有使用者當次明確要求才可修改。
- 完成前執行 `npm run docs:check`。

### Commit

- Bare `commit` 代表：分類 scope、只 stage cohesive files、檢查 cached name/stat/check/full diff、建立 commit；不 push。
- `add and commit all` 依 [add-commit-all.md](../../workflows/add-commit-all.md)。
- 工作樹若混有其他人的變更，只提交本次工作。

### 長時間運算

- Agent 不啟動 unattended 長跑，也不保持對話等待。
- 交付前驗證 build、run、resume、status-only 與安全中斷方式。
- 若可取得可信溫度感測，建議整合到流程；否則明示溫度由使用者監看，並提醒 worker、持續負載與散熱風險。
- 溫度證據只影響 unattended 操作與效能宣稱，不自動決定求解結果是否有效。

## FFXIV 與 solver 特別契約

- Mechanics correctness、condition model、policy quality 與玩家實戰證據分開。
- 完成條件與品質目標分開；progress-only 結果不能掩蓋 hard-quality failure。
- 報告以 family × equipment × risk × assumed world 切開；aggregate 只作索引。
- Synthetic、IID、fixed-tape 或 relaxed bound 必須保留其限制，不外推成真實成功率或理論上限。
- 玩家偏離建議是正常輸入；以實際 action history 更新，不把偏離當錯誤。

## 溝通與交付

- 使用自然繁體中文，technical identifiers 保留英文。
- 進度更新簡短說明正在驗證什麼、是否有 blocker。
- 最終報告先給結論，再列實際修改、驗證、未完成事項與需要使用者執行的命令。
- 同一結論只說一次；證據放在最接近它的位置。
- 明確區分：程式／靜態檢查已完成，以及視覺、裝置、正式網站或遊戲內實證尚未完成。
