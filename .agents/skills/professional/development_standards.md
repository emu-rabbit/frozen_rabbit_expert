# 開發實作規範

## 文件角色

本檔規範程式邊界、錯誤分類、測試與版本更新。產品方向看 mission owners；目前實作看 [current_state.md](../../current_state.md)。

## 技術選擇

- Runtime recommendation local-first；離線評測可以使用 native process 與大量 CPU。
- 新的 solver 策略、測試與改善只在 Rust 進行。凍結 TypeScript solver 不接受新功能或調參。
- Web 採用 WASM 或新的 TypeScript 核心尚未決定；沒有採用 task 時不建立第三套 compute。
- 加入 dependency 前說明用途、bundle／binary 影響、license 與維護成本。
- Training／evaluation package 不可進 client bundle。

## Package 邊界

- `packages/data`：canonical catalog、配方與 objective data。
- `packages/domain`：DTO、mechanics types、目前凍結 TS fixtures／migration reference。
- `packages/protocol`：session events、exports 與跨執行環境 contract。
- `packages/simulator`：replay 與離線 simulation helper。
- `packages/solver`：凍結的舊 TypeScript Web solver；不是新策略 owner。
- `packages/policy-lab`：歷史 TypeScript research；不作新 solver 主線。
- `native/craft-kernel`：目前 Rust mechanics／solver／episode compute owner。
- `apps/web`：UI、input、session orchestration 與目前凍結 runtime integration。
- `tools`：import、evaluation、parity、benchmark 與 orchestration。

依賴保持單向；domain／data 不 import UI 或 training，Web 不 import policy-lab。

## 數值與 state

- 整數、倍率、rounding、buff duration、condition transition 與 terminal rule 由 mechanics owner 定義。
- Solver memory 和 `CraftState` 分開；不得為方便策略而竄改客觀 state。
- 玩家偏離後使用實際 action、success 與 condition；不能把推薦 action 當成已執行。
- 不確定的公式或機率標成 assumption，建立 evidence question。

## 錯誤分類

至少分開：

- invalid／corrupted input；
- mechanics mismatch；
- terminal 或無合法技能；
- 主要求解器逾時／錯誤；
- 快速求解器違反 deadline 或回傳空白；
- worker／WASM／native 啟動與傳遞錯誤；
- OOD／未知 evidence envelope；
- storage／export／environment failure。

Runtime 不以舊五配方 guide 靜默救援。主要求解器失敗後使用獨立快速求解器；輸入損壞或沒有合法技能時要求 resync／restart。

## 測試分層

| 層級 | 回答的問題 |
| --- | --- |
| Unit／table | 單一公式、技能、codec 或 selector 是否正確 |
| Invariant／property | 合法性、範圍、終局與資源是否永不違反 |
| Golden trace | 是否和遊戲內逐步數值一致 |
| Parity | 不同執行核心在宣告範圍內是否一致 |
| Scenario／closed-loop | Solver 在 family、裝備、risk、world 中實際如何 |
| Browser／E2E | 回報、偏離、快速 fallback、undo、resync 與 reload |
| Benchmark | 主／快速 solver、startup、UI 與 export latency |
| Statistical | Paired outcomes、tail、confidence interval 與停止規則 |

長跑不放進預設 unit suite；保留小型 contract test 和可續跑的獨立 evaluation。

## Identity 更新

相同輸入可能因下列改變而得到不同結果時，更新 owning identity：

- mechanics／action formula；
- solver policy、risk objective 或 planner memory；
- condition model；
- recipe／objective binding；
- session event／export codec；
- native／WASM ABI 或 selector work budget。

Formatting、copy 或不影響結果的 orchestration 不濫增 solver version。Identity 的 owner 是 code／config，不在多份文件手動複製。

## 完成前驗證

依修改範圍執行最小充分組合：

- `npm run docs:check`；
- `npm run typecheck`；
- targeted Vitest／Node tests；
- Rust `cargo test`／release build；
- parity／scenario smoke；
- `npm run build`；
- `git diff --check`。

報告實際執行的命令與未執行的視覺、裝置、正式網站或遊戲內驗證。
