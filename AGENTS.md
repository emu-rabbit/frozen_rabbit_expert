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

## 核心專案理解

- 產品是玩家每一步回報結果後，根據**完整可觀測狀態**重新推薦下一技能的 advisory tool；不是固定巨集產生器。
- POC 直接以 Patch 7.51 Auxesia DoH EX+ 為目標，順序是 WR.01 主件、WR.02、TR.01。這是研究快照，實作前仍須用官方資料、canonical ID 與遊戲內證據確認。
- runtime 分為 **Craft policy** 與 **Mission controller**。單件製作狀態不可與跨件數、材料、分數、倒數與 Duty Action 的任務狀態混成扁平 key。
- 使用者必須能回報實際技能、成敗、下一 condition、Duty Action 與 resync 資料。只回報「球色」不足以重建 state。
- Mechanics engine 追求精確；solver policy 只能稱為依目前模型的推薦。不得宣稱全域最佳、唯一解或保證成功。
- 正式 runtime 不展開完整 policy tree，不靠無限制 memo、不在每一步執行大型 MCTS，也不 materialize 未走訪分支。只保存 session path，使用固定預算離線評估改善 compact policy。
- condition probability、mechanics correctness、policy coverage 必須分開表達；未知資料不可用一個模糊 confidence 掩蓋。
- Phase 0／1 以 TypeScript 單一 mechanics source 為預設；沒有 throughput 證據前不得提早建立第二份 WASM core。
- 玩家實戰推薦必須 local-first、無 server round-trip；Material Miracle fast mode 的 p95 recommendation 目標低於 50ms。
- 不讀取遊戲記憶體或封包、不自動按鍵、不做 bot／automation。玩家保有最後決策權。

## 目前 repository 狀態

`last_verified: 2026-08-11`

- 已建立 npm workspace、Vue／Vite web app、TypeScript domain／data／protocol／solver packages 與 Vitest tests；CI 與 deployment 尚未建立。
- 第一版 Phase 0 POC 已鎖定「宇宙鈦鐵錠」（Cosmotized Ilmenite Ingot，Recipe 36282／Item 48360）：玩家輸入作業精度、加工精度與 CP，並可切換宇宙工具的高品質 `1.75×` bonus；裝備設定獨立保存在 localStorage。玩家逐步選球與技能，非 100% 技能由玩家指定成敗，不擲骰。配方與公式已對照 XIVAPI game data／Teamcraft，完整 mechanics timing 仍待 golden trace。
- Phase 1 已加入只支援宇宙鈦鐵錠的 `cosmic-titanium-lookahead-policy-v1.1.0`：以 Teamcraft guide 作 soft prior／quality options，使用固定預算 expectimax 比較 action success、均衡未來 condition sensitivity、資源與後續路線，並提供理由、替代選擇、提前完成 hard veto、progress finisher check 與 Blacksmith action icon。球色／結果／下一球回報現在是下一步推薦的硬閘門。完整 golden session、Playwright suite、recipe-specific condition profile 與 held-out policy evaluation 仍未完成。
- `cosmic-expert-crafting-solver-poc-handoff.md` 是使用者提供的完整研究交接，不應改寫成已驗證 runtime truth。
- 正式 WR.01 canonical data、golden trace、guide policy、CI 與 deployment 仍未完成。開始後續實作前先讀 `.agents/skills/professional/technical_architecture.md`，並重新檢查工作樹。

## 固定工作規範

- 先檢查 `git status --short --branch`；既有 modified、staged、untracked 內容預設屬於使用者或其他工作。
- 使用者提供的 wording、命名、資料與 UI 意圖要精準保留；不主動做無關重構或制度擴張。
- mechanics 或 FFXIV 資料不確定時，標示 unknown／assumption，建立研究問題或請玩家提供 trace；不得自行補公式。
- 同一輸入若可能因 mechanics、condition profile、policy 或 session codec 變更而得到不同結果，必須更新對應 scenario-aware model version。
- 文件更新需維持單一 canonical owner；根入口只做摘要與路由。
- 使用者若要求 commit，讀取對應 workflow，檢查 staged scope 與 cached diff；不得自行 push、deploy 或改外部系統。
