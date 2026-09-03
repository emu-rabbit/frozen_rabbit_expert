# 目前狀態

`last_verified: 2026-09-07`

本檔只摘要目前 checkout 與已決定的下一個判斷點。永久產品與技術契約由 routing owner 管理；單次評測結果留在 evaluator output。

## 產品範圍

- Catalog 目前包含 432 個宇宙探索高難度配方，按會影響求解的數值、condition 與 objective 分為 50 個 mechanics families。
- 相同 family 目前假設具有相同求解條件；只有新的遊戲實證出現矛盾時才建立例外。
- 網頁正式發布採單一整體 gate。發布時預設全部 432 個配方都已足夠可靠，不在產品中維護配方成熟度分級。
- 跨件材料、分數、倒數與 Duty Action 的 Mission controller 已移出目前承諾範圍；未來可重新決定是否放回本專案、另立專案或不做。
- 目前網站尚未上線且沒有 live 使用者，採用新核心時可乾淨切換到選定的 runtime。

## Solver 與 Web

- 2026-08-29 Raphael 無球色基本製作參考 500/500 已保存。30 秒初跑為 412 組 `optimal`；120 秒與 300 秒兩輪只重試未完成格後，**495/500** 已完成 upstream 搜尋，**500/500** 都有可在兩個 mechanics 逐招一致重播的 optimal／incumbent 路線，0 mismatch。5 組 `interrupted` 只代表 300 秒內未證明搜尋完成，不是無解。結果見 [完整參考報告](../reports/normal-reference/raphael-main-500.md)、[300 秒 refinement](../reports/normal-reference/raphael-main-500-refine-300s.md) 與 [路線分析](../reports/normal-reference/raphael-solved-route-analysis.md)。
- 通用基本路線探針在 500 格都找到推滿進展路線；在擴充後 495 個 Raphael `optimal` 格的 Q 加總比為一般收藏品 94.6%、hard-quality 91.7%、HQ 90.3%、連續品質 92.7%。食藥主戰裝備合計 94.17%，逐格 p10 88.39%，沒有格低於 80%；E02 94.53%、E09 95.75%、E10 95.16%。這些不是成功率；hard-quality 只有 6/140 真正達滿品質。研究與球色 smoke 見 [探針紀錄](../reports/normal-reference/probe.md)。
- `generic-craft-external-reference-v2.1.0` 是目前採用的 Rust 與 Web solver identity。它保留固定 Artisan Expert decision tree 作 fallback，只在當前 state 能以成功率 100% 的技能，對所有 declared next conditions 證明最多四招內滿品質完工時接管；每一步收到玩家實際回報後重新證明。v2.0 三步版與四步實驗 identity 都保留為 immutable replay，不改寫舊 evidence。
- 第三方 Rust 整合已新增 `main_solver` 穩定 façade、英文優先的雙語 quick start、可編譯 example、外部 crate contract test 與 CI gate。專案原創程式碼已採 MIT；包含 Artisan 衍生實作的 core crate 以 `MIT AND BSD-3-Clause` 標示。這次沒有修改 v2.1 選招行為或 Web ABI，crate 仍保持 `publish = false`，直到另行決定是否發布套件。
- 修正前 v1.12 full-run 仍是舊 binary 的歷史 outcome snapshot，但不再是產品資訊邊界下可沿用的 policy baseline。未來若有新 candidate，必須 fresh 執行修正後 v1.12 與 candidate；既有 +19.828 pp／+7.869 pp 等 uplift 不用來宣稱目前 binary 已通過相同 gate。完整原因與修正見 [球色資訊邊界與撤回報告](../reports/generic-cosmic-overnight/condition-information-boundary-and-option-planning-20260831.md)。
- `generic-craft-route-portfolio-exp-normal-route-certificate` 與 `generic-craft-route-portfolio-exp-condition-option-planning` 已在 2026-08-31 撤回，identity、策略路線與候選專屬效能調整均已從 Rust 移除。400-case bounded gate 雖有完成 +1、檔位 +22、滿品質 +11，但 337／400 完全持平且 wall time 約為 v1.12 的 4.4 倍；實際 unattended 嘗試只完成 2／50 shards，另有 7 次整段 30 分鐘 timeout 與 4 次中斷，成本不適合繼續投入。舊 run 不可啟動或續跑。
- `generic-craft-route-portfolio-v1.14.0` 已被完整 64-seed 三臂結果否決，不採用、不續跑。32,000 paired cases 中，v1.14 對 v1.12 完成 27,338→27,390、滿品質 18,640→18,889，但 paired 滿品質仍是 1,195 勝／946 敗；對 Artisan 則是滿品質 18,889／23,963（59.028%／74.884%）、1,340 勝／6,414 敗，且 50 families 中 36 個較低。hard-quality 48.55% 對 Artisan 63.20%，Master 30.68% 對 67.97%。Artisan 的 2,224 個 action-limit 與較長路線不能抵銷這個玩家結果差距。完整判讀見 [64-seed 三臂報告](../reports/generic-cosmic-overnight/generic-native-v114-vs-v112-vs-artisan-balanced-e02-e03-e07-e09-e10-2world-64seed-20260903.md)。
- v2.0 的 64-seed overnight 已完成 50／50 shards、32,000 paired cases、0 failed：相對 Artisan，滿品質 24,003→24,138（75.009%→75.431%，135 勝／0 敗），完成 27,493→27,562（85.916%→86.131%，69 勝／0 敗）。五套裝備、兩個 world、14 個 hard-quality families 與 family × equipment × world 都是正增或持平；34 families 正增、16 持平、0 負向。Candidate 0 illegal／policy-null，推薦 p95 0.365 ms。這是 synthetic／assumed-world evidence，不是真實自然成功率；它是 v2.0 當時取代 v1.12 與純 Artisan 的採用依據，現在保留為 v2.1 的三步基線。完整四表見 [64-seed 報告](../reports/generic-cosmic-overnight/generic-native-full-quality-certificate-vs-artisan-balanced-e02-e03-e07-e09-e10-2world-64seed-20260904.md)。
- v2.1 四步版相對歷史 v1.12 的 64-seed 全 10 裝備／兩 world run 已完成 50／50 shards、64,000 paired cases。滿品質 27,649→39,232（+18.0984 pp），完成 51,445→51,008（−0.6828 pp）；`balanced-iid` 完成 +5.6250 pp，`normal-heavy-iid` −6.9906 pp，50 families 的滿品質 44 正／6 負。使用者已明確接受此品質優先交換；它不是全面支配 v1.12 的宣稱。四步相對 v2.0 的隔離 bounded evidence 為滿品質 +21／0、完成 +10／0。完整歸因、負向 cells 與 candidate-only 時間見 [v2.1 採納報告](../reports/generic-cosmic-overnight/v210-adoption-review-20260907.md)。五步仍未採用；蒸餾 Artisan 與 fallback 替換暫停。
- Master objective extension 是本輪唯一足夠一致、但尚未獨立實作的假說：960 paired cases 完成 945→960，所有 equipment／world 的平均 continuous utility 為正，但滿品質尾端淨 −8。若重開，應以新的描述性 identity 單獨驗證，不帶回 condition option／all-Normal certificate 的昂貴搜尋。
- 修正前低滿品質診斷的七個收藏品 families，在 Raphael E02／E09 全普通球參考也都無法滿品質，主要是能力壓力。真正的 route gap target 最新為完成 +1、檔位 +2、滿品質 +2；F29／E09 與 F11／E02 hard 被救到滿品質，但 F29／E02 掉一檔。若未來重開相關策略，必須原樣檢查這個 family × equipment 交換。F36／F46／F19 hard-quality 的 Raphael E02／E09 也不能滿品質，仍屬能力壓力。
- 使用者已在 2026-08-30 恢復 Web implementation，要求把 POC 全數移除並以 Frozen Rabbit's Cosmic（冷凍兔肉的宇宙）正式 UI 骨架重建。Web 骨架已包含姊妹站對齊的 Sidebar、Vue Router、四語系、明暗模式、首訪語言 Popup、贊助／GitHub 外連與設定；「從任務開始」已接上 280 張任務卡、任務／物品搜尋、職業／難度／星球／時段／天氣篩選與物品明細。任務名稱以 mission recipe ID 對接固定四語來源；英／日／簡中各覆蓋 280 筆，繁中目前覆蓋渴望灣的 88 筆，其餘回退英文。巧匠裝備設定檔頁已依 Tome 的列表／編輯器結構完成，支援八職業共用、自訂檔、最終面板、從既有 50 食物／12 藥品資料搜尋並保存實際食藥、遺物工具效果、專家狀態與 localStorage；職業選擇收進獨立 dialog。任務明細要求選定製作物品與該職業可用的裝備設定檔；開始後建立只存在記憶體的 craft session，並在 Sidebar 裝備下方動態顯示求解器入口。求解器頁已接上 v2.1 production Rust WASM，呈現任務／職業、可重置切換的同任務物品、與任務視窗一致的裝備設定檔簡要標示、作業／品質／耐久／CP 及下一步技能。一般 100% 技能只需直接點下一球色便會合併記錄推薦技能並立即重新求解；非必定成功技能才先回報成敗。球色採填滿圓球與遊戲指南對應色；觀察會正常要求下一球，即使連續推薦同一技能也會重建回報狀態；好兆頭等 forced transition 只顯示唯一下一球，不另加泛用繼續按鈕。終局前按鈕會預告製作完成／失敗；完成態提高視覺權重，多物品任務以物品圖示直接導向並重置下一件，卡內不重複重新開始操作。頁面亦支援合法替代技能、跨步重複點擊鎖、撤回後重建 planner memory、重置，點擊另一任務則直接替換整個 session。
- Route-aware learned teacher 方向已在 consensus closed-loop gate 觸發停止條件；本輪也明確撤回「以 Artisan action label 蒸餾成 runtime policy」的提案，因為工程解耦不足以構成不同產品。不擴 seeds、不生成大量 labels、不建立蒸餾 runtime／artifact；歷史 exporter／teacher evidence 只保留在 `reports/learned-candidate-scorer/`。
- 主戰正式支援情境是有食物與藥的 E02／E09；E03／E10 涵蓋專家，E05／E07 涵蓋合理鑲嵌差異。未食藥或明顯不足裝備保留為 best-effort 壓力證據。
- 2026-09-02 使用者將產品與後續 solver 迭代收斂成單一預設策略（code 中仍稱 `Balanced`）。Stable／Aggressive 不進 UI、release gate、overnight 或新策略調整；既有 Rust enum／solver identities 與 evaluator parsing 暫時只為歷史 evidence、舊 protocol 與可重播性保留。一般收藏品以完成後跨過 100／300／700／滿品質等有意義檔位為主要收益；HQ／Master 優先保住滿品質尾端，不以未跨檔的小幅平均增加抵銷。
- v1.13 的 Balanced-only 64-seed run 已完成 50／50 shards、32,000 paired cases、0 failed。總完成 27,338→27,548、滿品質 18,640→19,168，但 paired completion 是 1,046 勝／836 敗，且步數幾乎全面增加；這證明球色排程有能力提升，卻沒有合理守住原本會完成的案例，因此 v1.13 未採用也不續跑。四表留在 [完整報告](../reports/generic-cosmic-overnight/generic-native-v113-vs-v112-balanced-e02-e03-e07-e09-e10-2world-64seed-20260902.md)。更早的三風險 run 在 15／150 shards 安全中斷，亦不再續跑或跨 immutable manifest 搬用。
- Solver 的數字版號只代表經驗證的有意義進步。v2.1 已將四步 certificate 升為採用版；v2.0 與 v1.12 只保留歷史重播，v1.14 已否決。後續 candidate 可在同一 family × equipment × world 內用跨 seed 淨收益判斷；跨 family、equipment 或 world 的交換必須逐軸揭露並衡量利益，無法明確決斷時交由使用者裁決。
- Web compute owner 已選定 Rust→WASM，不另建 TypeScript v1.12 複本。`rust-web-planner-abi-v1` 的 stateful bridge 在 50 families × E09 三 risk ＋ E10 Balanced 的 200 cases／6,415 recommendations，以及 F36／F46 128 cases／7,553 recommendations 都與 native v1.12 0 action／final-context mismatch。Broad Node-WASM p95 27.36 ms、p99 44.09 ms、max 143.12 ms；artifact 552,843 bytes、run-end memory 約 2.82 MB。這是 engineering evidence，不是 target-device browser gate；implementation `921aaec`，完整決策見 [Rust→WASM report](../reports/web-runtime/rust-wasm-core-decision-20260830.md)。
- Web 已移除 `@frozen-rabbit-expert/solver` runtime dependency 與 POC workers，改由 persistent browser Worker 載入 `native/craft-kernel-web` production WASM；ABI／policy 固定為 `rust-web-planner-abi-v1`／v2.1，主執行緒以 3 秒 watchdog fail closed。固定 F36 Web contract test 直接載入 artifact 並要求與 native v2.1 同步。獨立 Rust fast solver 尚未完成，因此目前 timeout／Worker／WASM failure 只明確報錯，不回退舊 TypeScript；這是使用者批准的第一階段邊界，不代表最終雙求解器 gate 已完成。
- Web 開源相依盤點發現 `@primeuix/themes` 3.0.0 已改用非 MIT 的商業／community 條款；目前已固定回 2.0.3 MIT，lockfile 亦不再含 `@primeui/license-manager`。這只整理散布權利與可重現相依，沒有改變 UI 設計或 solver。

