# Frozen Rabbit Expert Agent 工作指南

本 repository 是 **Frozen Rabbit Expert**：面向 Final Fantasy XIV 宇宙探索 EX+ 高難度巧匠任務的即時決策助手。開始任何分析、研究、實作、設計、測試、提交或文件工作前，先以本檔為入口，再依任務讀取對應的 canonical 文件。

除本檔外，`.agents` 內的 Markdown 不保證自動載入。不要一次把整個文件庫塞入上下文；只讀取任務需要的 owner，並以目前 code、config、tests、遊戲內紀錄與權威來源重新驗證會漂移的內容。

## 讀檔與語言

- repository 文件預設使用自然繁體中文；technical terms、commands、API 與 code identifiers 保留英文。
- 在 Windows PowerShell 讀取中文 Markdown 時使用 `Get-Content -Encoding UTF8 <path>`。若出現亂碼，先以 UTF-8 重讀，不可依亂碼推論。
- 搜尋優先使用 `rg`／`rg --files`；文字編輯優先使用 `apply_patch`。

## 每次任務的共同入口

1. `.agents/skills/core/operating_contract.md`
2. `.agents/skills/mission/project_mission.md`
3. `.agents/skills/mission/product_architecture.md`

若任務會改動持久文件，再讀：

- `.agents/skills/core/documentation_governance.md`

## 任務路由

| 任務 | Canonical owner |
| --- | --- |
| Agent 執行、範圍、驗證與交付方式 | `.agents/skills/core/operating_contract.md` |
| 文件分類、owner、更新與驗證 | `.agents/skills/core/documentation_governance.md` |
| 產品目的、價值、底線與非目標 | `.agents/skills/mission/project_mission.md` |
| Craft policy、Mission controller 與產品 surface 分工 | `.agents/skills/mission/product_architecture.md` |
| Frozen Rabbit 品牌、語氣、配色與視覺方向 | `.agents/skills/mission/brand_identity.md` |
| `frozen_rabbit_tome`／`workshop` 的參考邊界 | `.agents/skills/mission/reference_projects.md` |
| 程式碼、依賴、測試與效能標準 | `.agents/skills/professional/development_standards.md` |
| 目標 stack、package 邊界、runtime data flow 與版本 | `.agents/skills/professional/technical_architecture.md` |
| UI、快速回報、RWD、dark mode、a11y 與 i18n | `.agents/skills/professional/ui_ux_standards.md` |
| FFXIV expert crafting、condition、任務族與 mechanics 缺口 | `.agents/skills/domain/ffxiv_expert_crafting.md` |
| 來源層級、patch-aware data、canonical ID 與授權 | `.agents/skills/domain/data_and_evidence.md` |
| Phase policy、候選技能、安全收尾、objective 與信心 | `.agents/skills/domain/solver_policy_and_safety.md` |
| Mechanics、invariant、golden trace、統計與效能驗證 | `.agents/skills/domain/algorithm_verification.md` |
| Craft／Mission state、事件、resync 與 debug export contract | `.agents/specs/session_state_and_events.md` |
| POC 階段、目前狀態、交付與 gate | `.agents/roadmaps/poc_implementation_plan.md` |
| 待玩家實證問題與首批資料 | `.agents/research/open_questions.md` |
| 收錄與驗證遊戲內逐步紀錄 | `.agents/workflows/validate-golden-traces.md` |
| `add and commit all`／全部提交 | `.agents/workflows/add-commit-all.md` |
| 2026-08-11 完整研究來源快照 | `cosmic-expert-crafting-solver-poc-handoff.md` |
| 2026-08-11 錠影片／訓練與 2026-08-12 釘優化心得、正負結果及後續接手 | `expert-crafting-training-handoff-2026-08-11.md` |

## 核心專案理解

- 產品是玩家每一步回報結果後，根據**完整可觀測狀態**重新推薦下一技能的 advisory tool；不是固定巨集產生器。
- POC 直接以 Patch 7.51 Auxesia DoH EX+ 為目標，順序是 WR.01 主件、WR.02、TR.01。這是研究快照，實作前仍須用官方資料、canonical ID 與遊戲內證據確認。
- runtime 分為 **Craft policy** 與 **Mission controller**。單件製作狀態不可與跨件數、材料、分數、倒數與 Duty Action 的任務狀態混成扁平 key。
- 使用者必須能回報實際技能、成敗、下一 condition、Duty Action 與 resync 資料。只回報「球色」不足以重建 state。
- Mechanics engine 追求精確；solver policy 只能稱為依目前模型的推薦。不得宣稱全域最佳、唯一解或保證成功。
- 正式 runtime 不 materialize 完整 policy tree、不靠無限制 memo，也不執行無 deadline 的 primitive-action 大型 MCTS。允許在本機以固定預算執行 option-conditioned stochastic MPC；只保存 session path 與獨立 `PlannerContext`，不能把 route intent 混入 mechanics `CraftState`。
- condition probability、mechanics correctness、policy coverage 必須分開表達；未知資料不可用一個模糊 confidence 掩蓋。
- Phase 0／1 以 TypeScript 單一 mechanics source 為預設；沒有 throughput 證據前不得提早建立第二份 WASM core。
- 玩家實戰推薦必須 local-first、無 server round-trip；目前 web app 不是永久唯一平台。快速 fallback 保留 p95 `< 50ms` 的觀測基準，但這只是 benchmark gate，不是切換計時器；強規劃器以 p95 `< 1s` 為主要目標。web watchdog 固定為 `3000ms`，只有用滿上限才標示 timeout；worker 啟動／執行錯誤或空結果可立即 fallback，UI 必須把兩者分開顯示。Material Miracle 是否可接受同一上限另以實機 UX 驗證。
- 不讀取遊戲記憶體或封包、不自動按鍵、不做 bot／automation。玩家保有最後決策權。

