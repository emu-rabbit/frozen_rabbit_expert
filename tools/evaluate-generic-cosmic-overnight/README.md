# Generic Cosmic Long-run Runner

## 文件角色

這個 Node ESM runner 把 family × risk evaluation 切成可隔離、可續跑的 shards。父程序負責 queue、timeout、retry、exclusive lock、atomic persistence、resume、validation 與 manifest；`rust-native` child 以單一 Rust release process 執行完整 paired whole-episode matrix。

長跑只能由使用者啟動。完整權限與判讀見 [long-run workflow](../../.agents/workflows/run-generic-overnight-evaluation.md)。

## 常用入口

~~~powershell
# CLI 與檔案復原 tests
npm run test:generic-cosmic-overnight

# 查看當前 CLI
npm run evaluate:generic-cosmic-overnight -- --help

# 最小 Rust path smoke
npm run evaluate:generic-cosmic-overnight:native-smoke

# 由一個或多個既有 completed run 重建四表總覽
npm run report:generic-cosmic-overnight -- <run-directory> [<run-directory>...]
~~~

較大的 Rust run 必須從當次 release binary handshake 取得 baseline／candidate identities，明示 `--engine=rust-native --native-preview`、binary、workers、axes、budget、output 與 run ID。`--native-preview` 是目前 CLI mode 名稱，不代表 agent 可以啟動長跑，也不自動降低結果的統計有效性。

不要從 README 或 archive 複製固定 solver IDs；每個 task 依 current binary 與 `--help` 產生 exact command。

### 指定裝備與球色世界

- `--equipment=all`（預設）執行 evaluator 公布的全部裝備；也可用 `--equipment=E02,E09` 或逗號分隔的 exact equipment IDs。`E01` 起依 evaluator description 的 canonical 順序編號，runner 在 immutable config 中保存解析後的 exact IDs。
- `--world=all`（預設）執行全部 condition worlds；也可用 `--world=balanced-iid,opportunity-scarce-iid` 指定子集合。
- CLI 輸入順序不改 canonical case identity。子集合仍使用完整裝備 × 世界座標計算 paired seed，因此可與相同 base seed 的全量 run 逐案例比較。
- Resume、status-only 與 historical baseline 必須重送相同的裝備／世界選擇；改變任一軸會得到不同 config fingerprint，不能覆寫舊 run。

## 技術契約

- `run.mjs` 是唯一 parent entry。
- `--describe` 與實際 shards 使用同一 evaluator bundle。
- Native preflight 驗證 release profile、handshake、ABI、solver identities、binary SHA-256 與 content-address snapshot。
- Immutable config 綁 engine、axes、model identities、binary 與 evaluator bundle；semantic drift 拒絕 resume。
- 同一 run directory 同時只有一個 parent writer。
- Valid final shards 跳過；partial／invalid evidence 分區保存。
- `config.json` 是 immutable semantic owner；`manifest.json` 是可由 validated shards 重建的進度索引。
- Console 顯示 shard-level percentage、running／failed／pending、saved episodes、elapsed 與 ETA，不逐 episode 輸出。
- 50-family run 成功收尾或由 `--status-only` 確認完整時，若所選 axes 包含 Balanced × balanced-iid × E02／E09，runner 直接從 validated shards 生成 `reports/generic-cosmic-overnight/<run-id>.md`，並在 console 顯示絕對路徑；缺少任一固定報表軸時會明示 skipped。報告固定為四張結果表，不含策略判讀；主要量尺只顯示 candidate，並在小括號附 candidate−baseline 差值。長度只顯示 candidate 完成／未完成的 p50／max 與括號差值，優先使用推進工序數 `S`，舊 evidence 無 `S` 時回退為全部技能數 `A`。
- Rust path 沒有 TypeScript evaluator fallback。

## Resume 與 status

Resume 使用原 semantic command 與 run ID。Status-only 重送原 run 所需 options 並加 `--status-only`；它驗證／重建 manifest，不啟動 episode。

`evaluation-runs/generic-cosmic-overnight/<run-id>/` 保存持久 evidence；`.tmp` 只放可丟棄 bundle／scratch。

## 開發本工具

~~~powershell
npx tsc -p tools/evaluate-generic-cosmic-overnight/tsconfig.json
~~~

修改 runner 後至少執行 Node tests、native smoke、`npm run docs:check` 與 `git diff --check`。
