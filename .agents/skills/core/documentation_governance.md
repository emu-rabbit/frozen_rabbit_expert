# 文件庫治理規範

## 目的

文件要讓 agent 以最少必要 context 找到正確 owner，並讓歷史證據可追溯而不干擾目前優先級。治理重點是資訊分層與可驗證 ownership，不是增加更多禁令。

## 文件類型

| 類型 | 用途 | 允許的時間性內容 |
| --- | --- | --- |
| Entry | `AGENTS.md`；最小入口、路由與跨任務 invariants | 不放評測數字與版本進度 |
| Canonical owner | 穩定產品、領域、架構或流程契約 | 只放該 owner 的耐久規則 |
| Current state | `.agents/current_state.md` | 目前 checkout、待決事項、evidence pointers |
| Active evaluation brief | `.agents/overnight_review_brief.md` | 下一次 overnight 的改動假說、預期受益面、判讀順序與接受／撤回條件 |
| Roadmap | 下一階段、gate、停止條件 | 不保存完整 run report |
| Workflow | 可重跑操作與判讀方式 | 命令可引用 config，不複製歷史結果 |
| Research questions | 尚未回答、需要什麼 evidence、回答後去哪裡 | 不保存已結案長篇敘事 |
| Protected human doc | `README.md` | 只有使用者明確要求才修改；不是 agent owner |

## 單一 owner

- 一類 truth 只有一個 canonical owner；其他文件只用一句摘要加連結。
- 版本字串、hash、catalog 數量與 evaluator identity 優先由 code／config 擁有；current state 可引用，不在 stable owners 重複。
- Roadmap 管「下一步與何時停止」；current state 管「現在已經是什麼」；evaluation output 管「某次跑出什麼」。
- Active evaluation brief 管「下一個結果 task 應如何檢驗本輪 candidate」。它可引用 bounded evidence，但正式結果仍由 evaluation output 擁有。
- 已結案的 handoff、roadmap、scorecard 與研究快照不留在 active tree；需要追溯時使用 evaluation output 與 Git history。

## 對大型語言模型友善的寫法

- 每項指令只在 owner 完整定義一次。
- 先寫目的與正向預設，再寫真正的例外。
- 使用下列標籤思考內容，不必在每段機械加標頭：
  - **Invariant**：違反會造成資料不實、安全問題或跨版本解碼錯誤。
  - **Default**：通常最有效率的做法，可由任務證據改變。
  - **Decision**：使用者已選定的方向。
  - **Snapshot**：會漂移的目前狀態，必須有日期與 evidence pointer。
  - **Assumption**：尚未證明，只能限制 claim。
- 「不得／必須」只用於 invariant、權限與資料真實性；偏好與流程使用正向 default 或 decision rule。
- 用小表格處理重複映射；用短流程描述順序；不要用多段近義文字反覆強調。
- 專有名詞第一次出現連到 [glossary.md](../../glossary.md)，不在每份文件重新發明定義。

## 閱讀與路由預算

- 每次任務固定讀 `AGENTS.md` 與 `operating_contract.md`。
- 其餘只依 route 讀 owner；不因 context window 很大而一次載入文件庫。
- 只有需要 current facts 時讀 `current_state.md`。
- 只有 task 明確需要歷史重播、來源追溯或 regression 時讀對應 evaluation output 或 Git history。
- 姊妹專案只有目前 owner 缺資料、使用者要求系列一致，或任務明確需要 reuse 時才查看。

## 更新流程

1. 找到 claim 的 owner；沒有 owner 時先判斷是否真的需要新文件。
2. 以目前 code、config、tests、遊戲資料或可重跑 evidence 驗證會漂移的敘述。
3. 先更新 owner，再更新 current state、roadmap 或 routing。
4. 已結案的 handoff、plan 與 redirect 直接刪除；仍有研究價值的結果放在 evaluation output，不複製整份歷史操作文件。
5. 執行 `npm run docs:check`，再用 `rg` 搜尋舊術語、版本與連結。
6. 在交付中說明機械檢查與仍需人工判斷的部分。

## Current state 規則

- 只有 `.agents/current_state.md` 可作 repository-wide 現況摘要。
- 每次更新包含 `last_verified`、目前事實、待決事項與 evidence pointers。
- 未在本次核對的外部結果明示「使用者已回報、尚未在此 task 獨立驗證」。
- 一旦決策完成或事實移入 code/config，刪除過時敘述，不累積時間線。

## Active evaluation brief 規則

- 每次交付新的 overnight candidate 前更新 baseline、candidate、改動假說、預期受益切片、已知風險、四表閱讀順序與接受／撤回條件。
- Brief 要在看見 full-run 結果前固定解讀契約，避免後續 task 依結果事後改寫成功標準。
- 下一個結果 task 先以 brief 檢查完整 evidence，再記錄採用、撤回或繼續迭代決定。
- 本輪決策完成後，結果摘要寫入 evaluation report；active 路徑只保留下一次待跑或待判讀的 brief，沒有下一輪時明示未排定 long run。

## 歷史內容規則

- Git history 保存刪改前內容；不為了「可能有用」保留舊指令、handoff 或 redirect。
- 實際輸入、輸出、判讀與 identity 留在 evaluation report；報告不承擔目前優先級。
- 仍被正式報告引用的既有跑前契約可暫留，直到報告能以 commit identity 完整定位後再刪除。

## 自動與人工檢查

`npm run docs:check` 只檢查可機械判斷的事項：

- UTF-8、BOM、相對連結、單一 H1、code fence 與 trailing whitespace；
- agent 入口引用是否存在。

語意 ownership、優先級、是否過度重複與 factual correctness 仍需人工 review；不建立虛假的自動文件品質分數。
