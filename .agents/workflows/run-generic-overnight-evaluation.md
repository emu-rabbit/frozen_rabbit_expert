# 執行 Generic Cosmic 夜間深度評測

## 文件角色

`last_verified: 2026-08-25`

本文件是 generic Cosmic family 夜間評測的 canonical 操作流程，擁有正式 workload、啟動／續跑、並行校準、復原、exit code 與結果解讀契約。工具本身的技術入口見 `tools/evaluate-generic-cosmic-overnight/README.md`。

這個 workflow 用來回答「同一版 generic solver 在各 mechanics family、裝備層、風險偏好與明示 condition 假設下表現如何」，並保存可續跑、可配對的 machine-readable evidence。它不證明遊戲真實成功率，也不單獨證明策略已接近裝備能力極限。

## 預設 workload

| 軸 | 預設值 |
| --- | --- |
| Mechanics family | 50 個 policy-effective family representatives |
| Risk | `stable`、`balanced`、`aggressive` |
| Equipment | evaluator registry 當下全部 profiles；不在 runner 寫死數量，2026-08-24 已查證 snapshot 為 10 |
| Condition world | `balanced-iid`、`normal-heavy-iid`、`opportunity-scarce-iid`、`all-normal` |
| Seeds | 每個 equipment × world cell 64 個 |
| Shard | 一個 family × 一個 risk，共 150 shards |
| Budget | 每次 invocation 最多 8.5 小時 |
| Shard timeout | 30 分鐘 |
| Retry | 第一次失敗後再試 2 次 |

episodes 數量永遠由 evaluator description 的 equipment registry 動態計算：

```text
每 shard = equipment profiles × 4 worlds × 64 seeds
總數 = 50 families × 3 risks × equipment profiles × 4 worlds × 64 seeds
```

以目前已查證的 10 組裝備 registry 計算，每 shard 是 2,560 episodes，完整 run 是 384,000 episodes。若 registry 增減，runner、immutable config、manifest 與驗證器必須一起反映實際 axes；文件中的 384,000 是本次 snapshot，不可當成永遠固定的數字。

本輪 10 組不包含 i780 `Saw of Stars` 宇宙主手或 CP 特化禁斷 profile；不得為湊裝備軸自行推算或混入本輪結果。它們的 item stats、完整 loadout 與待查證項目只由 [open questions](../research/open_questions.md) 擁有，本 workflow 不複製 future profile 規格。

四個 condition worlds 都是可重播的 sensitivity／stress assumptions，不是已量測的自然球色轉移率。增加 seeds 只會加深這些假設內的估計，不會把它們升格成真實遊戲成功率。

## Workers 與這台主機的實測值

CLI 接受 `--workers=auto` 或 runner 安全範圍內的正整數（目前為 1–64）。`auto` 暫採：

```text
min(8, max(1, floor(availableParallelism / 3)))
```

通用 `auto` 仍保守選擇 8 workers，避免把這台主機的結果套到核心數、記憶體與散熱條件不同的電腦。2026-08-25 已在目前 12-core／24-logical-thread 主機上完成同 workload 的 1／2／4／6／8／12-worker 校準；12 workers 有明顯 throughput 增益且沒有 shard failure，因此這台主機的第一輪正式夜跑應顯式使用 `--workers=12`，不依賴 `auto`。

worker 數是 operational setting，不改變 family、risk、equipment、world 或 seed，也不應改變 deterministic episode 結果。它會改變總 throughput、CPU contention、記憶體峰值與開發機 latency 數字，因此每次 invocation 都要把 worker 數、Node 版本與可用 threads 留在 manifest。

## 第一次啟動前

1. 保持同一 checkout，不要在 run 與隔天 `--status-only` 之間切換 solver、catalog、mechanics 或 evaluator code。
2. 記錄 `git status --short --branch` 與目前 commit；dirty worktree 的 evaluator 內容也會進 bundle fingerprint，但仍應知道這次測的是哪份 code。
3. 執行 runner 純函式／復原測試與一個真正 evaluator smoke：

```powershell
npm run test:generic-cosmic-overnight
npm run evaluate:generic-cosmic-overnight:smoke
```

