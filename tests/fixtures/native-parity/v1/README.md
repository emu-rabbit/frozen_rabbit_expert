# Native parity fixtures v1

這組 immutable TSV fixtures 保存早期 TypeScript→Rust mechanics 遷移 checkpoint：

- `rng.tsv`：condition／success 的 deterministic raw uint32 draws。
- `base-gains.tsv`：凍結 TypeScript formula pipeline 的 IEEE-754 `f32` output bits。

它們是歷史 migration oracle，不代表 TypeScript 仍是目前 solver owner。若 semantics 有意改變，新增 versioned fixture 目錄與 migration 說明，不無聲改寫 v1。Rust 現行策略效果由 native evaluation contract 驗證。
