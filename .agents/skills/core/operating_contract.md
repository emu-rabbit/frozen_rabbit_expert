# Agent 操作契約

## 文件角色

本文件規範 Agent 如何理解、執行與交付任務。產品、FFXIV mechanics、架構、UI 與研究真相由 `AGENTS.md` 路由到各自的 canonical owner。

## 基本契約

- **先確認結果**：先理解使用者要得到的結果、限制、非目標與可接受證據，再選擇做法。
- **查實際 owner**：依 `AGENTS.md` 讀取任務相關文件，再檢查 code、config、tests、built output、來源資料或 golden trace；文件記憶不是 current-state 證據。
- **維持範圍**：不混入無關重構、文案、制度、部署或其他 Agent 的變更。
- **透明假設**：安全且可回退的假設應明說；會改變產品方向、資料邊界、外部狀態、遊戲 mechanics 或授權範圍的假設必須先取得證據或詢問。
- **尊重工作樹**：既有 modified、staged、untracked 內容預設屬於使用者或其他工作，不得擅自刪除、覆寫或提交。
- **最小完整變更**：沿用既有 owner、資料流、型別與元件；只有真實重複或複雜度存在時才增加抽象。
- **證據對應風險**：文件做 diff、引用、編碼與格式檢查；domain logic 做 unit／invariant／golden trace；build、UI、data、效能與 deployment 依風險增加相應驗證。
- **分類工具失敗**：區分 sandbox、權限、網路、平台與程式錯誤。環境失敗不是修改產品邏輯的理由。
- **誠實交付**：沒有完成的驗證、外部阻塞、未知 mechanics、殘留風險與未處理工作必須清楚回報。

## FFXIV／solver 特別契約

- 先辨識資料層級：official、datamined/community database、empirical 或 assumption。
- 顯示名稱不是 identity；recipe、mission、item 與 action 必須使用 canonical ID 或明確 versioned identifier。
- simulator 與第三方工具可作 cross-check，不得直接當唯一 oracle。
- `Mechanics correctness`、`condition model confidence` 與 `policy coverage` 分開討論。
- 無法由公開資料確認的行為，建立 open question 並要求遊戲內 trace，不得補成確定規則。
- performance claim 必須附測量範圍；solver core、policy training、runtime recommendation、materialization 與 UI latency 分開量測。

## 任務流程

1. 讀取 `AGENTS.md`、本文件與任務 owner。
2. 執行 `git status --short --branch`，確認目前 checkout 與變更邊界。
3. 搜尋實際 code/config/data/test owner；若尚未 scaffold，明確區分 target 與 current state。
4. 以最小、完整、可回退的範圍執行。
5. 依風險執行驗證；mechanics 變更至少要能落到 deterministic test 或 golden trace。
6. 若持久契約改變，依 `documentation_governance.md` 同步 canonical 文件。
7. 回報結果、驗證、未知、殘留工作與未觸碰的外部變更。

## 語言與溝通

- 使用者可見回覆與 repository 文件預設使用自然繁體中文。
- code identifiers、commands、API、套件、FFXIV action／condition 的 canonical English name 可保留英文。
- 先交代結果與重要判斷，再提供必要證據；避免無意義的程序流水帳。
- 對外不得使用「最佳」、「完美」、「唯一正解」、「保證成功」等超過證據的宣稱。