4. 若要和 baseline 做 paired A/B，先確認 baseline 是同 axes 的完整 overnight run。runner 會在啟動任何 shard 前核對 coverage、versions、equipment、world、seeds 與檔案 hash；不完整或不相容時 fail closed。
5. runner 會做保守磁碟空間 preflight。正式成果保存在 `evaluation-runs/`，該目錄被 Git 忽略，但不是可任意清除的 `.tmp`。

## 正式啟動

通用預設完整 run（未套用這台主機的校準值）：

```powershell
npm run evaluate:generic-cosmic-overnight
```

這台已校準主機的正式啟動命令：

```powershell
npm run evaluate:generic-cosmic-overnight -- --workers=12 --run-id=generic-night-01
```

paired baseline：

```powershell
npm run evaluate:generic-cosmic-overnight -- `
  --workers=8 `
  --run-id=generic-candidate-01 `
  --baseline-dir=evaluation-runs/generic-cosmic-overnight/generic-baseline-01
```

沒有指定 `--run-id` 時，runner 由 evaluator bundle、model versions、families、risks、equipment、worlds、seeds 與 baseline identity 產生 config fingerprint 與 run ID。手動重用同一 run ID 卻改變 semantic config 會 fail closed。

## 1／2／4／6／8／12 workers 校準

先以同一 checkout、同一 seed、無 baseline、無其他重負載程序跑固定小矩陣。以下六次合計各自使用獨立 run directory；這是 scheduler throughput 校準，不是 solver 品質評測：

```powershell
$workerCounts = 1,2,4,6,8,12
foreach ($workerCount in $workerCounts) {
  npm run evaluate:generic-cosmic-overnight -- `
    --family-limit=8 `
    --risk=all `
    --seed-count=4 `
    --workers=$workerCount `
    --retries=0 `
    --time-budget=1h `
    --output=evaluation-runs/generic-cosmic-worker-calibration `
    --run-id="cal-w$workerCount"
}
```

以目前 10 profiles 計算，上述建議的完整校準每次是 3,840 episodes。比較：

- completed episodes／總 wall clock，也就是 episodes/sec；
- 相對 1-worker 的 speedup 與 parallel efficiency；
- shard duration 的 median／p95；
- timeout、retry、invalid output 與 child failure；
- aggregate peak RSS、paging、CPU 使用率與是否熱降頻；
- recommendation p95／p99 只用來觀察 contention，不作 runtime 品質 gate。

預設選擇能穩定提高 episodes/sec 的最小 worker 數。若 12 相對 8 沒有約 15% 以上的穩定增益，或開始出現 paging、timeout、錯誤與持續降頻，就不採 12。若結果接近，換順序重跑一次，避免 warm-up 或機器背景負載誤導結論；實測改變 auto 預設後，要同步更新本 workflow。

### 2026-08-25 目前主機校準結果

為了在不先消耗數小時的前提下決定第一晚 worker 數，本次先使用 4 families × 3 risks × 10 equipment × 4 worlds × 2 seeds＝960 episodes；每個 worker count 都是 12 shards、`retries=0`，並使用同一 checkout 與 inputs。

| Workers | Wall clock（秒） | Episodes／秒 | 完成 shards | 失敗 shards |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 294.43 | 3.26 | 12 | 0 |
| 2 | 162.26 | 5.92 | 12 | 0 |
| 4 | 103.87 | 9.24 | 12 | 0 |
| 6 | 89.06 | 10.78 | 12 | 0 |
| 8 | 72.90 | 13.17 | 12 | 0 |
| 12 | 54.15 | 17.73 | 12 | 0 |

12 workers 相較 8 workers 的 throughput 高約 34.6%，wall clock 少約 25.7%，且這六次都沒有 timeout、retry 或 shard failure。因此目前主機採 12 workers。這是短矩陣 scheduler 校準，不等於已證明連續 8.5 小時沒有熱降頻；正式夜跑的 manifest 與 shard timing 仍是第一次長時間觀察證據。若長跑出現持續 timeout／paging／熱降頻，下次 invocation 可改 `--workers=8`，因 workers 是 operational setting，不會改變 semantic config 或使已完成 shards 失效。

## Console 進度與時間報告

父程序只在啟動 shard、完成／保存 shard、retry／failure、status 與最終結算時輸出概覽，不逐 episode 洗畫面。進度列包含：

- completed／total shards 與百分比；
- running、failed、pending shards；
- 已通過驗證並保存的 episodes；
- 本次 invocation 已耗時；
- 依本次已完成 shard throughput 外推的粗略 ETA；首個 shard 完成前顯示 `unknown`。

ETA 只用來讓人掌握大致進度；不同 family／risk 的 shard 成本不完全相同，且 worker 競爭與熱降頻會使它漂移，不能當 deadline 保證。

`manifest.json` 的 `timing.currentInvocationWallClockMs` 是這次父程序真正經過的總時間。`timing.currentInvocationAttempts`、`timing.allRecordedAttempts` 與 `timing.completedShardEvaluators` 提供 child／evaluator 的 count、total、median、p95 與 max；`shards[].timing` 和 `shards[].attempts[]` 可下鑽到單一 family × risk 的 evaluator 時間、每次嘗試時間、exit code 與 timeout。由於 workers 平行執行，child／evaluator 的 total 是計算工作量加總，可能大於父程序 wall clock，兩者不得混為一談。resume 後 `currentInvocationWallClockMs` 只計這次啟動，不把中間關機或休息時間算成運算時間；跨 invocation 的已記錄 attempts 仍保留在 `allRecordedAttempts`。

## Budget、timeout、retry 與中斷

- 8.5 小時是嚴格 global budget。每個 child 的有效 timeout 是 `min(shard timeout, remaining global budget)`；時間到時可中止正在執行的 shard，避免夜跑無限跨過預期窗口。
- 已驗證並 atomic rename 的 final shards 全部保留。被 budget 中止的 shard 不算完成，下次 resume 從頭重跑該 shard。
- 單一 child crash、timeout、輸出毀損或驗證失敗只消耗該 shard 的 attempt；`--retries` 是每次 invocation 在首次 attempt 後可再嘗試的次數，resume 會重新取得本次額度。達本次 retry 上限後記錄 failed，其他 workers 繼續。
- 第一次 Ctrl+C／SIGTERM 會停止派發新工作、終止所有 active children、保留 valid finals、刷新 manifest，分別以 130／143 離開。第二次 signal 是強制離開，可能只留下可由下次 scan 判定的 raw／partial。
- 同一 run directory 有 exclusive lock。同一時間只能有一個父 runner；`--status-only` 也不會和正在寫入的 runner 競爭。stale lock 只在確認 owner process 已不存在後保存到 `invalid/` 再恢復。

## 續跑與早上檢查

最安全的 resume 是重跑完全相同的命令：

```powershell
npm run evaluate:generic-cosmic-overnight -- --workers=8 --run-id=generic-night-01
```

runner 不只相信舊 manifest。它會重新驗證 final，恢復已完整寫完且通過驗證的 completed partial，將無效檔移入 `invalid/`，只跳過真正完成的 shards。`workers`、time budget 與 retries 是本次 invocation 的 operational controls；需要時可以調整，但 family／risk／equipment／world／seed／baseline 等 semantic axes 必須維持一致。

只檢查並重建狀態，不啟動 evaluator：

```powershell
npm run evaluate:generic-cosmic-overnight -- --status-only --run-id=generic-night-01
```

若原 run 使用非預設 `--family-limit`、`--risk`、`--seed-count`、`--base-seed` 或 `--baseline-dir`，status 命令也要帶相同 semantic options。檢查前不要切換 checkout，否則 evaluator bundle fingerprint 已不同，應回到原 code 再驗證，不能強行覆寫 immutable config。

## Exit codes

| Code | 意義 | 後續 |
| ---: | --- | --- |
| `0` | 所有規劃 shards 完成，或 `--status-only` 確認完整 | 可開始彙整結果 |
| `1` | 有 shard 用盡 retries，或 config／preflight／驗證／runner 發生錯誤 | 看 manifest、`logs/`、`invalid/`；修正原因後 resume |
| `75` | global budget 用完，或 `--status-only` 顯示尚未完整 | 以同 semantic command 繼續 |
| `130` | 收到 Ctrl+C／SIGINT | completed finals 已保留；稍後 resume |
| `143` | 收到 SIGTERM | completed finals 已保留；稍後 resume |

排程系統與晨間檢查不得把 75 當成資料毀損，也不得把「程序已正常離開」誤寫成「矩陣已完整完成」。是否完整以 validated shard count 和 exit code 共同判斷。

## Run directory 與 evidence owner

```text
evaluation-runs/generic-cosmic-overnight/<run-id>/
  config.json                 immutable semantic config + fingerprint
  manifest.json               atomic、可由實際 shard 重建的進度檢視
  .runner-lock.json           active parent process lock
  shards/                     validated final／completed partial
  raw-partials/               child 原始輸出；不是 final evidence
  logs/                       每個 attempt 的命令與 stdout／stderr
  invalid/                    stale／無效或被取代的檔案
  baseline-reports/           paired A/B 時抽出的 evaluator baseline
