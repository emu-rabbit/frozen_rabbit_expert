# Web compute owner decision: Rust→WASM

`decided_at: 2026-08-30`

## 決策

Web 的新 compute owner 採用 `native/craft-kernel`，透過 `native/craft-kernel-web` 的 versioned WASM ABI 進入 Web Worker。不建立一套平行的 TypeScript v1.12 implementation，也不解凍 `packages/solver`。

這個決策只完成 compute owner 與第一個 ABI vertical slice；現有 Web UI 尚未切換、Rust fast solver 尚未完成、target-device browser／mobile 仍待量測，因此不是發布完成。

## 為何選 Rust→WASM

1. **結果一致性直接成立。** WASM 呼叫與 native episode 使用同一份 Rust mechanics／solver source，不靠另一套語言逐條追版。Stateful benchmark 逐步餵回 native trace 的實際 after-state，能同時檢查 action、合法 observed transition、action-limit 與最終 planner context。
2. **本機成本已有足夠餘裕。** 200-case broad corpus 的 Node-WASM p95 27.36 ms、p99 44.09 ms、max 143.12 ms，低於主求解器 3 秒 gate。這不是 target-device 證據，但沒有出現足以要求改寫語言的 boundary blocker。
3. **WASM footprint 可控。** Release `.wasm` 為 552,843 bytes（未壓縮），200 cases 跑完 linear memory 為 2,818,048 bytes。後續仍需量測 Vite bundle、HTTP compression、browser cache 與實機 memory。
4. **避免雙 owner。** 目前 `generic_solver.rs` 加 portfolio modules 已約 8,597 行；另寫 TypeScript 版本會同時複製 mechanics、route memory、candidate scoring、tie-break 與每次 Rust 改善。WASM 已通過 gate 時，這個維護成本沒有玩家收益佐證。

## 實作邊界

- `rust-web-planner-abi-v1` 接受有 byte 上限的單一 UTF-8／TSV request，要求 solver identity 精確為 `generic-craft-route-portfolio-v1.12.0`，輸出 policy、action、option、persona 與 context fingerprint。
- Rust core 保持 `forbid(unsafe_code)`。穩定 export symbol 所需的 Rust 2024 unsafe attributes 隔離在 `native/craft-kernel-web`；wrapper 沒有 unsafe block 或 pointer dereference，只讓 JavaScript 寫入 Rust 擁有、已限長的 buffer。
- 正常採用上一步建議時，bridge 先驗證 current state 確實是 pending action 的 success／failure outcome，才推進 planner context。
- 玩家改用另一個合法技能時，以 `deviate:<action>` 驗證 observed transition 後清空 route memory／history context；undo、resync、配方／裝備／risk 改變使用 `reset`。Identity 或不可能的 after-state 會 fail closed。
- Action-limit 是 session contract，不只存在 evaluator episode controller；第一次 64-case run 抓到第 80 步後多推薦一次，修正後新增回歸測試並重跑為 0 mismatch。

Implementation commit：`921aaec`。

## Parity corpus

### 50 families × equipment／risk

200 cases：E09 food／medicine 裝備各跑 Stable、Balanced、Aggressive；E10 specialist 裝備跑 Balanced。每格 `balanced-iid`、1 個固定 seed。

- 6,415 recommendation calls；
- 0 action mismatch；
- 0 final planner-context mismatch；
- native stop：169 completed、31 failed；
- Node-WASM warm latency：p50 1.167 ms、p95 27.363 ms、p99 44.086 ms、max 143.120 ms、mean 6.211 ms；
- cold compile 0.859 ms、instantiate 0.124 ms。

### F36／F46 hard-quality sessions

F36／F46 各 64 個 E10／Balanced／`balanced-iid` cases，共 128 cases：

- 7,553 recommendation calls；
- 0 action mismatch；
- 0 final planner-context mismatch；
- native stop：32 completed、95 failed、1 action-limit；
- Node-WASM warm latency：p50 3.237 ms、p95 14.081 ms、p99 19.200 ms、max 43.087 ms。

兩個 corpus 都是 same-request／same-session development evidence。Condition worlds 仍是 evaluator assumption，不是 live condition 機率。

## 重播命令

~~~powershell
C:\Users\User\.cargo\bin\rustup.exe target add wasm32-unknown-unknown
C:\Users\User\.cargo\bin\cargo.exe build --manifest-path native/craft-kernel-web/Cargo.toml --lib --release --target wasm32-unknown-unknown
C:\Users\User\.cargo\bin\cargo.exe build --manifest-path native/craft-kernel/Cargo.toml --release --bin craft-kernel-generic-episode
npm run benchmark:web-wasm -- --wasm=native/craft-kernel-web/target/wasm32-unknown-unknown/release/frozen_rabbit_craft_kernel_web.wasm --native=native/craft-kernel/target/release/craft-kernel-generic-episode.exe --input=<candidate-plan.tsv> --output=.tmp/web-wasm-report.json
~~~

Harness 會自行要求 native full trace，逐步重播到 WASM session；有 action 或 final-context mismatch 時以非零狀態結束。

## 尚未完成

- 建立 browser wrapper 與 persistent Worker lifecycle，把 Web scenario／crafter／state／objective 編碼為 ABI request。
- Live planning probability 暫以 recipe 宣告的 random condition set 建立均勻 `balanced-iid` assumption；UI 每一步仍使用玩家實際回報 condition 重算。未有 live 資料前不得把這個分布寫成遊戲真值。
- 實作獨立 Rust fast solver；在此之前不能把 frozen TS fallback 改名為快速求解器。
- Browser desktop／mobile 的 cold load、p50／p95／p99／max、bundle compression、cache、memory、undo／resync／manual deviation 與 UI failure copy。
