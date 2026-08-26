# 目前狀態

`last_verified: 2026-08-26`

本檔只摘要目前 checkout 與已決定的下一個判斷點。永久產品與技術契約由 routing owner 管理；單次評測結果留在 evaluator output。

## 產品範圍

- Catalog 目前包含 432 個宇宙探索高難度配方，按會影響求解的數值、condition 與 objective 分為 50 個 mechanics families。
- 相同 family 目前假設具有相同求解條件；只有新的遊戲實證出現矛盾時才建立例外。
- 網頁正式發布採單一整體 gate。發布時預設全部 432 個配方都已足夠可靠，不在產品中維護配方成熟度分級。
- 跨件材料、分數、倒數與 Duty Action 的 Mission controller 已移出目前承諾範圍；未來可重新決定是否放回本專案、另立專案或不做。
- 目前沒有 live 使用者，因此採用新核心時可乾淨切換，不為尚未存在的相容性需求保留多套 runtime。

## Solver 與 Web

- 舊 TypeScript solver 已完全凍結，只可作歷史參考與 migration evidence；不再接受策略迭代、調參或新測試投資。
- 現在的策略迭代、測試與改善只在 Rust 進行。
- 使用者已確認 v0.22 overnight run 完成，並將固定四表定為每次 overnight 的最初判讀入口。
- 完整 overnight 成功收尾或由 status-only 確認完整時，runner 會自動生成 Git 可追蹤的四表初判檔，固定呈現 Balanced × balanced-iid × E02／E09，不含策略判讀。每個主要量尺只顯示 candidate，後方小括號顯示 candidate−baseline 差值；不另外展開 baseline 數值。長度只保留完成／未完成的 p50／max，優先顯示推進工序數 `S`，舊 evidence 沒保存 `S` 時回退顯示全部技能數 `A`。這不是任務時間 gate，完整長尾仍由 raw evidence 分析。路徑與重建方式由 long-run workflow 擁有。
- 既有 `generic-night-01` 與 Rust v0.18／v0.20／v0.21／v0.22／v0.30 六份四表都可由原始 completed shards 重算；最舊 `generic-night-01` 只有單臂資料，因此只顯示 candidate，不假造括號差值。
- 目前 Rust comparison baseline 是 `generic-craft-condition-set-portfolio-v0.22.0`；最新完成 overnight 的 candidate 是 `generic-craft-specialist-resource-guard-v0.30.0`。v0.30 保留 v0.25 的 objective／shared continuation，新增 progress-only 品質護欄與完工 bank、hard-quality 專家資源使用，並修正掌握仍有效時的低耐久誤判。
- Objective 以 recipe `qualityMax` 作唯一品質上限：hard-quality 追求滿品質；一般 progress-only 收藏品使用 100／300／700／滿品質四檔；HQ 類使用 50%／75%／100% HQ protected floors 與完整 HQ 機率曲線；Master 收藏品使用 0 到 `qualityMax` 的連續品質價值。三種 risk 共用完整且單調上升的品質效用，只以 protected floor、失敗分支與完工路線的下行成本表達風險承受度。
- v0.30 的 bounded gate 覆蓋 50 families × 10 equipment × Balanced-IID／Normal-heavy × 2 seeds。Stable／Balanced／Aggressive 共 6,000 paired cases，utility 分別改善 0.248／0.505／0.584 個百分點，completion `+1/+2/+2`、滿品質 `+3/+4/+6`，三檔皆 0 paired loss，沒有新增 failed／illegal／action-limit。這是送交 overnight 的 development gate，不是採用結論。
- v0.30 對 v0.22 的 3-worker smoke 已完成 3/3 shards、120 episodes、0 failed；同一命令的 resume 沒有重算，`status-only` 沒有啟動 worker。完整身份與命令由 `overnight_review_brief.md` 擁有。
- v0.30 對 v0.22 的完整 run 已完成 150/150 shards、384,000 paired cases、0 failed shards，raw run 與自動四表都已保存。完成 invocation 的 manifest 實際記錄 4 workers；run ID 中的 `w3` 只是原始名稱，不能覆蓋 immutable scheduling metadata。這是待分析 evidence，不是採用結論。
- 下一個 Rust 結構目標是統一 candidate portfolio：Budgeted、Semantic、progress、quality、condition、resource 與 specialist producers 只提交 legal action 與可比較證據，再由單一 scorer 依完工證明、完整品質 utility、風險、資源與 action budget 選擇。v0.30 是這項重構前的 behavior checkpoint。
- Release-native 日間矩陣的單步推薦平均約 0.54–0.65ms，觀察到的單次 max 約 20–30ms，遠低於 3 秒主求解器上限；目前 crate 尚未提供 WASM target／binding，因此這些不是瀏覽器或目標裝置 latency claim。
- 下一個產品決策是核對 v0.30 對 v0.22 的完整 raw evidence，依逐 family／裝備／risk／world、失敗型態、工序長度與 latency 決定繼續 Rust 迭代或凍結採用 identity。4-worker 完成紀錄只描述本次執行，不升格為通用熱校準結論。
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
- v0.30 overnight 的改動假說與報告判讀契約：`.agents/overnight_review_brief.md`。
- Rust whole-episode protocol：`native/craft-kernel/src/generic_solver.rs`、`native/craft-kernel/src/main.rs`。
- Web 現況：`apps/web/src/composables/useCraftSession.ts`、`apps/web/src/workers/`。
- Solver identities：`packages/solver/src/types.ts` 與 Rust protocol source。
- Catalog：`packages/data/src/cosmicExpertCatalog.ts`、`tools/import-cosmic-expert-recipes/`。
- 評測操作：`.agents/workflows/run-generic-overnight-evaluation.md`。
- 四表生成器與歷史檔：`tools/evaluate-generic-cosmic-overnight/overview-report.mjs`、`reports/generic-cosmic-overnight/`。
