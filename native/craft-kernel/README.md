# Frozen Rabbit craft kernel

這個無外部 dependency 的 crate 是 `oracle-parity-v0.1` native checkpoint；目前只
重現 TypeScript oracle 的 seeded random streams 與 base progress／quality 公式
pipeline。

它**不是**已 promotion 的 search kernel，也沒有接入 web runtime；TypeScript 仍是
唯一 oracle，不可讓本 crate 演變成第二份 mechanics owner。新增 native mechanics
前，必須先以 shared、step-level parity fixtures 證明一致，才可供 rollout／search
使用。

獨立驗證命令：

```powershell
cargo test --offline --manifest-path native/craft-kernel/Cargo.toml
```
