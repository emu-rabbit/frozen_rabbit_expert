# Generic Cosmic overnight 四表總覽

本目錄保存可由 Git 追蹤的自動結果快照。每份 `<run-id>.md` 直接讀取該 completed overnight 的 validated shards，固定呈現 Balanced × `balanced-iid` × E02／E09 的四張表，不包含策略判讀。每個主要量尺只顯示 candidate，後方小括號顯示 candidate−baseline 差值；長度只列 candidate 完成／未完成的 p50／max 與括號差值，優先使用推進工序數 `S`，舊 evidence 沒保存 `S` 時回退顯示全部技能數 `A`。更細的 baseline 絕對值、p90／p95 與 A／S 雙量尺仍保留在 raw evidence 中。

原始 `config.json`、`manifest.json` 與 shards 仍由 `evaluation-runs/` 擁有；本目錄不是 raw evidence 的替代品。生成契約與重建命令見 [runner 說明](../../tools/evaluate-generic-cosmic-overnight/README.md)。
