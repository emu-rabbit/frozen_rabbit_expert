# Native generic closed-loop evaluator

這個工具把既有 family／equipment／condition-world／seed matrix 編碼成
`native-generic-episode-batch-v3`，由單一 Rust release process 完整執行
`recommend -> RNG -> transition -> PlannerContext -> terminal`。Node 只負責 catalog、
matrix、TSV 與報告，不逐步呼叫 Rust。v3 會把配方宣告的 random-condition set 編成
mask 送入 Rust，讓共用 solver 能做版本化的配方球色組分流。

先建置 release binary，再跑 bounded A/B：

```powershell
cargo build --release --offline --manifest-path native/craft-kernel/Cargo.toml
npm run evaluate:native-generic-cosmic -- --preset=small --seed-count=1 --candidate-risk=balanced --max-episodes=2000 --output=.tmp/native-generic-small.json
```

報告會分開 `progress-only` 與 `progress-and-required-quality`，保存逐 case identity、
兩個 solver arm 的 terminal／stop reason／final state／planner context、native recommendation
時間，以及 paired completion／target wins and losses。

預設 A/B 是 `generic-craft-ts-v0.6-semantic-port-v0.21.0` 對
`generic-craft-condition-set-portfolio-v0.22.0`。v0.22 只在 hard-quality、Balanced／Aggressive
與三組已驗證的 Centered＋Pliant random-condition sets 命中時，採用 v0.20 的共用路線；
其餘逐案維持 v0.21，不讀 recipe／equipment ID。報告只在 binary handshake、
release profile、完整 axes、paired seed／case identity 與兩個 solver rows 都通過驗證時成立；
TS migration comparison 只作 bounded behavioral similarity，不要求 Rust 策略逐招複製 TS。
這個工具供日間 bounded iteration；可續跑／fail-closed 的 native preview 由 overnight runner
管理，正式 unattended run 仍受 thermal calibration gate 約束。
