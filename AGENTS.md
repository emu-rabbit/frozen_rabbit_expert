# Frozen Rabbit Expert Agent 工作指南

本 repository 是 **Frozen Rabbit Expert**：面向 Final Fantasy XIV 宇宙探索高難度巧匠配方的即時決策助手，涵蓋 catalog 中的 EX、EX+、Master 等 expert mission，而不是只服務一組 EX+ POC。開始任何分析、研究、實作、設計、測試、提交或文件工作前，先以本檔為入口，再依任務讀取對應的 canonical 文件。

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
| 目前廣泛 catalog／generic solver 主線、交付與 gate | `.agents/roadmaps/broad_solver_implementation_plan.md` |
| 已完成五配方 POC 的歷史進度 | `.agents/roadmaps/poc_implementation_plan.md` |
| 待玩家實證問題與首批資料 | `.agents/research/open_questions.md` |
| 跨配方、三裝備與歷史 solver 版本成長量尺 | `.agents/research/solver_growth_scorecard.md` |
| 收錄與驗證遊戲內逐步紀錄 | `.agents/workflows/validate-golden-traces.md` |
| Generic Cosmic family 夜間深度評測、workers 校準、續跑與結果解讀 | `.agents/workflows/run-generic-overnight-evaluation.md` |
| `add and commit all`／全部提交 | `.agents/workflows/add-commit-all.md` |
| 2026-08-11 完整研究來源快照 | `cosmic-expert-crafting-solver-poc-handoff.md` |
| 2026-08-11 錠影片／訓練與 2026-08-12 釘優化心得、正負結果及後續接手 | `expert-crafting-training-handoff-2026-08-11.md` |
| 2026-08-14 求解器產品化、跨裝備泛化、配方 registry 與 Rust 加速接手 | `solver-productization-handoff-2026-08-14.md` |

## 核心專案理解

- 產品是玩家每一步回報結果後，根據**完整可觀測狀態**重新推薦下一技能的 advisory tool；不是固定巨集產生器。
- 五配方 POC 已完成 live 任務，只保留作歷史／teacher／regression。現在第一批產品邊界是目前全部宇宙探索高難配方；相同 mechanics 數值的不同名稱各自可選，但共用 family-level mechanics、generic solver 與驗證。
- runtime 分為 **Craft policy** 與 **Mission controller**。單件製作狀態不可與跨件數、材料、分數、倒數與 Duty Action 的任務狀態混成扁平 key。
- 使用者必須能回報實際技能、成敗、下一 condition、Duty Action 與 resync 資料。只回報「球色」不足以重建 state。
- Mechanics engine 追求精確；solver policy 只能稱為依目前模型的推薦。不得宣稱全域最佳、唯一解或保證成功。
- 正式 runtime 不 materialize 完整 policy tree、不靠無限制 memo，也不執行無 deadline 的 primitive-action 大型 MCTS。允許在本機以固定預算執行 option-conditioned stochastic MPC；只保存 session path 與獨立 `PlannerContext`，不能把 route intent 混入 mechanics `CraftState`。
- condition probability、mechanics correctness、policy coverage 必須分開表達；未知資料不可用一個模糊 confidence 掩蓋。
- 2026-08-25 已以 profiler 證明 generic closed-loop 的主要成本在 TypeScript `recommendAction`，並經使用者確認 Rust-primary target：完整 mechanics／generic solver／`PlannerContext`／episode compute 遷移後由同一 Rust core 持續演進，日間與 overnight 共用 native build，Web 接同 core WASM。v0.5.1 只作昨晚 historical outcome baseline；先建立並凍結新的 deterministic TS migration-oracle identity，再做逐步 Rust parity，不能拖到 release 才首次檢查或長期維護第二套 solver。
- 玩家實戰推薦必須 local-first、無 server round-trip；目前 web app 不是永久唯一平台。目標架構中獨立快速 policy 以 p95 `< 100ms` 作 benchmark gate、較強規劃器以 p95 `< 1s` 為主要目標；2026-08-24 generic slice 的 Worker／同步 fallback 暫時是同一 policy，不得假裝已有兩種能力。web watchdog 固定為 `3000ms`，只有用滿上限才標示 timeout；worker 啟動／執行錯誤或空結果可立即 fallback，UI 必須把兩者分開顯示。Material Miracle 是否可接受同一上限另以實機 UX 驗證。
- 不讀取遊戲記憶體或封包、不自動按鍵、不做 bot／automation。玩家保有最後決策權。

## 目前 repository 狀態

`last_verified: 2026-08-25`

