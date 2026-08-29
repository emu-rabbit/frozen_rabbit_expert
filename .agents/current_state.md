# 目前狀態

`last_verified: 2026-08-30`

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
- `generic-craft-route-portfolio-v1.12.0` 是目前採用的 Rust solver identity。它把已完成 full-run 驗證的 completion-aware 實驗行為原樣版本化：Balanced 一般收藏品保留九球色機會提案與 funded routes，已有 bounded deterministic finish 時保護成功／失敗分支的完工能力；HQ／Master、Stable 與 hard-quality 使用 v1.1 基準。Selector 只讀 objective、risk、mechanics、condition 與 state，不讀 family／equipment ID、seed 或未來 RNG。
- v1.12 的 150/150 shards full run 已完成：新執行 384,000 candidate episodes，配對 384,000 個已核對的 v1.1 歷史 rows，0 illegal、0 valid-nonterminal policy-null、0 新增 action-limit。正式支援 Balanced 一般收藏品 35,712 cases 的完成淨增加 63、完成成品檔位 +19.828 pp、滿品質 +7.869 pp，並保留 v1.11 檔位／滿品質收益的 97.939%／96.398%；31 個 family aggregate 都是正檔位淨值。完整判讀與證據邊界見 [v1.12 adoption review](../reports/generic-cosmic-overnight/v112-adoption-review-20260829.md)，固定四表見 [overnight output](../reports/generic-cosmic-overnight/generic-native-completion-aware-vs-v110-history-64seed-20260829.md)。
- 正式支援範圍只有兩個 paired completion loss：F25／E05／`normal-heavy`／seed 47 與 F09／E05／`normal-heavy`／seed 52。它們顯示 8-action finish witness 尚未進入 horizon 前仍可能過度延後進展；目前沒有 family aggregate 反向，也沒有足夠證據為 2/35,712 cases 擴大全域 search。
- Condition-specific proposals 的直接 causal evidence 仍是 bounded candidate-vs-ablation：一般收藏品完成持平、完成成品檔位 +5.38 pp、滿品質 −1.08 pp。Full run 證明整體策略泛化，不能把全部 +19.828 pp 歸因於讀球；沒有採用決策需要再跑完整 ablation。
- F36／F46 hard-quality bounded study 已依停止條件結案，沒有建立 candidate 或新 solver 版號。同一組 64 條 E10 tapes 的 E09→E10 拆解顯示：F36 的面板增益為 7→12、開放 specialist 後為 12→24；F46 的面板增益為 0→0、開放 specialist 後才為 0→8。舊 v1.3 雖救回 F36 seed 53，卻把既有 F46 seed 15 success 變成 failure，沒有可泛化且無 regression 的 selector signal。完整證據見 [bounded study](../reports/generic-cosmic-overnight/f36-f46-hard-quality-bounded-study-20260830.md)。
- 下一個判斷點是依 [active brief](overnight_review_brief.md) 建立 Web vertical slice，比較 Rust→WASM 與新的 TypeScript implementation，選定 compute owner；不再以擴大 Rust hard-quality seeds 延後 Web。
- 主戰正式支援情境是有食物與藥的 E02／E09；E03／E10 涵蓋專家，E05／E07 涵蓋合理鑲嵌差異。未食藥或明顯不足裝備保留為 best-effort 壓力證據。
- Balanced 是產品預設。玩家結果以完成製作後跨過 100／300／700／滿品質等有意義檔位為主要收益；HQ／Master 優先保住滿品質尾端，不以未跨檔的小幅平均增加抵銷。
- Solver 的數字版號只代表經驗證的有意義進步；v1.12 已通過 full-run gate。後續 hard-quality 試驗先使用描述性 identity，只有再通過事前 bounded gate 才升版。
- 新策略、測試與改善只在 Rust。Web 目前仍執行凍結 TypeScript policy；solver value gate 已通過，現正以 ABI、parity、latency、bundle／memory 與維護成本實測選擇 Rust→WASM 或新的 TypeScript Web 核心。

## 已決定但尚未完成的 runtime 契約

- 主要求解器每一步最多等待 3 秒。
- 獨立快速求解器使用固定計算預算，在指定目標裝置的 p95 小於 100ms，並同時報告 p99 與 max。
- 快速求解器在合法、非終局且至少有一個合法技能的 state 必須回傳技能；終局、無合法技能或損壞輸入不算 policy-null。
- 快速求解器依序保護：合法性、避免立即確定失敗、保留可證明完工路線、依風險偏好追求有意義品質、最後提供誠實 best-effort。
- 若較深入比較接近時間上限，最終 bounded selector 只掃描合法技能並立即回傳；它不是舊五配方 guide。
- 玩家採用主要求解器、快速求解器或自行選擇的合法技能後，下一步都以實際 state／history 重新嘗試主要求解器。

## Session 與資料

- Web 只持久化裝備與風險偏好。進行中的配方、event path、狀態與 UI 只存在記憶體；重新整理後回到設定畫面。
- 玩家主動匯出的 debug session 仍可用於 replay；它不是自動 browser persistence。
- 432 配方的 catalog identity、recipe／objective／condition binding 與固定來源由 `packages/data` 和 importer 擁有，不在本檔複製 hash。

## 已知後續產品落差

- Protocol、scenario 與 UI 仍保存 `development-preview` 等舊成熟度欄位；產品已決定不對配方分級，後續 implementation task 應乾淨移除。
- `apps/web/src/i18n/messages.ts` 的少數技能名稱仍不是繁中官方用語，例如 `hastyTouch` 與 `daringTouch`；後續 UI copy task 應依 [官方能工巧匠指南](https://www.ffxiv.com.tw/web/intro/guide/crafting_gathering/weaver/index.html) 校正。

## Evidence pointers

- Rust solver 版本變更史：`.agents/solver_version_history.md`。
- 目前工作入口：[overnight_review_brief.md](overnight_review_brief.md)；目前是 Web core adoption，不是待啟動的 unattended overnight。
- Rust whole-episode protocol：`native/craft-kernel/src/generic_episode.rs`、`native/craft-kernel/src/bin/craft-kernel-generic-episode.rs`；新核心：`native/craft-kernel/src/generic_solver/portfolio/`；既有能力及版本路由：`native/craft-kernel/src/generic_solver.rs`。
- Web 現況：`apps/web/src/composables/useCraftSession.ts`、`apps/web/src/workers/`。
- Solver identities：`packages/solver/src/types.ts` 與 Rust protocol source。
- Catalog：`packages/data/src/cosmicExpertCatalog.ts`、`tools/import-cosmic-expert-recipes/`。
- 評測操作：`.agents/workflows/run-generic-overnight-evaluation.md`。
- 四表生成器與歷史檔：`tools/evaluate-generic-cosmic-overnight/overview-report.mjs`、`reports/generic-cosmic-overnight/`。
