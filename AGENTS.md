# Frozen Rabbit Expert Agent 工作指南

本 repository 是 Final Fantasy XIV 宇宙探索高難度巧匠的逐步決策助手。這份檔案只負責入口、路由與不可忽略的專案邊界；目前狀態由 [`.agents/current_state.md`](.agents/current_state.md) 管理。

## 每次任務的最小閱讀順序

1. 本檔。
2. [`.agents/skills/core/operating_contract.md`](.agents/skills/core/operating_contract.md)；瑣碎工作也要讀。
3. 先執行 `git status --short --branch`。
4. 依任務只讀下表的 canonical owner。需要目前版本、進度或下一個決策時，再讀 `current_state.md`。
5. 一般任務不讀 `.agents/archive/`；只有 active owner 明確連入歷史證據，或任務要求重播舊結果時才讀。

`README.md` 是使用者維護的 GitHub 門面，不是 agent 指令或知識來源。沒有使用者在當次任務中的明確指示，不得修改。

## 語言與命名

- 文件預設使用自然繁體中文；commands、APIs 與 code identifiers 保留英文。
- 遊戲技能第一次出現時使用「正式繁中名稱（英文名稱，`codeId`）」；後文可只用繁中名稱。完整規則見 [`.agents/glossary.md`](.agents/glossary.md)。
- PowerShell 讀取中文 Markdown 時使用 `Get-Content -Encoding UTF8`。
- 搜尋優先使用 `rg`／`rg --files`；文字編輯使用 `apply_patch`。

## 任務路由

| 任務 | Canonical owner |
| --- | --- |
| Agent 執行、範圍、驗證與交付 | [operating_contract.md](.agents/skills/core/operating_contract.md) |
| 文件 owner、分層、封存與檢查 | [documentation_governance.md](.agents/skills/core/documentation_governance.md) |
| 目前 checkout、已完成與待決事項 | [current_state.md](.agents/current_state.md) |
| 下一次 overnight 的假說、判讀與接受條件 | [overnight_review_brief.md](.agents/overnight_review_brief.md) |
| Rust solver 各版本的改動重點與用途 | [solver_version_history.md](.agents/solver_version_history.md) |
| 產品目的、使用者價值與非目標 | [project_mission.md](.agents/skills/mission/project_mission.md) |
| Catalog、單件製作決策與互動邊界 | [product_architecture.md](.agents/skills/mission/product_architecture.md) |
| 品牌、語氣與視覺方向 | [brand_identity.md](.agents/skills/mission/brand_identity.md) |
| 姊妹專案的使用時機 | [reference_projects.md](.agents/skills/mission/reference_projects.md) |
| 程式邊界、依賴、測試與版本 | [development_standards.md](.agents/skills/professional/development_standards.md) |
| Runtime、Rust／Web 與 package ownership | [technical_architecture.md](.agents/skills/professional/technical_architecture.md) |
| UI、RWD、a11y 與 i18n | [ui_ux_standards.md](.agents/skills/professional/ui_ux_standards.md) |
| FFXIV 製作規則與 condition | [ffxiv_expert_crafting.md](.agents/skills/domain/ffxiv_expert_crafting.md) |
| 資料來源、identity、證據與授權 | [data_and_evidence.md](.agents/skills/domain/data_and_evidence.md) |
| 主／快速求解器、風險與推薦契約 | [solver_policy_and_safety.md](.agents/skills/domain/solver_policy_and_safety.md) |
| Mechanics、統計、效能與 parity 驗證 | [algorithm_verification.md](.agents/skills/domain/algorithm_verification.md) |
| Craft state、事件、undo、resync 與 export | [session_state_and_events.md](.agents/specs/session_state_and_events.md) |
| 目前 roadmap 與停止條件 | [broad_solver_implementation_plan.md](.agents/roadmaps/broad_solver_implementation_plan.md) |
| 尚待研究或玩家實證的問題 | [open_questions.md](.agents/research/open_questions.md) |
| 收錄遊戲內逐步紀錄 | [validate-golden-traces.md](.agents/workflows/validate-golden-traces.md) |
| 長跑命令、續跑與狀態檢查 | [run-generic-overnight-evaluation.md](.agents/workflows/run-generic-overnight-evaluation.md) |
| 全部提交 | [add-commit-all.md](.agents/workflows/add-commit-all.md) |

## 專案不變邊界

- 產品依玩家回報的實際技能、成敗與下一球色，從完整可觀測狀態重新推薦；不是固定巨集。
- 第一批產品範圍是 catalog 中全部 432 個宇宙探索高難度配方。相同求解規則的配方共用 mechanics family 與評測；發現遊戲實證反例後才建立例外。
- 正式發布採單一整體 gate：發布時預設全部配方都足夠可靠，不在產品中維護配方成熟度分級。開發期評測仍需逐 family 暴露失敗。
- Stable／Balanced／Aggressive 都遵守合法性與必要品質；Stable 不是以低價值交貨冒充成功。弱裝備提供誠實 best-effort。
- Mechanics 回答「技能會造成什麼結果」；solver 回答「現在建議什麼」。資料正確、機率可信度與策略效果分開表達。
- 舊 TypeScript solver 已凍結，只能作歷史參考。新的策略迭代、測試與改善只在 Rust 進行。
- 是否把採用的 Rust 結果編譯成 WASM，或另建新的 TypeScript Web 核心，留到採用時以實測決定；舊 TypeScript 不會復活。
- 目標 runtime 有主要求解器與獨立快速求解器：主要求解器最多等待 3 秒；快速求解器固定預算、目標裝置 p95 小於 100ms，且合法非終局狀態不得回傳空白。
- 玩家採用主要建議、快速建議或自行選擇合法技能後，下一步都以實際 history 重新嘗試主要求解器。
- 跨件材料、分數、倒數與 Duty Action 的 Mission controller 不在目前承諾範圍；不得為它預先增加 runtime 複雜度。
- 玩家實戰推薦 local-first，不讀取遊戲記憶體或封包、不自動按鍵、不做 bot 或 automation。

## 工作樹與外部副作用

- 既有 modified、staged、untracked 內容預設屬於使用者或其他工作；只處理本次範圍。
- 不確定的 mechanics、資料或公式標成 unknown／assumption，不能補成遊戲真值。
- 使用者要求 commit 時依對應 workflow 精確 stage、檢查 cached diff；不自行 push、deploy 或改外部系統。
- 長跑只能由使用者啟動。Agent 驗證 build／run／resume／status 命令後結束工作，不保持對話等待結果；若有持續高溫風險，交付時主動提醒。
