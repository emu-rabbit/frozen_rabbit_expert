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
- 使用者已確認 v0.22 overnight run 完成，並將固定四表定為每次 overnight 的最初判讀入口；策略採用仍由後續分析另行決定。
- 完整 overnight 成功收尾或由 status-only 確認完整時，runner 會自動生成 Git 可追蹤的四表初判檔，固定呈現 Balanced × balanced-iid × E02／E09，不含策略判讀；路徑與重建方式由 long-run workflow 擁有。
- 下一個產品決策仍是依 v0.22 結果與後續策略 evidence，選擇繼續 Rust 迭代，或採用某個 Rust 結果接入 Web。
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

## 本次已知但不在文件 task 修改的 code 落差

- Protocol、scenario 與 UI 仍保存 `development-preview` 等舊成熟度欄位；產品已決定不對配方分級，後續 implementation task 應乾淨移除。
- `apps/web/src/i18n/messages.ts` 的少數技能名稱仍不是繁中官方用語，例如 `hastyTouch` 與 `daringTouch`；後續 UI copy task 應依 [官方能工巧匠指南](https://www.ffxiv.com.tw/web/intro/guide/crafting_gathering/weaver/index.html) 校正。
- `README.md` 含過時 current-state 敘述，但它是使用者保護的 GitHub 門面，本次不修改，也不作 agent truth。

## Evidence pointers

- Rust whole-episode protocol：`native/craft-kernel/src/generic_solver.rs`、`native/craft-kernel/src/main.rs`。
- Web 現況：`apps/web/src/composables/useCraftSession.ts`、`apps/web/src/workers/`。
- Solver identities：`packages/solver/src/types.ts` 與 Rust protocol source。
- Catalog：`packages/data/src/cosmicExpertCatalog.ts`、`tools/import-cosmic-expert-recipes/`。
- 評測操作：`.agents/workflows/run-generic-overnight-evaluation.md`。
- 四表生成器與歷史檔：`tools/evaluate-generic-cosmic-overnight/overview-report.mjs`、`reports/generic-cosmic-overnight/`。
