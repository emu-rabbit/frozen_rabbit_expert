# v1.1 Overnight 執行與續跑

## 本輪內容

Baseline 是 v0.30，candidate 是新架構 v1.1。完整矩陣為 50 families × 10 裝備 × 3 risk × 4 assumed worlds × 8 seeds，共 48,000 paired cases／96,000 solver episodes，分為 150 shards。

這一輪用來辨識新架構的收益與弱切片。每格 8 seeds 提供廣度，較細的採用判斷由結果與不確定性決定。操作 smoke 使用另一個 base seed；演算法不讀 evaluation seeds。

## 開始／續跑

在 repository 的 PowerShell 執行同一命令：

~~~powershell
.\reports\generic-cosmic-overnight\v110-development\run-overnight.ps1
~~~

預設 2 workers、每次最多 8.5 小時、單 shard 最多 30 分鐘、1 次 retry。已完成且驗證有效的 shards 會跳過；時間用完可以用相同命令續跑。

如需減少持續負載，可用相同 run identity 降為一個 worker：

~~~powershell
.\reports\generic-cosmic-overnight\v110-development\run-overnight.ps1 -Workers 1
~~~

## 狀態

在執行中的視窗看 shard 進度。停止後以 status-only 驗證及重建 manifest：

~~~powershell
.\reports\generic-cosmic-overnight\v110-development\run-overnight.ps1 -StatusOnly
~~~

Runner 單一 writer lock 保護執行中的目錄。另一個視窗需要唯讀快照時，可讀：

~~~powershell
Get-Content -Raw -Encoding UTF8 .\evaluation-runs\generic-cosmic-overnight-native\generic-native-v110-vs-v030-8seed-20260827\manifest.json | ConvertFrom-Json | Select-Object outcome, summary, timing
~~~

Runner exit 0 表示完成，75 表示資料完整但仍可續跑；其他非零先檢查 console、manifest 及 shard logs。Ctrl+C 會中止本次 evaluator 程序樹，保留已完成 shards。請讓中止流程返回提示符後再重啟。

## 硬體與時間

2 workers 是保守操作預設；本次測試不提供持續熱負載校準，也沒有自動溫控。請自行監看 CPU 溫度、有效時脈與散熱；持續升溫、降頻、paging 或異常 timeout 時先中止，再降低 workers。

以有限測試粗估為數小時至超過單次 8.5 小時預算，完整弱裝備／壓力 world 的成本仍待測量；manifest 會逐 shard 更新 ETA。每次 invocation 的時間上限與續跑是本輪操作依據。

## 固定身份與輸出

- Run ID：`generic-native-v110-vs-v030-8seed-20260827`。
- Base seed：`1101202608`；每格 8 seeds，max actions 80。
- Binary SHA-256：`35e924b2c36516a7fac3d6a424c32cd9ceb94b9db732191ef8d280a3549b7c99`。
- Config fingerprint：`cb4673c72833dd320b1d34863b024f743d236eb0b21aa05f2de017c2f0a78980`。
- Script 先核對已封存 binary 的 hash，再交給 runner 驗證 config、evaluator bundle 與 shards。一般重新 build 不會覆蓋這份封存 binary。
- 原始輸出：`evaluation-runs/generic-cosmic-overnight-native/<run-id>/`。
- 完成後自動四表：`reports/generic-cosmic-overnight/<run-id>.md`。

本次只執行 bounded tests／smoke 與完整矩陣的 status-only；完整 run 留待使用者啟動。

## 開發驗證與重播

~~~powershell
cargo test --offline --manifest-path native/craft-kernel/Cargo.toml
cargo build --offline --release --manifest-path native/craft-kernel/Cargo.toml --bin craft-kernel-generic-episode --example route_portfolio_diagnostics
npm run typecheck
npm run test:generic-cosmic-overnight
npm run docs:check

# 8-case development diagnostics
.\native\craft-kernel\target\release\examples\route_portfolio_diagnostics.exe .\evaluation-runs\v110-development\diagnostic-cases.tsv

# 同一小批次的 smoke／resume／status
.\reports\generic-cosmic-overnight\v110-development\run-overnight.ps1 -Smoke -Workers 1 -TimeBudget 5m
.\reports\generic-cosmic-overnight\v110-development\run-overnight.ps1 -Smoke -StatusOnly
~~~

Windows 的程序樹中止測試需要控制本次自行建立的 child processes；在 Codex managed sandbox 執行時使用核准的外部執行權限。此機器的沙箱外 PowerShell 已實測可完成中止與續跑。
