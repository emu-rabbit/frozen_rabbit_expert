# 目前狀態

`last_verified: 2026-09-02`

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
- `generic-craft-route-portfolio-v1.12.0` 仍是目前採用的 Rust solver identity；但 2026-08-31 稽核發現 evaluator-private condition weights 曾穿過 whole-episode／Web／dataset 邊界。本 checkout 已把權重從全部決策 API 移除，舊 MPC 只由 declared condition mask 建立等權重內部 model，並移除舊 MPC seed／semantic cache 的 recipe ID。全部目前編譯的 solver／research identities 都由 boundary audit 驗證 first recommendation 不隨私有權重改變；solver 仍不讀 equipment ID、seed 或未來 RNG。
- 修正前 v1.12 full-run 仍是舊 binary 的歷史 outcome snapshot，但不再是產品資訊邊界下可沿用的 policy baseline。未來若有新 candidate，必須 fresh 執行修正後 v1.12 與 candidate；既有 +19.828 pp／+7.869 pp 等 uplift 不用來宣稱目前 binary 已通過相同 gate。完整原因與修正見 [球色資訊邊界與撤回報告](../reports/generic-cosmic-overnight/condition-information-boundary-and-option-planning-20260831.md)。
- `generic-craft-route-portfolio-exp-normal-route-certificate` 與 `generic-craft-route-portfolio-exp-condition-option-planning` 已在 2026-08-31 撤回，identity、策略路線與候選專屬效能調整均已從 Rust 移除。400-case bounded gate 雖有完成 +1、檔位 +22、滿品質 +11，但 337／400 完全持平且 wall time 約為 v1.12 的 4.4 倍；實際 unattended 嘗試只完成 2／50 shards，另有 7 次整段 30 分鐘 timeout 與 4 次中斷，成本不適合繼續投入。舊 run 不可啟動或續跑。
- Checkout 目前的 active candidate 是 `generic-craft-route-portfolio-v1.13.0`，v1.12 仍是採用基礎。v1.13 移除 v1.12 依 objective／risk 回到 v1.1 的頂層路由，讓預設策略的所有目標共用同一 route portfolio；依當前球色的實際 mechanics 收益動態提出作業、品質、混合、準備與資源工作，允許球色工作中斷後恢復既有 funded route。未投入且當下吃不到球色、明確更適合配方宣告之另一球色的準備／資源工作，會讓位給能立即利用當前球色的工作；已支付 setup 且 consumer 可用時，除非新工作能吃到當前球色、擁有完整 funded continuation 或立即完工，否則不得棄置原工作。這不是 recipe／equipment ID 或技能白名單。
- 這套行為以描述性 identity 完成 50 families × 三風險 × E02／E09 × `balanced-iid`／`opportunity-scarce-iid` × 4 seeds 的 2,400 paired gate，fresh v1.12→candidate 為完成 1,954→1,984、滿品質 1,162→1,261、utility total 1,555.176→1,654.037；配對完成 62 勝／32 敗、滿品質 181 勝／82 敗。三風險、兩 worlds、兩裝備及四個 seeds 的 utility delta 都為正，hard-quality 完成／滿品質 59 勝／22 敗，0 illegal／policy-null／action-limit。候選 p95 63.992 ms、p99 119.352 ms、max 503.552 ms；150／150 shards 在 6 分 18 秒完成且 0 timeout。一般收藏品完成 2 勝／8 敗、HQ 0 勝／2 敗仍是 full-run 的明示採用風險，不能用品質收益遮掉。這個結構 gate 足以命名 v1.13 candidate，但不代表採用或取代 v1.12；完整契約見 [active brief](overnight_review_brief.md)，四表見 [readiness gate 報告](../reports/generic-cosmic-overnight/condition-work-readiness-gate-50f-3risk-2world-4seed-20260902.md)。未來球色負向保留稅、Normal bridge bonus／候選與便宜 greedy continuation 都因 broad completion／滿品質退步而移除，沒有留在 runtime 疊補丁。
- Master objective extension 是本輪唯一足夠一致、但尚未獨立實作的假說：960 paired cases 完成 945→960，所有 equipment／world 的平均 continuous utility 為正，但滿品質尾端淨 −8。若重開，應以新的描述性 identity 單獨驗證，不帶回 condition option／all-Normal certificate 的昂貴搜尋。
- 修正前低滿品質診斷的七個收藏品 families，在 Raphael E02／E09 全普通球參考也都無法滿品質，主要是能力壓力。真正的 route gap target 最新為完成 +1、檔位 +2、滿品質 +2；F29／E09 與 F11／E02 hard 被救到滿品質，但 F29／E02 掉一檔。若未來重開相關策略，必須原樣檢查這個 family × equipment 交換。F36／F46／F19 hard-quality 的 Raphael E02／E09 也不能滿品質，仍屬能力壓力。
- 使用者已在 2026-08-30 恢復 Web implementation，要求把 POC 全數移除並以 Frozen Rabbit's Cosmic（冷凍兔肉的宇宙）正式 UI 骨架重建。Web 骨架已包含姊妹站對齊的 Sidebar、Vue Router、四語系、明暗模式、首訪語言 Popup、贊助／GitHub 外連與設定；「從任務開始」已接上 280 張任務卡、任務／物品搜尋、職業／難度／星球／時段／天氣篩選與物品明細。任務名稱以 mission recipe ID 對接固定四語來源；英／日／簡中各覆蓋 280 筆，繁中目前覆蓋渴望灣的 88 筆，其餘回退英文。巧匠裝備設定檔頁已依 Tome 的列表／編輯器結構完成，支援八職業共用、自訂檔、最終面板、從既有 50 食物／12 藥品資料搜尋並保存實際食藥、遺物工具效果、專家狀態與 localStorage；職業選擇收進獨立 dialog。任務明細要求選定製作物品與該職業可用的裝備設定檔；開始後建立只存在記憶體的 craft session，並在 Sidebar 裝備下方動態顯示求解器入口。求解器頁已接上 v1.12 production Rust WASM，呈現任務／職業、可重置切換的同任務物品、與任務視窗一致的裝備設定檔簡要標示、作業／品質／耐久／CP 及下一步技能。一般 100% 技能只需直接點下一球色便會合併記錄推薦技能並立即重新求解；非必定成功技能才先回報成敗。球色採填滿圓球與遊戲指南對應色；觀察會正常要求下一球，即使連續推薦同一技能也會重建回報狀態；好兆頭等 forced transition 只顯示唯一下一球，不另加泛用繼續按鈕。終局前按鈕會預告製作完成／失敗；完成態提高視覺權重，多物品任務以物品圖示直接導向並重置下一件，卡內不重複重新開始操作。頁面亦支援合法替代技能、跨步重複點擊鎖、撤回後重建 planner memory、重置，點擊另一任務則直接替換整個 session。
- Route-aware learned teacher 方向已在 consensus closed-loop gate 觸發停止條件；不擴 seeds、不生成大量 labels，也不與本輪 condition-option candidate 混合。歷史 exporter／teacher evidence 保留在 `reports/learned-candidate-scorer/`。
- 主戰正式支援情境是有食物與藥的 E02／E09；E03／E10 涵蓋專家，E05／E07 涵蓋合理鑲嵌差異。未食藥或明顯不足裝備保留為 best-effort 壓力證據。
- 2026-09-02 使用者將產品與後續 solver 迭代收斂成單一預設策略（code 中仍稱 `Balanced`）。Stable／Aggressive 不進 UI、release gate、overnight 或新策略調整；既有 Rust enum／solver identities 與 evaluator parsing 暫時只為歷史 evidence、舊 protocol 與可重播性保留。一般收藏品以完成後跨過 100／300／700／滿品質等有意義檔位為主要收益；HQ／Master 優先保住滿品質尾端，不以未跨檔的小幅平均增加抵銷。
- 原 `generic-native-v113-vs-v112-e02-e03-e07-e09-e10-balanced-normal-heavy-64seed-20260902` 三風險 run 已在 15／150 shards 後安全中斷，其中 Stable／Balanced／Aggressive 各 5 shards，0 failed；它不再續跑。新的 Balanced-only run 已完成 50／50 shards、32,000 paired cases、0 failed，四表見 [完整報告](../reports/generic-cosmic-overnight/generic-native-v113-vs-v112-balanced-e02-e03-e07-e09-e10-2world-64seed-20260902.md)。結果尚待依 active brief 判讀，v1.13 仍只是候選；舊 run 的 5 個 Balanced shards 不跨 immutable manifest 搬入正式 run。
- Solver 的數字版號只代表經驗證的有意義進步。v1.12 identity 保留為目前採用基礎；球色工作排程已是 v1.13 數字版候選並取得完整 64-seed overnight 評測資格，但在結果通過前不是採用版。
- Web compute owner 已選定 Rust→WASM，不另建 TypeScript v1.12 複本。`rust-web-planner-abi-v1` 的 stateful bridge 在 50 families × E09 三 risk ＋ E10 Balanced 的 200 cases／6,415 recommendations，以及 F36／F46 128 cases／7,553 recommendations 都與 native v1.12 0 action／final-context mismatch。Broad Node-WASM p95 27.36 ms、p99 44.09 ms、max 143.12 ms；artifact 552,843 bytes、run-end memory 約 2.82 MB。這是 engineering evidence，不是 target-device browser gate；implementation `921aaec`，完整決策見 [Rust→WASM report](../reports/web-runtime/rust-wasm-core-decision-20260830.md)。
- Web 已移除 `@frozen-rabbit-expert/solver` runtime dependency 與 POC workers，改由 persistent browser Worker 載入 `native/craft-kernel-web` production WASM；ABI／policy 固定為 `rust-web-planner-abi-v1`／v1.12，主執行緒以 3 秒 watchdog fail closed。固定 F36 Web contract test 已直接載入 artifact 並取得非空 action。獨立 Rust fast solver 尚未完成，因此目前 timeout／Worker／WASM failure 只明確報錯，不回退舊 TypeScript；這是使用者批准的第一階段邊界，不代表最終雙求解器 gate 已完成。

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
- 目前工作入口：[overnight_review_brief.md](overnight_review_brief.md)；球色工作排程是 active overnight candidate，長跑由使用者依該 brief 啟動與監控。
- Rust whole-episode protocol：`native/craft-kernel/src/generic_episode.rs`、`native/craft-kernel/src/bin/craft-kernel-generic-episode.rs`；新核心：`native/craft-kernel/src/generic_solver/portfolio/`；既有能力及版本路由：`native/craft-kernel/src/generic_solver.rs`。
- Web 現況：`apps/web/src/composables/useActiveCraftSession.ts`、`apps/web/src/runtime/planner/episode.ts`、`apps/web/src/views/CraftSolverView.vue`、`apps/web/src/workers/`。
- Solver identities：`packages/solver/src/types.ts` 與 Rust protocol source。
- Catalog：`packages/data/src/cosmicExpertCatalog.ts`、`tools/import-cosmic-expert-recipes/`。
- 評測操作：`.agents/workflows/run-generic-overnight-evaluation.md`。
- 四表生成器與歷史檔：`tools/evaluate-generic-cosmic-overnight/overview-report.mjs`、`reports/generic-cosmic-overnight/`。
