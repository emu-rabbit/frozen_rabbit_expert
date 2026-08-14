# Native parity fixtures v1

這組 immutable TSV fixtures 定義 Vitest 與 `native/craft-kernel` 共用的窄範圍
`oracle-parity-v0.1` checkpoint。

- `rng.tsv` 保存 condition 與 success 各五個連續 raw unsigned 32-bit draws；raw
  value 是除以 `2^32` 前的值。
- `base-gains.tsv` 由 TypeScript base progress／quality 公式 pipeline 重算，保存
  最終 IEEE-754 `f32` output bits。

`packages/simulator/src/randomStreams.ts` 與
`packages/domain/src/formulas.ts` 仍是 TypeScript oracle。若語意改變，應新增
versioned fixture 目錄，不可無聲改寫 v1。
