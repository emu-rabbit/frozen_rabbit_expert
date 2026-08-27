# v1.0 開發重播命令

從 repository root 執行。以下沿用本次已執行的參數，output 指向新的 replay 目錄以保存原始證據；完整結果與 binary identity 見 [results.md](results.md)。

## Build 與測試

```powershell
& 'C:\Users\User\.cargo\bin\cargo.exe' test --manifest-path native/craft-kernel/Cargo.toml
& 'C:\Users\User\.cargo\bin\cargo.exe' build --manifest-path native/craft-kernel/Cargo.toml --release --bin craft-kernel-generic-episode --example route_portfolio_diagnostics
npm run typecheck
npm run docs:check
node --test tools/evaluate-generic-cosmic-overnight/lib.test.mjs
```

## 2-pair smoke

```powershell
node tools/evaluate-native-generic-cosmic/run.mjs --recipe=36195 --equipment=player-food-medicine-cosmic-tool-v1,generic-i750-hq-five-meld-template-buffed-v1 --world=balanced-iid --risk=balanced --seed-count=1 --max-episodes=2 --baseline-solver=generic-craft-specialist-resource-guard-v0.30.0 --candidate-solver=generic-craft-route-portfolio-v1.0.0 --native-timeout-ms=300000 --output=evaluation-runs/v100-replay/smoke.json
```

## 100-pair 開發切片

```powershell
node tools/evaluate-native-generic-cosmic/run.mjs --equipment=player-food-medicine-cosmic-tool-v1,generic-i750-hq-five-meld-template-buffed-v1 --world=balanced-iid --risk=balanced --seed-count=1 --max-episodes=100 --baseline-solver=generic-craft-specialist-resource-guard-v0.30.0 --candidate-solver=generic-craft-route-portfolio-v1.0.0 --native-timeout-ms=300000 --output=evaluation-runs/v100-replay/balanced-e02-e09.json
```

每臂有 300 秒上限，兩臂依序執行；可用 Ctrl+C 中斷。開發工具每次處理完整的小批次，重新執行即重新計算該批；需要 shards、續跑及 status 的完整評測依 [長跑 workflow](../../../.agents/workflows/run-generic-overnight-evaluation.md)。

## 逐步診斷

先執行上方 smoke，以它保存的 candidate TSV 重播相同兩個 cases：

```powershell
& 'native/craft-kernel/target/release/examples/route_portfolio_diagnostics.exe' evaluation-runs/v100-replay/smoke.json.candidate.tsv > evaluation-runs/v100-replay/smoke-diagnostics.tsv
```

工具接受 1–8 個 cases。每步輸出候選分數、consumer、分支證據、選中方案、工作量及實際 latency；最後輸出 outcome 與 timing percentiles。規劃診斷和實際 episode 共用同一決策路徑。

## 使用固定 binary 重播

在相同 paired 命令附加 `--native-binary=<results.md 記錄的內容定址快照路徑>`，即可使用已保存的本輪 binary。TSV 輸入、solver identity 與 report SHA-256 共同定位案例和結果。

目前先處理 [結果報告](results.md) 列出的完成率與估值問題；下一次完整 overnight 的保留集、接受界線及操作命令由 active brief 固定，長跑由使用者啟動。
