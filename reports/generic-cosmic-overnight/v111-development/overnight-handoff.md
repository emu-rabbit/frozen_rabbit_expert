# v1.11 Overnight 執行交接

2026-08-29。此交接只負責已驗證的長跑命令與身份；效果判定見 [checkpoint 結果](results.md)，判讀規則見 [active brief](../../../.agents/overnight_review_brief.md)。長跑只由使用者啟動。

## 固定身份

- Candidate：`generic-craft-route-portfolio-v1.11.0`
- Historical baseline：`generic-craft-route-portfolio-v1.1.0`
- Binary：`native/craft-kernel/target/release/craft-kernel-generic-episode.exe`
- Binary SHA256：`05da5f22463ff248663f975c432b8cecefd0cadf00dd0e37b4b0eaacb815769d`
- Run ID：`generic-native-v111-checkpoint-vs-v110-history-64seed-20260829`
- 執行：384,000 candidate episodes；重用 384,000 筆已保存 v1.1 結果
- 預設：4 workers、每次 invocation 最多 10 小時、單 shard 1 小時、最多重試 2 次

## 執行或續跑

在 repository root 執行：

```powershell
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=native/craft-kernel/target/release/craft-kernel-generic-episode.exe --native-baseline-solver=generic-craft-route-portfolio-v1.1.0 --native-candidate-solver=generic-craft-route-portfolio-v1.11.0 --baseline-dir=evaluation-runs/generic-cosmic-overnight-native/generic-native-v110-perf-vs-v030-64seed-20260827 --risk=all --seed-count=64 --base-seed=20260824 --workers=4 --time-budget=10h --shard-timeout=1h --retries=2 --output=evaluation-runs/generic-cosmic-overnight-native --run-id=generic-native-v111-checkpoint-vs-v110-history-64seed-20260829
```

同一命令會依 manifest 原子保存的 completed shards 續跑，不會重算已完成 shard。正常需要暫停時按 `Ctrl+C`；再次執行同一命令即可續跑。Exit code 75 表示時間預算到而仍有待跑工作，不是策略失敗。

## 只查狀態

```powershell
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=native/craft-kernel/target/release/craft-kernel-generic-episode.exe --native-baseline-solver=generic-craft-route-portfolio-v1.1.0 --native-candidate-solver=generic-craft-route-portfolio-v1.11.0 --baseline-dir=evaluation-runs/generic-cosmic-overnight-native/generic-native-v110-perf-vs-v030-64seed-20260827 --risk=all --seed-count=64 --base-seed=20260824 --workers=4 --time-budget=10h --shard-timeout=1h --retries=2 --output=evaluation-runs/generic-cosmic-overnight-native --run-id=generic-native-v111-checkpoint-vs-v110-history-64seed-20260829 --status-only
```

此 status 命令已完整 preflight 成功：Rust ABI v7、binary hash、v1.1→v1.11 identity、150 個 pending shards、384,000 executed／384,000 historical reuse 都通過。Manifest 位於 `evaluation-runs/generic-cosmic-overnight-native/generic-native-v111-checkpoint-vs-v110-history-64seed-20260829/manifest.json`。

## 溫度與中止

這條已驗證命令固定使用 4 workers，沒有連接自動溫度感測器。執行期間需由使用者監看 CPU 溫度與系統穩定性；若持續過熱或系統不穩，按 `Ctrl+C` 暫停，不要提高 worker 數。因為 completed shards 已原子保存，降溫後執行同一命令即可續跑。
