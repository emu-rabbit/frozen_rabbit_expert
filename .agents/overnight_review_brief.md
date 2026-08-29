# Web core adoption brief

`last_updated: 2026-08-30`

v1.12 已通過 solver value gate，F36／F46 bounded study 也依停止條件結案。下一個決策不是再擴 Rust seeds，而是選定 Web compute owner，讓網站從 frozen TypeScript policy 乾淨接入目前採用的 Rust 行為。

## 玩家結果與範圍

第一個 vertical slice 要讓 Web Worker 從玩家當前可觀測 state 取得 v1.12 建議，保留每步 3 秒 hard watchdog，並為後續獨立快速求解器留下明確邊界。此 slice 先完成 compute owner／ABI／parity／成本決策；不在同一變更中重做 UI、發布網站或宣稱 target-device gate 已完成。

## 比較方案

1. Rust→WASM：同一 `native/craft-kernel` source 編譯成 dependency-light Web module，由 TypeScript wrapper 負責輸入驗證、Worker lifecycle 與 UI DTO。
2. 新 TypeScript implementation：只能重現採用的 v1.12 行為，不能呼叫或延續 frozen `packages/solver` policy；若選擇此路，需明示 Rust→TS ownership 如何同步。

比較不能只看單次熱呼叫。至少記錄：

- 同一 adopted corpus 的 action、policy identity、planner context／session replay 一致性；
- cold load、warm p50／p95／p99／max 與 3 秒 watchdog；
- WASM／wrapper bundle、memory 與 cache 行為；
- undo、resync、玩家自行使用合法技能後的 context reset／rebuild；
- failure category、0 illegal 與 valid-nonterminal 0 policy-null；
- 後續 Rust 改善同步到 Web 的維護成本與 debug 可見性。

## 第一個實作切片

1. 建立 versioned、fail-closed 的 Rust Web ABI；輸入與輸出有大小上限，不接受 identity／schema 不符。
2. 先以同一 native episode request 驗證 WASM build 與 recommendation parity，保留可重播 benchmark harness。
3. 將 planner context 明確留在 runtime session；正常採用建議時依 before／after state 推進，manual deviation、undo 或 resync 時不得沿用不相符的 route memory。
4. 量測本機 desktop development evidence；target-device browser／mobile 數字另列 pending，不能由 native 或 Node-WASM 代替。
5. 只有選定 owner 後才接入現有 `genericPlanner.worker.ts`；在獨立 Rust fast solver 尚未完成前，不把 frozen TS fallback 改名冒充新快速求解器。

## 接受與停止條件

- 採用路徑必須執行 v1.12 identity，不能把 frozen TS action parity 當 outcome parity 的替代品。
- Same-request／same-session corpus 0 action mismatch；identity、ABI 或 input validation 不符時 fail closed。
- Warm main recommendation 每步必須低於 3 秒；量測同時報 p50／p95／p99／max，不用平均值遮蔽尾端。
- 若 WASM boundary、bundle 或 memory 明顯不適合，再投入新 TypeScript vertical slice；若 WASM 符合 gate，避免為了形式比較平行重寫整個 solver。
- 本地 Node／desktop evidence 只決定工程方向；產品發布仍需 target-device browser、mobile UX、session recovery 與整體 432 配方 evidence review。