- 已建立 npm workspace、Vue／Vite web app、TypeScript domain／data／protocol／solver／simulator／policy-lab packages、Vitest tests 與 GitHub Pages deployment workflow；公開頁面是否已包含目前 checkout 仍需另行實測，不能由本機 commit 狀態推定。
- `tools/import-cosmic-expert-recipes/run.mjs` 以固定 `WKSMissionRecipe`／`WKSMissionUnit` revisions 與 XIVAPI game-data/schema 交叉生成 catalog；目前為 432 個宇宙探索高難配方、八職各 54 個、50 個 mechanics families。另 8 個同為 level 100 Expert 的 Crumbling Aqueduct Master Recipes 不具 WKS membership，明確排除。catalog identity 綁定兩份 WKS revisions、XIVAPI version/schema 與 canonical generated content hash；`packages/data/src/cosmicExpertCatalog.ts` 綁定 recipe／objective／condition／mission identity。經固定 mission data 與逐任務來源確認，釘與巨匠藥的 objective knowledge 可沿用到同 mechanics／同單件要求的 family；mission identity、倒數、數量、材料鏈與跨件總分仍由 Mission controller 分開。
- setup／製作中畫面只常駐目前配方的 compact control；「切換配方」開啟可搜尋、可捲動且具 accessible dialog semantics 的 mobile bottom sheet，不把所有配方卡片永久堆在主流程。dialog 內可明確重新開始目前配方；選擇目前或其他配方都會以現有面板數值完整重置為第一步、Normal、滿耐久／CP、零作業／品質且無 pending／action history，並關閉 dialog、次要面板與未結算回饋。
- Web live path 對 432 個配方一律使用 deterministic TS migration identity `generic-craft-route-objective-condition-v0.6.0-migration-oracle`，不再路由五個 recipe-specific guide。它只把 bounded search 改為固定 per-root node budget，並鎖 canonical action／sequence／state tie-break；v0.5.1 保留為昨晚 historical outcome，不得把這項 migration normalization 宣稱成策略改善。玩家可選 stable／balanced／aggressive；完整 `CraftObjective` 直接進入 planner，只有來源已驗證的多階收藏價值門檻採 tier-aware floor，其餘 provisional／HQ／單階目標維持 continuous soft utility；所有 quality objective 都不會竄改 mechanics completion rule。每次成功結算後有 `750ms` input lock；restart／switch／undo／resync 會清除鎖定。browser storage 保存裝備與 risk preference；`3000ms` watchdog、立即 worker failure／null result 與 fallback 原因仍明示。Worker 與同步 fallback 目前執行同一 generic policy，只是隔離／失效保護，不得標成兩個不同強度的 planner。
- generic evaluator 固定以 50 個 policy-effective family scenarios 去重，equipment axis 由 versioned registry 提供，不再把三個舊面板寫死成永久母體。2026-08-24 v0.5.1 frozen paired checkpoint 使用當時三組 profiles、四個 assumed worlds、各 4 seeds，共 2400 episodes；`completed` 分為 `requiredQuality=0` 的 progress-only delivery 與 `requiredQuality>0` 的 progress＋quality hard gate。該 checkpoint 將前者由 `1726／1728` 提升到 `1728／1728`、0 completion regression，quality target `+1／-0`，後者仍為 `104／672`。平均 utility 差 `+0.000611` 的 95% interval 完整落在 ±`0.02` immaterial band，因此只保留局部 correctness 修補並停止繼續調這個 hypothesis；不能用這份歷史混合總數推論目前擴充 registry 的交貨底線、真實成功率或裝備極限。
- `tools/evaluate-generic-cosmic-overnight` 已接通 `rust-native`：每個 child 由同一 Rust release process 跑完整 paired closed-loop，Node parent 只負責 family × risk shard、global budget、timeout／retry、exclusive lock、atomic persistence／resume 與驗證；binary handshake、ABI、solver identities、SHA-256 與 content-address snapshot 任一不符都 fail closed，沒有 TS fallback。CLI 目前強制 `--native-preview`；正式 unattended run 仍等可信 CPU sensor、30 分鐘熱穩態與 worker-calibration evidence，完整操作只由 `.agents/workflows/run-generic-overnight-evaluation.md` 擁有。
- 三個舊 practical profiles（5408／5140／630、5408／5237／749、5428／5257／764）與玩家 95 球 empirical IID marginal 只作 regression／sensitivity；不是通用裝備人口、自然 transition model 或目前 Web coverage claim。
- `packages/policy-lab` 保存 action-only、continuation MPC、option controller 與 specialist experiments的正負證據；feature schema 為 v5／九 condition（含 Robust），compact scorer 為 v0.9.0。Web 不反向 import training package；真正 unseen loadout population、true transitions、failure／recovery traces 與 OOD promotion仍未完成。
- capability evidence 目前只完成 negative-only optimistic action-gain bound 與 fixed-tape clairvoyant route witness。10 profiles × 50 families＝500 cells 仍是 0 provably impossible、0 completion impossible under relaxation、500 inconclusive；這把放寬上界忽略 CP／耐久／setup，Recipe 36990 witness 又看得到未來且 frontier truncated。**裝備 × 配方距離上限量尺尚未做成可用的停止投資量尺**；沒有 resource-aware stochastic causal Bellman lower／upper bracket 前，不得輸出接近理論上限的百分比。先只對 hard-quality 高投入 cells 做小型 bound prototype，不能收窄就停止，不用更多 seeds 掩蓋結構性過鬆。
- 舊五配方的重要 mechanics／objective knowledge overlay仍保留：釘的品質上限 27400、暫定任務目標 27100；巨匠藥 `requiredQuality=0`、quality objective 12000；兩者的 template 已按前述 evidence 沿用到對應 family。木板 required quality 14900；腳手架成品 quality 22500 且未滿品質仍可完成。分數／HQ 區間未知處不得自行線性外推成遊戲真值。
- 錠／釘／木板／腳手架／巨匠藥 guide versions、exact-profile thresholds、frozen scorecard與 Command Brew reserved-final 全部是 historical evidence，不是目前 Web runtime。詳細正負結果只由 handoff／scorecard 擁有，不得複製回根入口形成工作優先級。
- 跨配方 runtime 共用 mechanics、session、參數化 equipment 與 generic solver；配方差異保留在 canonical recipe data、mechanics family、condition set 與 objective。全部 catalog entries 目前是 mechanics-ready，generic recommendation 只屬 development preview，尚未通過 experimental gate；不得稱 432 個都已有可靠路線或 validated 實戰成功率。後續用 family-level tactical／closed-loop evaluation、玩家 trace 與 OOD evidence 逐層提升。
- `craft-adaptive-policy-program-v1` 與 Command Brew risk-option extraction 只作 historical route-memory／recovery research；它們未接 Web、未 promotion，也不是下一步主線。只有跨多個 family 重複出現的 route／recovery failure 才能升為 generic option feature。
- 2026-08-23 historical checkpoint 為 57 files／392 Vitest、Rust 54 tests；目前 checkout 已新增 catalog、generic solver、Robust 與 native v2 coverage，精確數字以本次最終 full run 為準。新增測試仍須對應可觀察 failure contract，不以數量當品質。
- `cosmic-expert-crafting-solver-poc-handoff.md` 是使用者提供的完整研究交接，不應改寫成已驗證 runtime truth。
- `expert-crafting-training-handoff-2026-08-11.md` 封存錠／釘 historical teacher、玩家影片與正負結果；只在用它們作 regression 或調查已知 mechanics／策略缺陷時讀取。generic 主線先讀 broad roadmap。
- 腳手架與巨匠藥的玩家完整 trace corpus、true condition profile、精確任務效用／結算與任意裝備 OOD promotion 仍未完成；巨匠藥的 120 面板 screening 只支持 synthetic mechanics sensitivity，無 buff 不在穩定滿品質 envelope。Command Brew reserved-final 已於 2026-08-23 對鎖定候選使用一次並拒絕升版，不得回頭調參；腳手架 reserved 仍未使用。開始後續實作前先讀 `.agents/skills/professional/technical_architecture.md`，並重新檢查工作樹。
- native live batch ABI 已升為 transition／rollout／root v2 與 9×9 conditions；Robust fixture、54 transition cases、10 rollouts 與 12,000 root operations 已通過 TS↔Rust mechanics parity。`native-generic-episode-batch-v2` 現已承載完整 Rust closed-loop；TS policy 只作 bounded migration similarity reference，不再追逐逐招一致。Rust offline owner 的下一輪候選是 `generic-craft-opportunity-reserve-v0.18.0`，baseline 為 v0.15；全 50-family、4-world、10-equipment、8-seed paired preview 的 hard-quality 完成 `1255→1515／13440`，progress-only `30943→30943／34560`，4 workers 48,000 paired cases 用 112 秒。Web 尚未接 Rust core；後續真正嚴格的對齊是 native Rust→同 core WASM／TS wrapper。

## 固定工作規範

- 先檢查 `git status --short --branch`；既有 modified、staged、untracked 內容預設屬於使用者或其他工作。
- 使用者提供的 wording、命名、資料與 UI 意圖要精準保留；不主動做無關重構或制度擴張。
- mechanics 或 FFXIV 資料不確定時，標示 unknown／assumption，建立研究問題或請玩家提供 trace；不得自行補公式。
- 同一輸入若可能因 mechanics、condition profile、policy 或 session codec 變更而得到不同結果，必須更新對應 scenario-aware model version。
- 文件更新需維持單一 canonical owner；根入口只做摘要與路由。
- 使用者若要求 commit，讀取對應 workflow，檢查 staged scope 與 cached diff；不得自行 push、deploy 或改外部系統。
