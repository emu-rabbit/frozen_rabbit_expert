# 開發實作規範

## 文件角色

本檔規範程式邊界、錯誤分類、測試與版本更新。產品方向看 mission owners；目前實作看 [current_state.md](../../current_state.md)。

## 技術選擇

- Runtime recommendation local-first；離線評測可以使用 native process 與大量 CPU。
- 新的 solver 策略、測試與改善只在 Rust 進行。凍結 TypeScript solver 不接受新功能或調參。
- Web 主要求解器採用 `native/craft-kernel-web` 的 Rust／WASM ABI；TypeScript 只負責 Worker lifecycle、deadline、DTO 與 UI mapping，不建立策略複本。
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
| Scenario／closed-loop | Solver 的預設策略在 family、裝備、world 中實際如何 |
| Browser／E2E | 回報、偏離、快速 fallback、undo、resync 與 reload |
| Benchmark | 主／快速 solver、startup、UI 與 export latency |
| Statistical | Paired outcomes、tail、confidence interval 與停止規則 |

長跑不放進預設 unit suite；保留小型 contract test 和可續跑的獨立 evaluation。

### 測試命令與 owner

| 命令 | Owner 與用途 | 是否阻擋 Pages |
| --- | --- | --- |
| `npm test`／`npm run test:release` | `data`、`domain`、`protocol`、`simulator`、遊戲實證 golden trace 與目前 Rust→WASM Web boundary | 是 |
| `npm run test:legacy-ts` | 已凍結 TypeScript solver、policy-lab、舊 live-session 與舊 evaluator 的歷史重播 | 否 |
| `npm run test:native-bridge` | Rust migration 使用的 TypeScript protocol／oracle bridge | 否；由 `native-parity` job 負責 |
| `npm run test:tooling` | Native evaluation、overnight orchestration 與 normal-reference 工具 | 否 |
| `npm run test:all` | 全部 JS／TS 功能測試：預設 Vitest、tooling Vitest 與 Node tests；不含 benchmark 與 Rust | 否 |
| `npm run benchmark:solver` | 凍結 TypeScript solver 的歷史效能診斷；舊 100ms assertion 不是現行 Rust runtime 的 release gate | 否 |

`native-parity` job 只用 `cargo test --lib --tests` gate Rust library 與 integration targets；`examples/` 是需要明確研究 corpus 的手動 probe，不以 `cargo test --all-targets` 混入產品 gate。需要重播 probe 時，再以 `NORMAL_REFERENCE_TEST_INPUT` 指定對應 corpus；不為了 CI 通過而偽造語意不相等的 fixture。

## 行為識別與 Solver 升版

相同輸入可能因下列改變而得到不同結果時，更新 owning identity：

- mechanics／action formula；
- solver policy、risk objective 或 planner memory；
- condition model；
- recipe／objective binding；
- session event／export codec；
- native／WASM ABI 或 selector work budget。

Identity 的 owner 是 code／config，不在多份文件手動複製。行為可追溯與數字版號分開：試驗改了選招，也要能識別與重播，但不因此取得下一個 solver 版號。

### 使用者決定：只有有意義的進步才升版

2026-08-29 起，solver 數字版號代表經驗證的實質推進，不代表完成一次實驗或 commit。

- **試驗階段**：使用描述性實驗名稱，保存假說、相對 baseline 的變動、commit、binary／config hash、案例與驗證結果。需要 runtime 區分時使用非數字版號的實驗 identity；保持既有版本的行為及證據可重播，不以新實驗冒充原版。
- **未通過、沒有改善或證據不足**：以文件及 commit 交接結論與可重播證據，不升版、不加入正式版本進步序列，也不為每次試驗長期累積新的 runtime 分支。
- **升版時機**：依當輪事先固定的比較條件，確認相對採用基準有可重現、具實際價值的淨改善，並揭露重要切片與代價。品質／達成率優先；單純多加策略、覆蓋分支、通過 unit tests 或排除無效方向，不算升版依據。效果不退且有明顯可靠性／成本改善亦須實測，不以省時掩蓋品質退步。
- **後續驗證**：新數字版號與 overnight／產品採用仍是不同決策；後續發現退步時如實撤回，不改寫原始結果。升版後不得沿用該版號偷偷修改行為。

既有試驗版號保留原身份及歷史證據，不刪改 commit 或重新編號；其當前用途由 [版本變更史](../../solver_version_history.md) 標示。Application、Cargo、ABI、mechanics、data 與 session schema 的版本仍依各自相容性契約管理，這項決定不阻止必要的格式／行為識別更新。

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
