# 文件庫治理規範

## 文件角色

本文件規範如何新增、更新、拆分、移動與移除 repository 的持久文件。目標是讓未來 Agent 快速找到唯一 owner，而不是要求每次工作都新增文件。

## 觸發條件

- 使用者要求建立、整理或更新文件。
- 程式、產品行為、FFXIV 資料、架構、驗證或 workflow 的持久契約已改變。
- 使用者確認新的長期目標、限制或非目標。
- 現有文件與 code/config/data/test、權威來源或使用者最新指示衝突。

純問答、診斷、review、臨時探索或未改變持久契約的局部修正，不需為了程序新增文件。

## 單一 canonical owner

每一項持久真相只能有一個 canonical owner。其他文件只能路由、提供一行摘要或標明讀取時機；不要複製完整規則、數值、型別或流程。

| 類型 | Canonical responsibility | 不應承載 |
| --- | --- | --- |
| `AGENTS.md` | 入口、任務路由、底線摘要、目前狀態入口 | 完整 mission／domain／architecture 副本 |
| `README.md` | 對人類讀者的產品簡介、狀態與文件入口 | Agent 操作細節或完整研究規格 |
| `skills/core/` | Agent 操作與文件治理 | 產品或 mechanics 規格 |
| `skills/mission/` | 產品使命、架構、品牌與系列關係 | 逐 action 公式或 runtime schema |
| `skills/professional/` | 開發、技術架構與 UI/UX 標準 | 單一 mission 的 domain 規則 |
| `skills/domain/` | FFXIV mechanics、資料證據、solver 與驗證知識 | Git 操作或單次聊天結論 |
| `specs/` | runtime state、event、schema 與 feature contract | 研究日誌或產品使命 |
| `roadmaps/` | 階段、交付、驗收 gate 與進度 snapshot | 永久 mechanics 真相 |
| `research/` | 未解問題、假設與所需證據 | 已證實規則的競爭副本 |
| `workflows/` | 有觸發條件、步驟、驗證與輸出的操作流程 | 產品使命或聊天紀錄 |
| 根交接文件 | 研究來源快照與完整脈絡 | 隨 code 自動更新的 current truth |

## 規則層級

- **Invariant**：未經明確授權不得偏離的產品、安全、資料或驗證底線。
- **Default**：目前偏好的設計或技術方向；有更好證據時可提出可逆替代。
- **Snapshot**：會隨 patch、code、config、版本或研究進展改變的現況；必須附 `last_verified` 與重查來源。
- **Assumption**：為了研究暫用但尚未確認的模型輸入；必須可搜尋、可替換，且不得寫成事實。

## 更新前檢查

1. 這是持久真相，還是只屬於本次任務？
2. 能否由 type、schema、test、config 或 dataset 直接保護？若可以，文件只保留目的與 owner。
3. 它是 invariant、default、snapshot 還是 assumption？
4. 現有 canonical owner 在哪裡？
5. 寫入後是否會重複、矛盾或跨越責任？
6. 哪些直接引用、路由或研究問題需要同步？

## 研究資料與快照

- `cosmic-expert-crafting-solver-poc-handoff.md` 保留 2026-08-11 研究脈絡，不因後續實作而無聲改成 runtime spec。
- 已確認的 durable contract 應寫入 mission／domain／spec owner；未確認項目移到 `research/open_questions.md`。
- patch、recipe 數值、condition rate 與官方狀態都屬 snapshot。更新時保存來源 URL、`verifiedAt`、patch 與 canonical ID。
- 若新證據推翻舊假設，更新 canonical owner 與測試資料；不要只在 roadmap 追加一句相反結論。

## 新文件守衛

新文件必須同時符合：

- 有獨立且可描述的 responsibility；
- 會被一類可辨識任務重複使用；
- 放入既有 owner 會破壞責任邊界；
- 不是聊天摘要、暫時狀態或單一 bug 筆記；
- 已決定由 `AGENTS.md` 或哪份 owner 路由。

本 repository 不預設建立 decision-history 系統。真正 durable 的產品決策應先寫進其 canonical mission／domain／spec；只有使用者明確要求，且現有 owner 無法表達決策脈絡時，才另建決策文件。

## 驗證清單

- `rg` 找不到移除／搬移文件的失效引用。
- 同一規則沒有多份完整 owner。
- `AGENTS.md` 能把任務導向正確 owner。
- 相對 Markdown 連結可解析。
- 所有文字檔為 UTF-8 without BOM，無行尾空白。
- `git diff --check` 通過。
- `git diff` 只包含本次文件範圍。
- current behavior 已用 code/config/tests/data 或 live evidence 驗證，而非只做文件互相一致。
