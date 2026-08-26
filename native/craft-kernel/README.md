# Frozen Rabbit craft kernel

## 文件角色

`native/craft-kernel` 是目前 mechanics、generic solver、`PlannerContext` 與 whole-episode compute 的 Rust owner。Solver identities、ABI 與 protocol versions 由 source／binary handshake 擁有，本檔不保存某次 candidate 的結果。

舊 TypeScript solver 已凍結；`ts_migration_port.rs` 只保留遷移參考，不要求後續 Rust policy 逐招複製。

## Build 與測試

~~~powershell
cargo test --offline --manifest-path native/craft-kernel/Cargo.toml
cargo build --release --offline --manifest-path native/craft-kernel/Cargo.toml
~~~

跨語言 fixtures：

~~~powershell
npm run test:native-parity
npm run test:native-adaptive-policy-parity
~~~

## Source ownership

| Source | 責任 |
| --- | --- |
| `types.rs`／`actions.rs` | Rust craft types 與技能定義 |
| `transition.rs`／`simulation.rs` | Legality、state transition、RNG 與 terminal |
| `generic_solver.rs` | 目前演進中的 generic policy |
| `generic_episode.rs` | Whole-episode loop、`PlannerContext` 與 batch output |
| `ts_migration_port.rs` | Frozen TS 行為的遷移參考 |
| `batch.rs`／`rollout.rs` | Transition／fixed-action batch |
| `root_plan_matrix.rs` | Paired root candidate matrix |
| `adaptive_policy_matrix.rs` | Data-only historical policy program parity |
| `main.rs`／`lib.rs` | Binary entrypoints、handshake 與 exports |

新策略只在 Rust owner 修改。Node／TypeScript tools 負責 catalog matrix、process orchestration、TSV validation 與 reports，不逐 action 來回呼叫。

## Protocols

| Protocol | 用途 | 不能宣稱 |
| --- | --- | --- |
| Native transition batch | 單步 mechanics parity／kernel benchmark | 完整 policy 效果 |
| Fixed-action rollout batch | 已知 action sequence 的逐步 replay | Adaptive solver 品質 |
| Root-plan matrix | 多個第一步＋固定 continuation 的 paired compute | Future-unknown live policy |
| Adaptive-policy matrix | 同一 data-only historical program 的跨語言解讀 | 目前 generic solver promotion |
| Generic episode batch | Rust 內完整 recommend→RNG→transition→context→terminal | 真實遊戲成功率，除非 condition／equipment evidence 足夠 |

Exact version、cell count、hard caps 與 solver IDs 以 handshake 和 encoder source 為準。Caller 遇到未知 protocol、ABI、identity、欄位數、hash 或超限 input 時 fail closed。

## Generic whole-episode contract

每個 case 包含：

- case／family／equipment／world／seed identity；
- solver、risk 與 objective；
- recipe、crafter、initial state；
- condition／success RNG 與 transition weights；
- action／step／output hard caps；
- optional full trace。

Output 至少保存 terminal／stop reason、actions、final state、RNG cursors、recommendation count／time、`PlannerContext` fingerprint 與可選 trace。Batch summary 保存 cases、transitions、kernel time、output bytes 與 deterministic checksum。

一個 paired A/B report 由同一 binary process 執行兩個 solver arms；baseline／candidate 要使用相同 cases 與 random streams。

## Benchmark 邊界

Kernel benchmark 可以排除 process startup、TSV parse／format 與 stdout，但報告必須另列端到端時間。Checksum／observable output 防止 compiler 移除計算。

Runtime latency claim 另外量測：

- process／WASM startup；
- JS↔WASM 或 Node↔native boundary；
- solver compute；
- serialization；
- UI render。

Native throughput 不能直接當成 Web p95。

## Web 邊界

Rust 結果尚未自動成為 Web runtime。使用者決定採用某個 Rust identity 時，另以同 corpus 比較 Rust→WASM 與新的 TypeScript Web implementation。舊 TypeScript 不會解凍。

若採用 WASM，native 與 WASM 的 authoritative mechanics／solver output 需要 exact parity gate；若採用新的 TypeScript，另定義 Rust→new-TS gate。

## Evaluation tools

- [Native generic evaluator](../../tools/evaluate-native-generic-cosmic/README.md)：bounded daytime A/B。
- [Generic long-run runner](../../tools/evaluate-generic-cosmic-overnight/README.md)：shards、resume、locks、atomic evidence。
- [Long-run workflow](../../.agents/workflows/run-generic-overnight-evaluation.md)：權限、命令交付、溫度提醒與結果判讀。
