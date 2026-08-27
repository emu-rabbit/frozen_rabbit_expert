# 目前狀態

`last_verified: 2026-08-27`

本檔只摘要目前 checkout 與已決定的下一個判斷點。永久產品與技術契約由 routing owner 管理；單次評測結果留在 evaluator output。

## 產品範圍

- Catalog 目前包含 432 個宇宙探索高難度配方，按會影響求解的數值、condition 與 objective 分為 50 個 mechanics families。
- 相同 family 目前假設具有相同求解條件；只有新的遊戲實證出現矛盾時才建立例外。
- 網頁正式發布採單一整體 gate。發布時預設全部 432 個配方都已足夠可靠，不在產品中維護配方成熟度分級。
- 跨件材料、分數、倒數與 Duty Action 的 Mission controller 已移出目前承諾範圍；未來可重新決定是否放回本專案、另立專案或不做。
- 目前網站尚未上線且沒有 live 使用者，採用新核心時可乾淨切換到選定的 runtime。

## Solver 與 Web

- 舊 TypeScript solver 已完全凍結，只可作歷史參考與 migration evidence；不再接受策略迭代、調參或新測試投資。
- 現在的策略迭代、測試與改善只在 Rust 進行。
- 使用者已確認 v0.22 overnight run 完成，並將固定四表定為每次 overnight 的最初判讀入口。
- 完整 overnight 成功收尾或由 status-only 確認完整時，runner 會自動生成 Git 可追蹤的四表初判檔，固定呈現 Balanced × balanced-iid × E02／E09，不含策略判讀。每個主要量尺只顯示 candidate，後方小括號顯示 candidate−baseline 差值；不另外展開 baseline 數值。長度只保留完成／未完成的 p50／max，優先顯示推進工序數 `S`，舊 evidence 沒保存 `S` 時回退顯示全部技能數 `A`。這不是任務時間 gate，完整長尾仍由 raw evidence 分析。路徑與重建方式由 long-run workflow 擁有。
- 既有 `generic-night-01` 與 Rust v0.18／v0.20／v0.21／v0.22／v0.30 六份四表都可由原始 completed shards 重算；最舊 `generic-night-01` 只有單臂資料，因此只顯示 candidate，不假造括號差值。
- 目前 Rust 研究參考 baseline 是 `generic-craft-specialist-resource-guard-v0.30.0`。第六批已檢測並分析完畢；使用者接受它為有足夠改善幅度、仍有局部小幅缺陷的版本。`generic-craft-condition-set-portfolio-v0.22.0` 保留為第六批的歷史比較對照。
- Objective 以 recipe `qualityMax` 作唯一品質上限：hard-quality 追求滿品質；一般 progress-only 收藏品使用 100／300／700／滿品質四檔；HQ 類使用 50%／75%／100% HQ protected floors 與完整 HQ 機率曲線；Master 收藏品使用 0 到 `qualityMax` 的連續品質價值。三種 risk 共用完整且單調上升的品質效用，只以 protected floor、失敗分支與完工路線的下行成本表達風險承受度。
- v0.30 的完整結果、受益切片、已知代價與因果重播已整理於 [第六批分析報告](../reports/generic-cosmic-overnight/v030-review-20260827/review.md)；跑前假說與 bounded／smoke evidence 留在 [結案 handoff](archive/handoffs/overnight-v030-review-2026-08-27.md)。
- 第六批完整 run 的 150/150 shards、384,000 paired cases 與身份已核對，原始資料及自動四表保持不變。完成 invocation 使用 4 workers；此紀錄只描述該次執行。
- 使用者於 2026-08-27 確認下一步直接建立統一 candidate portfolio、跨步 route intent 與共同 scorer，以 v0.30 為效果基準，追求相當或更好的求解成果、合理成本及更容易改善的結構。實施順序由 [roadmap](roadmaps/broad_solver_implementation_plan.md) 擁有。
- 目前 candidate 是 `generic-craft-route-portfolio-v1.1.0`：以較多共同抽樣及配對增益成本穩定路線比較，保留首步成敗證據、setup／consumer 與 observed-event memory；同時減少單一候選與耐久證明的重複計算。1.x 標示求解器架構世代，Application／Cargo package 與公開發布各自管理。
- v1.1 已完成全部 50 families、兩組主要裝備、三種 risk 的新 seed readiness，另有專家／壓力 world 補測與正確性檢查。必要品質及完整品質有改善訊號，也保留具體弱切片。逐 family 結果及成本見 [開發報告](../reports/generic-cosmic-overnight/v110-development/results.md)；v0.30 繼續作 baseline。
- v1.1 已完成保留決策的效能優化：可行性查詢、最佳耐久上界及單次推薦內續算快取。既有 readiness／壓力案例的非計時結果保持一致，分層雙 worker 成本抽樣支持進入完整 overnight；證據與估時限制見 [效能結果](../reports/generic-cosmic-overnight/v110-performance/results.md)。
- 下一輪維持與 v0.30 相同的完整 64-seed 矩陣、base seed 與案例身份，以 2 workers、10 小時內完成為操作目標。完整 run 已完成 status-only 預檢，待使用者啟動；[active brief](overnight_review_brief.md) 管判讀，[npm commands](../reports/generic-cosmic-overnight/v110-performance/commands.md) 管固定 binary、開始／續跑／狀態。
- Native episode ABI v7 保存每次推薦耗時，report v4 驗證樣本數、總和及最大值，並提供原始樣本合併後的百分位。Worker 配置保留在各次 attempt 與 completed shard，支援後續按 family／equipment／risk／world 追查延遲。
- 正確性、效果驗收與按需診斷依 [algorithm_verification.md](skills/domain/algorithm_verification.md)。選招、路線及 planner context 可依新架構演進；採用判斷看機率效果、重要切片與成本，允許合理的 paired seed 勝負交換。
- 目前成果涵蓋研究 baseline、新架構 candidate 與 development evidence；Web 採用、正式發布、遊戲自然成功率與目標裝置效能各自驗收。本機 native throughput／latency 的適用範圍以結果報告為準。
- Web 採用路徑尚未決定。候選是把 Rust 編譯成 WASM，或根據採用的 Rust 行為建立新的 TypeScript 核心；選擇要以邊界傳遞成本、載入、目標裝置 latency、結果一致性與維護成本實測。舊 TypeScript 不是候選。
- 目前 Web 仍執行凍結的 TypeScript policy，Worker 失敗後由同一 policy 同步重試；這只是現況，不是已完成的目標架構。

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
- 下一輪評測交接入口：[overnight_review_brief.md](overnight_review_brief.md)；下一個結果 task 依此檢查 v1.1 對 v0.30 的完整矩陣、重要切片與成本。
- Rust whole-episode protocol：`native/craft-kernel/src/generic_episode.rs`、`native/craft-kernel/src/bin/craft-kernel-generic-episode.rs`；新核心：`native/craft-kernel/src/generic_solver/portfolio/`；既有能力及版本路由：`native/craft-kernel/src/generic_solver.rs`。
- Web 現況：`apps/web/src/composables/useCraftSession.ts`、`apps/web/src/workers/`。
- Solver identities：`packages/solver/src/types.ts` 與 Rust protocol source。
- Catalog：`packages/data/src/cosmicExpertCatalog.ts`、`tools/import-cosmic-expert-recipes/`。
- 評測操作：`.agents/workflows/run-generic-overnight-evaluation.md`。
- 四表生成器與歷史檔：`tools/evaluate-generic-cosmic-overnight/overview-report.mjs`、`reports/generic-cosmic-overnight/`。
