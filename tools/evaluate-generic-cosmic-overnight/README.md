# Generic Cosmic Overnight Runner

這個 Node ESM 工具目前把 generic Cosmic family evaluator 切成可隔離、可續跑的 family × risk shards。父程序負責 worker queue、child timeout、retry、驗證、atomic promotion、exclusive run lock 與 manifest；目前每個 evaluator child 仍是 Node／TypeScript，並只寫自己那一個 shard。

2026-08-25 已確認這條路徑不是 Rust overnight。下一次正式 run 在 Rust whole-episode ABI、release-binary identity、versioned parity／worker-calibration evidence 與 native-only fail-closed 落地前維持 blocked；現有入口只可作 runner tests、migration smoke、歷史 `--status-only` 或明示的 TS baseline，不得用來產生新的正式夜跑證據。

正式 workload、worker 校準、續跑、exit codes、evidence 解讀與 GPU 邊界由 [Generic Cosmic 夜間深度評測 workflow](../../.agents/workflows/run-generic-overnight-evaluation.md) 統一管理，本檔只保留技術入口。

2026-08-24 的已查證 evaluator registry snapshot 為 10 profiles；這只用來核對當次 `--describe` 與 episode 預算，runner 仍從 evaluator bundle 動態取得 equipment IDs，不把 10 寫成永久控制流程。完整本輪數量與未納入的未來裝備參考見上述 workflow。

## npm 入口

```powershell
# 一個 family、stable、單 seed、單 worker 的現行 TS evaluator smoke
npm run evaluate:generic-cosmic-overnight:smoke

# CLI、驗證與檔案復原測試
npm run test:generic-cosmic-overnight

# 查看完整 CLI
npm run evaluate:generic-cosmic-overnight -- --help

# 只查看既有 TS run，不啟動 evaluator
npm run evaluate:generic-cosmic-overnight -- --status-only --run-id=generic-night-01
```

正式 native 命令刻意不在此提供；實作完成後必須由 canonical workflow 的已驗證 worker-calibration evidence 選取 workers，不能手填舊 `6／8／12` 值或沿用 `generic-night-01`。

## 技術邊界

- `run.mjs` 是唯一父程序入口；它先 bundle 現有 `evaluate-generic-cosmic-families` evaluator，再從同一份 bundle 的 `--describe` 取得 families、equipment、world 與 model identities，最後以獨立 Node children 執行 shards。runner 不寫死 equipment 數量，也不讓描述與實際 evaluator 來自兩份 build。
- 目標仍保留 Node 父程序的 shard／lock／retry／resume／reporting 職責，但 child 必須改為同一 Rust release binary 內的完整 closed-loop episode；Node 不逐 action 呼叫 Rust，也沒有 TypeScript fallback。當前段落描述的是尚未 cutover 的 current implementation。
- `lib.mjs` 擁有 strict CLI、fingerprint、axes／report 驗證、摘要與 atomic file helpers；`lib.test.mjs` 覆蓋純函式及復原 contract。
- 預設持久輸出是 `evaluation-runs/generic-cosmic-overnight/<run-id>/`；bundle 可留在 `.tmp`，但 validated shards、config 與 manifest 不放 `.tmp`。
- 相同 semantic config 可用同一命令 resume；valid finals 會跳過，無效／未完成 shard 會重跑。同一 run directory 同時只能有一個父程序。
- `config.json` 是 immutable semantic owner；`manifest.json` 是 atomic、可由實際 shards 重建的進度索引。
- Console 以 shard 為節點顯示完成百分比、running／failed／pending、已保存 episodes、elapsed 與粗略 ETA，不逐 episode 輸出。manifest 另保存本次總 wall clock、attempt／evaluator 統計與每 shard 明細；平行 child 的耗時加總不等於真實經過時間。

直接開發本工具時可單獨 typecheck：

```powershell
npx tsc -p tools/evaluate-generic-cosmic-overnight/tsconfig.json
```
