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

### 進度、架構與收尾報告

這類報告的目標是讓一位理解產品問題、但不必熟悉演算法論文或內部程式名稱的合作者，能完整理解目前做到哪裡、為何這樣做，以及下一步怎麼接手。篇幅可以長，但必須**完整而不重複**。

- 開頭先用一小段話誠實定位成果：目前完成的是共用底座、研究候選、可驗證里程碑，還是已可交付的 runtime 能力；不得把「工具已能測試」寫成「策略已經變強」。
- 每個主要成果依「做了什麼 → 為什麼要做 → 對玩家或後續開發有什麼用 → 用什麼證據支持 → 還有哪些限制」說明。technical term 第一次出現時，應立即用功能解釋，不可只列專有名詞或直譯名稱。
- 解釋多層架構或研究流程時，優先採用一組前後一致的生活化比喻，例如把 mechanics、policy、evaluator 分別比作引擎、駕駛與考官；比喻後必須映射回真實元件與責任邊界，不能用比喻取代精確事實。
- 分開說明「已證明的能力」、「被拒絕或仍屬研究的候選」、「尚未完成的工作」與「下一步」。負面結果是可重用的研究成果，不可省略，也不可因底層工程成功而暗示策略效果已升級。
- 使用者修正 domain 或產品理解後，應明確交代：先前哪個假設不完整、修正後採用什麼理解，以及它實際改變了哪些設計、評估標準或後續方向；不可只表示同意後繼續沿用舊框架。
- 完整不等於重述。同一個結論、數字或限制在報告中只安排一個主要位置；開頭摘要只做定位並引導後文，不再用另一個大段落重講相同內容。交付前應合併重疊標題與段落，做一次「刪掉其中一段是否幾乎不損失資訊」的去重檢查。
- 測試數、hash、commit、命令與檔案列表集中放在靠後的驗證／存檔段落；正文只引用足以支撐判斷的數字，避免讓證據清單打斷產品解釋。
- 若使用者要求仔細說明，不以刻意縮短為目標；應維持白話、因果完整、證據邊界清楚，同時刪除內容上的重複。

長篇進度或收尾報告在送出前，至少確認下列問題各有且只有一個清楚答案：

1. 現在實際完成到哪一層？
2. 這些工作分別解決什麼問題，為什麼要這樣設計？
3. 哪些證據支持目前的判斷？
4. 哪些能力仍未證明，哪些候選已被拒絕？
5. 下一位 Agent 應從哪裡繼續、先做什麼？
6. 驗證、Git 存檔與未執行的外部動作是什麼？
7. 是否有兩個段落實質重講同一件事？
