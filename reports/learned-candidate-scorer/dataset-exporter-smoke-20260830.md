# Route-aware candidate dataset exporter smoke

`verified_at: 2026-08-30`

## 結論

Rust candidate dataset seam 已完成第一個 bounded implementation。`d9243e2` 新增 `rust-route-candidate-dataset-v1` schema、`native-route-candidate-dataset-export-v1` CLI 與精確 selected-candidate index；它能從 ordinary v1.12 episode 的 observer 匯出 pre-action state／context、全部 route-aware candidates、continuation、分支估值與 work counters。

這只證明資料可穩定匯出，**還沒有建立較深 teacher、teacher labels、訓練 corpus 或 learned ranker**，也不是 solver 行為版號。

## Bounded smoke

- Input：既有 F36 v1.12 單 episode fixture。
- Output：46 decisions、134 candidates、180 data rows、89,601 bytes。
- Content FNV-1a 64：`56867c750c31bc2a`。
- 每列都通過 v1 schema parser；decision／candidate 以純 `example_ordinal`＋`decision_ordinal` join，不輸出 case／recipe／family／equipment／seed identity 作 feature。

FNV-1a 64 只供同一工具鏈的快速重播診斷，不是防碰撞的 corpus content identity。正式 bounded corpus manifest 仍應在生成前固定 split／teacher／mechanics／condition identities，並對 frozen artifact 另存 SHA-256。

## 已驗證契約

- 同一 case 重跑得到相同 rows 與 content hash。
- Ordinary episode 與帶 exporter observer 的 action、final state、final RNG cursor、stop reason、planner context 一致；export 不改 outcome 或 RNG。
- 改變 `case_id` 與 `canonical_recipe_id` 不改 dataset rows；recipe／crafter mechanics 仍保留為合法通用 features。
- Selector 直接保存精確 candidate index，不以相同首招猜回 tie／continuation identity。
- Schema header、row arity、ordinal 與 boolean cells 由 parser fail closed。
- `cargo test --manifest-path native/craft-kernel/Cargo.toml`：109 tests passed。
- `cargo fmt --manifest-path native/craft-kernel/Cargo.toml -- --check` 與 `git diff --check` 通過。

## 下一個 gate

先定義 frozen grouped split manifest 與高預算離線 candidate evaluator。所有候選必須使用相同 planning tapes，且不得讀 episode 尚未發生的實際 RNG。只有 teacher-selected 在 fresh closed-loop same-tape cells 勝過 v1.12-selected，才生成大量 train corpus。