## 已決定但尚未完成的 runtime 契約

- 主要求解器每一步最多等待 3 秒。
- 獨立快速求解器使用固定計算預算，在指定目標裝置的 p95 小於 100ms，並同時報告 p99 與 max。
- 快速求解器在合法、非終局且至少有一個合法技能的 state 必須回傳技能；終局、無合法技能或損壞輸入不算 policy-null。
- 快速求解器依序保護：合法性、避免立即確定失敗、保留可證明完工路線、依預設策略追求有意義品質、最後提供誠實 best-effort。
- 若較深入比較接近時間上限，最終 bounded selector 只掃描合法技能並立即回傳；它不是舊五配方 guide。
- 玩家採用主要求解器、快速求解器或自行選擇的合法技能後，下一步都以實際 state／history 重新嘗試主要求解器。

## Session 與資料

- Web 持久化裝備、語言、明暗模式與首訪語言設定完成狀態。任務資料另以 manifest、content-addressed gzip bundle 與 IndexedDB active／pending 快取管理；快取失敗仍可由網路載入，不會破壞既有 active 版本。進行中的配方、event path、製作狀態與其 UI 只存在記憶體；重新整理後回到設定畫面。
- 玩家主動匯出的 debug session 仍可用於 replay；它不是自動 browser persistence。
- 432 配方的 catalog identity、recipe／objective／condition binding 與固定來源由 `packages/data` 和 importer 擁有，不在本檔複製 hash。

