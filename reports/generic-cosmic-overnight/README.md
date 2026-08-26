# Generic Cosmic overnight 四表總覽

本目錄保存可由 Git 追蹤的自動結果快照。每份 `<run-id>.md` 直接讀取該 completed overnight 的 validated shards，固定呈現 Balanced × `balanced-iid` × E02／E09 的四張表，不包含策略判讀。四表同時列出完成／未完成的技能數與推進工序數 p50／p90／p95／max；舊 evidence 沒保存 final step 時只能重算技能數，推進工序以 `—` 明示。

原始 `config.json`、`manifest.json` 與 shards 仍由 `evaluation-runs/` 擁有；本目錄不是 raw evidence 的替代品。生成契約與重建命令見 [runner 說明](../../tools/evaluate-generic-cosmic-overnight/README.md)。