## 目前 repository 狀態

`last_verified: 2026-08-12`

- 已建立 npm workspace、Vue／Vite web app、TypeScript domain／data／protocol／solver／simulator／policy-lab packages、Vitest tests 與 GitHub Pages deployment workflow；公開頁面已有舊版，本次未提交工作樹尚未 push／部署。
- 網站已支援四個可切換 scenario：宇宙鈦鐵錠（Recipe 36282／Item 48360）、宇宙鈦鐵釘（36283／48361），以及 **【高難＋】製作高空作業所需的腳手架** 的宇宙探索用的硬化木板（36205／48263）與高空作業用的腳手架（36208／48311）。`apps/web/src/scenarios.ts` 集中綁定 recipe、`CraftObjective`、planner、物品 icon、預設裝備與 development equipment envelope。主畫面可見目前物品 icon／名稱，點配方即以現有面板數值重新開始；開場 condition 固定 Normal，不再詢問第一球。
- `packages/solver` 現為 guide／certificate／bounded-risk 的唯一 runtime owner；四個 scenario 使用各自 versioned policy/config。網站主流程沒有「我已施放」；偏離、undo、reload 都用 actual action history 重建 memory。`3000ms` watchdog 逾時會終止 worker 並回到 `cosmic-craft-objective-lookahead-fallback-v1.5.0`；立即 worker error／null result 也會 fallback，推薦卡會顯示 elapsed、原因與 policy version。
- 目前 practical specialist profile 為 5428／5257／764／宇宙工具 ON，數值已含專家證。玩家純 Observe 95 球計數 36／14／13／13／10／9 作主要 empirical marginal，但 IID replay 不是真實 transition model。錠 v1.1.0 在此 profile 為 96／128，assumed stress 為 163／384；development 已參與調整，不能稱真實成功率或正式 held-out promotion。
- `packages/policy-lab` 保留 action-only 0／72、continuation MPC、option controller 與 specialist experiments 的正負證據，不得讓 web 反向 import training package。CrafterProfile population、true condition transitions、failure／recovery traces、frozen validation、cross-profile benchmark 與 OOD router仍未完成。
- 宇宙鈦鐵釘 mechanics 品質上限 27400，但玩家任務表確認 1000 分上端為收藏價值 2710，所以 v2 objective target 是 27100。分數表為 1644–1917→100、1918–2465→300、2466–2710→700–1000；錠固定 80，Silver／Gold 為 980／1080，因此一錠一釘需要釘 900／1000。區間內精確換算未知，不得稱 `>=2466` 為 Silver 或 1000 分。v1.2.0 用專心致志→集中加工、快速改革與最多三次設計變動增加高尾；完整 development 512／512，high 88、`>=97% target` 69、`>=27100` 39，0 safety violation。這不是真實成功率或 Silver rate。
- 腳手架木板 mechanics 為作業 4700、耐久 20、必要／上限品質 14900；成品為作業 9300、耐久 60、品質上限 22500、非收藏品且可 HQ，未滿品質仍完成並作一次 HQ 判定。兩者使用 Normal／Good／Good Omen／Sturdy／Pliant／Malleable／Primed，沒有 Centered。Good Omen 強制下一作業 step 為 Good；Primed 讓當步套用的持續 buff 增加 2 steps。
- 腳手架策略刻意不使用專家技能，也不以專家 profile 評比。六組非專家 equipment profiles × 三個 provisional condition profiles × 4 seeds 的快速 development screening：木板滿品質完成 70／72；成品完成 72／72、滿品質 18／72；0 specialist recommendation／safety violation。這是已參與開發的小樣本，不是真實成功率、HQ rate、frozen validation 或跨裝備 promotion。
- 跨配方目前共用 mechanics、session 與參數化 equipment；每個 recipe 保留獨立 objective、config 與 policy version。沒有足夠 frozen／OOD evidence 前不得為追求「通用策略器」抹平配方差異；後續優先取得腳手架實戰 trace、自然 condition transitions、HQ 結算與跨裝備 frozen corpus。
- `cosmic-expert-crafting-solver-poc-handoff.md` 是使用者提供的完整研究交接，不應改寫成已驗證 runtime truth。
- `expert-crafting-training-handoff-2026-08-11.md` 封存錠的 37 步玩家影片、512-state／24-future 訓練矩陣、模擬修正與 option／route learning，並增補釘 v1.1.0 的評估誤判及 v1.2.0 的任務分數量尺、95 球主環境、專家收尾、高尾 metrics 與本輪停止點；後續 solver 研究先讀此檔，不能只看 roadmap 摘要。
- 腳手架的完整 trace corpus、true condition profile、品質對 HQ 機率的權威公式／實戰結算與 frozen cross-equipment evaluation 仍未完成；目前公開 GitHub Pages 也尚未包含本次未提交改動。開始後續實作前先讀 `.agents/skills/professional/technical_architecture.md`，並重新檢查工作樹。

## 固定工作規範

- 先檢查 `git status --short --branch`；既有 modified、staged、untracked 內容預設屬於使用者或其他工作。
- 使用者提供的 wording、命名、資料與 UI 意圖要精準保留；不主動做無關重構或制度擴張。
- mechanics 或 FFXIV 資料不確定時，標示 unknown／assumption，建立研究問題或請玩家提供 trace；不得自行補公式。
- 同一輸入若可能因 mechanics、condition profile、policy 或 session codec 變更而得到不同結果，必須更新對應 scenario-aware model version。
- 文件更新需維持單一 canonical owner；根入口只做摘要與路由。
- 使用者若要求 commit，讀取對應 workflow，檢查 staged scope 與 cached diff；不得自行 push、deploy 或改外部系統。
