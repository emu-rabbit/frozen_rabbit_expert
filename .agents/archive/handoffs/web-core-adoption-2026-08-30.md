<!-- doc-status: archived -->

> 已於 2026-08-30 完成並封存。Compute owner 決策與量測見 [Rust→WASM decision](../../../reports/web-runtime/rust-wasm-core-decision-20260830.md)；目前入口已轉為 [Rust/WASM Web integration brief](../../overnight_review_brief.md)。

# Web core adoption brief

`last_updated: 2026-08-30`

v1.12 已通過 solver value gate，F36／F46 bounded study 也依停止條件結案。下一個決策不是再擴 Rust seeds，而是選定 Web compute owner，讓網站從 frozen TypeScript policy 乾淨接入目前採用的 Rust 行為。

## 玩家結果與範圍

第一個 vertical slice 要讓 Web Worker 從玩家當前可觀測 state 取得 v1.12 建議，保留每步 3 秒 hard watchdog，並為後續獨立快速求解器留下明確邊界。此 slice 先完成 compute owner／ABI／parity／成本決策；不在同一變更中重做 UI、發布網站或宣稱 target-device gate 已完成。

## 比較方案

1. Rust→WASM：同一 `native/craft-kernel` source 編譯成 dependency-light Web module，由 TypeScript wrapper 負責輸入驗證、Worker lifecycle 與 UI DTO。
2. 新 TypeScript implementation：只能重現採用的 v1.12 行為，不能呼叫或延續 frozen `packages/solver` policy；若選擇此路，需明示 Rust→TS ownership 如何同步。

比較不能只看單次熱呼叫。至少記錄：同一 adopted corpus 的 action／context parity、cold／warm latency、bundle／memory、session reset，以及 failure／policy-null；本地數字不代替 target-device browser evidence。

## 第一個實作切片

建立 versioned、fail-closed 的 Rust Web ABI；以 native episode request 驗證 WASM parity；正常路徑保存 planner context，manual deviation／undo／resync 不沿用不相符 route memory。只有 WASM 出現實質 blocker 時才投入新的 TypeScript vertical slice。

## 接受與停止條件

- 採用路徑執行 v1.12 identity；same-request／same-session 0 action mismatch。
- Warm main recommendation 低於 3 秒並報 p50／p95／p99／max。
- WASM 符合 gate 時不為形式比較平行重寫整個 solver。
- Node／desktop evidence 只決定工程方向；產品發布仍需 browser／mobile 與整體 432 配方 review。