```

`config.json` 與 validated final shards 是持久 owner；manifest 是可重建的索引。不要手改 JSON 來讓 incomplete run 看似完成，也不要把 ignored 的 `evaluation-runs/` 當暫存清掉。若成果需要成為長期 checkpoint，另以摘要、必要 aggregate 與 provenance 做受控存檔，不直接把整批巨量 raw rows 加進 Git。

## 結果解讀底線

### 完成與品質必須分開

- `progress-only`：recipe 的 mechanics `requiredQuality=0`；`completed` 只證明作業進度完成、可以交貨，不表示品質滿或達到有意義分數。
- `progress-and-required-quality`：`completed` 同時要求作業進度與 mechanics 的最低品質硬門檻；仍不一定等於最大品質。
- `qualityTargetReached`：是否達到這個 recipe/objective 宣告的品質目標；只有該目標本身等於最大品質時，才能解讀為滿品質。

報告至少分開上述兩種 completion contract、quality target、equipment、family、risk 與 world。不得用混合總 completed 掩蓋 progress-only 交貨失敗，也不得把 hard-quality recipe 的低完成率直接當成一般配方無法交貨。

### Assumption 與能力上界

- 四個 worlds 只證明在該 assumption 下的 sensitivity／stress 結果。
- seeds 加深 sampling precision，不修正錯誤或未知的 condition transition model。
- optimistic／clairvoyant witness、目前 solver 分數與夜間大量樣本，都不能單獨回答「已到裝備數理極限」。能力極限仍需要 causal upper／lower bound、可重播 witness 與相稱的未知分布邊界。

### 並行 latency 不是 UI SLA

多個 evaluator children 會競爭 CPU cache、記憶體頻寬、GC 與排程時間。夜間報告中的 recommendation p95／p99 是「這台開發機在 N workers throughput run 下」的量測，不是玩家裝置的單請求 latency，也不能和不同 worker 數的 baseline 直接比較。worker 校準看 episodes/sec；Web p95 `<1s` 與 `3000ms` watchdog 要用隔離、代表性目標裝置另測。

## GPU 邊界

這一輪不接 GPU。現有 generic evaluator 主要是分支多、每步狀態不同的 TypeScript policy／mechanics 物件運算；直接增加 GPU 不會自動加速，反而需要另一份扁平資料表示、batch kernel、傳輸與 parity contract。

只有同時滿足下列條件才重新評估 GPU：

1. 1／2／4／6／8／12-worker benchmark 證明 CPU throughput 仍無法守住需要的窗口；
2. profiler 證明大部分時間集中在可大量 batch、分支可控的數值 hot path，而不是 JS object allocation、policy control flow 或檔案序列化；
3. 單批工作夠大，預期收益能攤平 CPU↔GPU 傳輸與啟動成本；
4. 已有固定 schema、deterministic CPU oracle、逐 case parity、錯誤回退與目標機器 benchmark；
5. 相較先搬移既有 native batch hot path，GPU 有量測上的額外價值。

在這些證據出現前，優先使用獨立 CPU child 的 bounded parallelism；不要為了硬體存在就建立第二份難以驗證的 solver truth。
