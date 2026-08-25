# Generic Cosmic Overnight Runner

這個 Node ESM 工具把 generic Cosmic family evaluator 切成可隔離、可續跑的 family × risk shards。父程序負責 worker queue、child timeout、retry、驗證、atomic promotion、exclusive run lock 與 manifest。`--engine=rust-native` 時，每個 Node child 只組裝該 shard 的完整 matrix，並由單一 Rust release process 執行兩個 solver arms 的 whole-episode closed loop；沒有逐 action IPC 或 TypeScript fallback。

2026-08-25 已完成 `native-generic-episode-batch-v2`、release handshake、ABI／solver identity、binary SHA-256／content-address snapshot、strict paired report validation、native-only retry／resume 與 1→4 worker deterministic preview。正式 unattended run 仍 blocked，原因已縮到可信 sensor、至少 30 分鐘熱穩態與可驗證 worker-calibration evidence 尚未完成；native CLI 因此強制 `--native-preview`，不讓 bounded 短跑冒充正式夜跑。

正式 workload、worker 校準、續跑、exit codes、evidence 解讀與 GPU 邊界由 [Generic Cosmic 夜間深度評測 workflow](../../.agents/workflows/run-generic-overnight-evaluation.md) 統一管理，本檔只保留技術入口。

2026-08-24 的已查證 evaluator registry snapshot 為 10 profiles；這只用來核對當次 `--describe` 與 episode 預算，runner 仍從 evaluator bundle 動態取得 equipment IDs，不把 10 寫成永久控制流程。完整本輪數量與未納入的未來裝備參考見上述 workflow。

## npm 入口

```powershell
# 一個 family、stable、單 seed、單 worker 的現行 TS evaluator smoke
npm run evaluate:generic-cosmic-overnight:smoke

# CLI、驗證與檔案復原測試
npm run test:generic-cosmic-overnight

# 一個 family 的 Rust v0.15→v0.18 whole-episode smoke
npm run evaluate:generic-cosmic-overnight:native-smoke

# 查看完整 CLI
npm run evaluate:generic-cosmic-overnight -- --help

# 只查看既有 TS run，不啟動 evaluator
npm run evaluate:generic-cosmic-overnight -- --status-only --run-id=generic-night-01
```

較大 native preview 必須明示 `--engine=rust-native --native-preview`、release binary、兩個 Rust solver identities 與 workers。正式 native 命令刻意不提供；完成 canonical workflow 的 worker-calibration evidence 後才會移除 preview gate，不能手填舊 `6／8／12` 值或沿用 `generic-night-01`。

## 技術邊界

- `run.mjs` 是唯一父程序入口；legacy mode bundle `evaluate-generic-cosmic-families`，native mode bundle `evaluate-native-generic-cosmic`。`--describe` 與實際 shards 永遠來自同一 bundle；runner 動態取得 families、equipment、world 與 model identities，不寫死 equipment 數量。
- native preflight 要求 release handshake，並把 exact executable 保存到 output root 的 `.artifacts/<sha256>/`。immutable config 綁 engine、protocol／ABI、mechanics identity、target／rustc、binary hash／handshake、baseline／candidate solver 與 evaluator bundle；每次 retry 都重驗同一 snapshot，任何不符都 fail closed。
- `lib.mjs` 擁有 strict CLI、fingerprint、axes／report 驗證、摘要與 atomic file helpers；`lib.test.mjs` 覆蓋純函式及復原 contract。
- 預設持久輸出是 `evaluation-runs/generic-cosmic-overnight/<run-id>/`；bundle 可留在 `.tmp`，但 validated shards、config 與 manifest 不放 `.tmp`。
- 相同 semantic config 可用同一命令 resume；valid finals 會跳過，無效／未完成 shard 會重跑。同一 run directory 同時只能有一個父程序。
- `config.json` 是 immutable semantic owner；`manifest.json` 是 atomic、可由實際 shards 重建的進度索引。
- Console 以 shard 為節點顯示完成百分比、running／failed／pending、已保存 episodes、elapsed 與粗略 ETA，不逐 episode 輸出。manifest 另保存本次總 wall clock、attempt／evaluator 統計與每 shard 明細；平行 child 的耗時加總不等於真實經過時間。

直接開發本工具時可單獨 typecheck：

```powershell
npx tsc -p tools/evaluate-generic-cosmic-overnight/tsconfig.json
```
