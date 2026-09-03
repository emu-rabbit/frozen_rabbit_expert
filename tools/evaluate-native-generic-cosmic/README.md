# Native generic closed-loop evaluator

本工具把 family／equipment／condition-world／seed matrix 編碼成目前 native generic episode protocol，由單一 Rust release process 完成：

~~~text
recommend -> RNG -> transition -> PlannerContext -> terminal
~~~

Node 只負責 catalog、matrix、TSV validation 與 report，不逐 step 呼叫 Rust，也不 fallback 到 frozen TypeScript solver。

## 使用

先建置 release binary，再查看當前 CLI：

~~~powershell
cargo build --release --offline --manifest-path native/craft-kernel/Cargo.toml
npm run evaluate:native-generic-cosmic -- --help
~~~

Bounded daytime A/B 必須明示當次 binary 支援的 baseline／candidate identities、preset／axes、risk、seed budget 與 output。需要外部策略座標時再加 `--reference-solver=<identity>`，形成 baseline／candidate／reference 三臂；不要從文件複製歷史 solver ID。

## Report contract

Report 分開：

- progress-only delivery 與 meaningful quality；
- hard required-quality completion；
- paired terminal／stop reason；
- final state／planner context；
- policy-null、illegal、action-limit；
- recommendation time；
- family × equipment × risk × world。

只有 release handshake、ABI、complete axes、paired case／seed identity 與所有 solver rows 都通過 validation 時，比較才成立。兩臂使用 paired report；三臂同時保存 `candidate − baseline` 與 `candidate − reference`，三臂共享同一 mechanics、initial state、condition tape 與 success tape。

Frozen TS migration comparison 只支援事前定義的 outcome similarity；有意演進的 Rust policy 不要求逐招複製 TS。可續跑長評測由 [long-run runner](../evaluate-generic-cosmic-overnight/README.md) 管理。