## 已知後續產品落差

- Protocol 仍保存 `development-preview` 等舊成熟度欄位；產品已決定不對配方分級，後續 session／export implementation task 應乾淨移除。
- 任務 catalog、選擇與裝備設定檔已接上記憶體內 craft session；預設策略的逐步推薦、成功／球色回報、合法替代技能、undo 與重置也已進入正式 UI。玩家風險選擇已從產品計畫移除；尚未完成的是錯誤狀態 resync、debug export 與獨立 fast solver。技能名稱已依 [官方能工巧匠指南](https://www.ffxiv.com.tw/web/intro/guide/crafting_gathering/weaver/index.html) 校正。

## Evidence pointers

- Rust solver 版本變更史：`.agents/solver_version_history.md`。
- 目前工作入口：[overnight_review_brief.md](overnight_review_brief.md)；v2.1 是採用基線，目前只待決是否用 256 seeds 量第四步相對 v2.0 的純增量或更細 cell 邊界，長跑仍由使用者啟動。
- Rust whole-episode protocol：`native/craft-kernel/src/generic_episode.rs`、`native/craft-kernel/src/bin/craft-kernel-generic-episode.rs`；新核心：`native/craft-kernel/src/generic_solver/portfolio/`；既有能力及版本路由：`native/craft-kernel/src/generic_solver.rs`。
- Web 現況：`apps/web/src/composables/useActiveCraftSession.ts`、`apps/web/src/runtime/planner/episode.ts`、`apps/web/src/views/CraftSolverView.vue`、`apps/web/src/workers/`。
- 公開 Rust API：`native/craft-kernel/src/main_solver.rs`、`native/craft-kernel/examples/main_solver.rs`、`native/craft-kernel/tests/main_solver_api.rs`。
- Solver identities：`packages/solver/src/types.ts` 與 Rust protocol source。
- Catalog：`packages/data/src/cosmicExpertCatalog.ts`、`tools/import-cosmic-expert-recipes/`。
- 評測操作：`.agents/workflows/run-generic-overnight-evaluation.md`。
- 兩組四表生成器與歷史檔：`tools/evaluate-generic-cosmic-overnight/overview-report.mjs`、`reports/generic-cosmic-overnight/`。
