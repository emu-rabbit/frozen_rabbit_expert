# v1.1 完整 64-seed Overnight 命令

## 本輪內容

Baseline 為 v0.30，candidate 為保留決策、完成效能優化的 v1.1。維持上一輪全部 50 families × 10 equipment × 3 risk × 4 assumed worlds × 64 seeds，base seed `20260824`、max actions 80：384,000 pairs／768,000 solver episodes、150 shards。

成本與品質證據見 [results.md](results.md)。以 2 workers 規劃約 6–8 小時，單次上限 10 小時；這是短測推估，完成時間仍受 seed 長尾、背景負載與散熱影響。

## 開始／續跑

在 repository 根目錄的 PowerShell 執行：

~~~powershell
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=evaluation-runs/v110-performance/artifacts/9cb804d6ac4d392bfb2da0013163dc70516eb9d8ea5a50de935b0760981b1ec6/craft-kernel-generic-episode.exe --native-baseline-solver=generic-craft-specialist-resource-guard-v0.30.0 --native-candidate-solver=generic-craft-route-portfolio-v1.1.0 --risk=all --seed-count=64 --base-seed=20260824 --workers=2 --time-budget=10h --shard-timeout=1h --retries=2 --output=evaluation-runs/generic-cosmic-overnight-native --run-id=generic-native-v110-perf-vs-v030-64seed-20260827
~~~

相同命令會跳過已驗證完成的 shards。時間用完為 exit 75，可再次執行；exit 0 為完整完成。每個 shard 最多 1 小時，失敗最多重試 2 次，整個 invocation 仍受 10 小時限制。

Ctrl+C 後等待程序清理並返回提示符，再續跑。若需要減少負載，可只把 `--workers=2` 改成 `--workers=1`；案例與 run ID 保持相同。10 小時目標是雙 worker 的操作目標。

## 狀態

停止後可使用完整 status-only 命令驗證資料與重建 manifest：

~~~powershell
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=evaluation-runs/v110-performance/artifacts/9cb804d6ac4d392bfb2da0013163dc70516eb9d8ea5a50de935b0760981b1ec6/craft-kernel-generic-episode.exe --native-baseline-solver=generic-craft-specialist-resource-guard-v0.30.0 --native-candidate-solver=generic-craft-route-portfolio-v1.1.0 --risk=all --seed-count=64 --base-seed=20260824 --workers=2 --time-budget=10h --shard-timeout=1h --retries=2 --output=evaluation-runs/generic-cosmic-overnight-native --run-id=generic-native-v110-perf-vs-v030-64seed-20260827 --status-only
~~~

執行中看原視窗的 shard 進度；另一視窗可讀 manifest 快照：

~~~powershell
Get-Content -Raw -Encoding UTF8 .\evaluation-runs\generic-cosmic-overnight-native\generic-native-v110-perf-vs-v030-64seed-20260827\manifest.json | ConvertFrom-Json | Select-Object outcome, summary, timing
~~~

## 固定身份與報告

- Binary SHA-256：`9cb804d6ac4d392bfb2da0013163dc70516eb9d8ea5a50de935b0760981b1ec6`。
- Native protocol／ABI：v7；paired report：v4；runner：v1.3.0。
- Config fingerprint：`1b763eca4b7c77a5b893c8f81769e43bf817eda312b90452c0d76ec5cd4f4a3e`。
- Runner 驗證 content-addressed binary、immutable config、evaluator bundle 與每個 completed shard。重新 build 不會改寫這份封存 binary。
- 完整 run 目錄：`evaluation-runs/generic-cosmic-overnight-native/generic-native-v110-perf-vs-v030-64seed-20260827/`。
- 完成後自動四表：`reports/generic-cosmic-overnight/generic-native-v110-perf-vs-v030-64seed-20260827.md`。
- 每個 shard 的 `report.rows[].recommendationDurationsNs` 保存逐次耗時，供後續按 family／equipment／risk／world 及兩臂合併計算 p50／p95／max。

完整 run 已做 status-only，尚無 solver attempts。Bounded run／cutoff／resume／status 的驗證紀錄見結果報告。

## 硬體注意事項

請自行監看 CPU 溫度、有效時脈及散熱，並預留數 GB 儲存空間。持續升溫、降頻、paging 或異常 timeout 時先中止；本次沒有自動 thermal guard，也未做持續熱負載校準。

## 開發檢查

~~~powershell
cargo test --offline --release --manifest-path native/craft-kernel/Cargo.toml
cargo build --offline --release --manifest-path native/craft-kernel/Cargo.toml --bin craft-kernel-generic-episode --example route_portfolio_diagnostics
npm run typecheck
npm run test:generic-cosmic-overnight
npm run docs:check
~~~
