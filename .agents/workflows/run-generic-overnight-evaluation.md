# 執行 Generic Cosmic 夜間深度評測

## 文件角色

`last_verified: 2026-08-25`

本文件是 generic Cosmic family 夜間評測的 canonical 操作流程，擁有正式 workload、啟動／續跑、並行校準、復原、exit code 與結果解讀契約。工具本身的技術入口見 `tools/evaluate-generic-cosmic-overnight/README.md`。

這個 workflow 用來回答「同一版 generic solver 在各 mechanics family、裝備層、風險偏好與明示 condition 假設下表現如何」，並保存可續跑、可配對的 machine-readable evidence。它不證明遊戲真實成功率，也不單獨證明策略已接近裝備能力極限。

## 目前 gate 狀態與執行引擎

2026-08-25 查證 `generic-night-01` 的 shard command 是 `node.exe`，完整 evaluator 走 TypeScript `recommendAction`／`runEpisodeTrace`；它不是 Rust overnight。該 run 的 family／equipment／world／seed 結果可保留為 v0.5.1 歷史品質 baseline，但耗時、溫度與 worker 校準都不得外推到 Rust。

下一次正式 generic overnight 仍是 **blocked**，但 Rust execution／runner 已完成，剩餘 blocker 是可信 sensor、至少 30 分鐘熱穩態與 immutable worker-calibration evidence。native CLI 在 blocker 排除前強制 `--native-preview`，bounded smoke／determinism／估時不得稱正式夜跑。已落實的 contract：

- 每個正式 shard 由同一個 Rust release binary 在程序內完成 `recommend -> RNG -> transition -> PlannerContext/history update -> next recommendation -> terminal`；禁止逐 action Node↔Rust 往返。
- Node 只負責 catalog／config 載入、shard 排程、lock、timeout、Rust-only retry、atomic persistence、resume、驗證與報表；不得 fallback 到 TypeScript、JavaScript 或 WASM evaluator。
- preflight 與 immutable config 綁定 `executionEngine=rust-native-closed-loop`、protocol／ABI、build profile、target／rustc、兩個 solver identities、mechanics model、binary handshake／SHA-256／content-address snapshot 與 evaluator bundle。worker-calibration evidence 尚未實作，所以 formal mode fail closed。
- binary 缺失、debug build、handshake／hash／evidence 不符、malformed output 或 crash 一律 fail closed；retry 只能重新驗證並重跑完全相同的 Rust binary。
- mechanics／codec／RNG／terminal 對共享 action traces 維持 TS↔Rust exact parity；TS policy 只作一次性 bounded behavioral similarity reference，不再追逐逐招等同。Rust 已是 offline solver owner，Web release 前另鎖同 core native↔WASM／TS wrapper parity。

歷史 TypeScript 子節與 `generic-night-01` 仍依原 legacy config／schema 解讀，不套用 native identity。native preview 使用新的 run ID／config，不能和 legacy shards 混用。

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

## Workers 與 engine-specific 校準

正式 Rust run 不使用未校準的 `auto`，必須由適用的 worker-calibration evidence 明示 worker 數。worker 數是 operational setting，不改變 family、risk、equipment、world、seed 或 deterministic episode；若 1／2／4 workers 得到不同 action／state／stop reason，視為 correctness failure，不是 scheduler 差異。

長時間熱校準綁定 release target／toolchain、代表性 workload／load shape、host fingerprint、CPU、BIOS／PBO／ECO、電源計畫、散熱／風扇設定、sensor source、取樣方式、停止線與 calibration timestamp；它不因每次 solver hash 小改就自動失效。每個新 binary 仍要做短版 1／2／4 determinism／throughput／temperature preflight；若 work budget、load shape、toolchain／target、主機／散熱設定改變，或短測顯示功耗／溫度／時脈明顯漂移，才重做持續熱校準。evidence 保存 tested／permitted／selected workers；manifest 另鎖本次 exact binary SHA，並記錄 parent Node、Rust target／rustc、host identity、可用 threads 與實際 workers。

## 第一次啟動前

1. 保持同一 checkout，不要在 run 與隔天 `--status-only` 之間切換 solver、catalog、mechanics 或 evaluator code。
2. 記錄 `git status --short --branch` 與目前 commit；dirty worktree 的 evaluator 內容也會進 bundle fingerprint，但仍應知道這次測的是哪份 code。
3. 解析實際 Rust binary、重算 SHA-256，要求 binary handshake 自報 release profile、target、ABI 與 solvers；建立 run 前以 content-addressed 方式保存 exact executable，retry／resume 只從該 snapshot 啟動。任何缺漏或不符在派發 shard 前以 exit `1` 停止。正式 mode 另驗 worker-calibration evidence；目前只開 preview。
4. 執行 runner 純函式／復原測試與 Rust native smoke：

```powershell
npm run test:generic-cosmic-overnight
npm run evaluate:generic-cosmic-overnight:smoke
npm run evaluate:generic-cosmic-overnight:native-smoke
```

5. TS→Rust 只允許明示 `migration comparison`，以 frozen deterministic TS reference、相同 axes／common random numbers 做 bounded behavioral similarity；不要求 Rust 策略逐招複製 TS。一般 native run 不得讀取 legacy TS baseline。後續 Rust A/B 要求相同 native engine／ABI／mechanics／action schema 與 axes，solver identity 可以不同。runner 在啟動任何 shard 前核對 coverage、versions、equipment、worlds、seeds、engine identity 與檔案 hash；不完整或不相容時 fail closed。
6. runner 會做保守磁碟空間 preflight。正式成果保存在 `evaluation-runs/`，該目錄被 Git 忽略，但不是可任意清除的 `.tmp`。

## 正式啟動

正式 parent runner 必須接受 immutable worker-calibration evidence，由 runner 自行驗證並選取 worker 數，再把其 identity 綁入 run；不能由外層 shell 只抽一個數字後讓 runner 無從核對。console 先印出 resolved Rust artifact、SHA、ABI、release profile 與 calibration evidence identity，再派發第一個 shard。這個 formal evidence CLI 尚未實作；現有 native path 必須帶 `--native-preview`，因此本節暫不提供看似可執行的正式命令。

paired native A/B 的 run IDs 使用 `generic-native-baseline-*`／`generic-native-candidate-*`，且遵守前節同 engine contract。舊 `generic-night-01` 只能作獨立歷史品質參考；除非經專用 cross-engine migration importer／validator，不得直接作 native `--baseline-dir`。

沒有指定 `--run-id` 時，target runner 由 engine／ABI／binary／evidence hashes、model versions、families、risks、equipment、worlds、seeds 與 baseline identity 產生 config fingerprint 與 run ID。手動重用同一 run ID 卻改變 semantic config 會 fail closed。舊 `generic-night-01` 是 TypeScript evidence，只可查詢歷史狀態；不得用 Rust binary resume，Rust 第一輪必須使用新 run ID。

## Rust 1／2／4 workers 效能與持續熱校準 gate

先以同一 checkout、同一 release binary、固定 axes／seeds、`retries=0`、無其他重負載程序跑短版 1→2→4 sweep。依 projected full-run wall clock 選出能在 8.5 小時內保有事前餘裕的最小 worker 數，再只對該值持續重播 sealed matrix 至少 30 分鐘且達熱穩態；不通過就降一級重測。只有短測結果接近或受 warm-up／背景負載干擾時，才反向重跑 4→2→1。

runner 已能固定 binary、case identity 與 workers 做 bounded preview，並以 immutable config 拒絕 axes drift；尚未提供「持續重播至 thermal duration＋sensor sampling＋evidence seal」的 calibration mode。以現有短矩陣跑完一次，不算通過持續熱校準。

### 2026-08-25 Rust native preview（非熱校準）

baseline `generic-craft-capability-portfolio-mpc-v0.15.0`、candidate `generic-craft-opportunity-reserve-v0.18.0`，release binary SHA-256 `08527ee69f75846a7fd13ef50befdcff03fdd12a0f69849d7059d8c859779298`，ABI `native-generic-closed-loop-abi-v2`。所有 runs 都是 10 equipment × 4 worlds、三種 risk、`retries=0`：

| Preview | Workers | Paired cases | Solver episodes | Wall clock | Shards | Retry／timeout |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 families × 2 seeds | 1 | 960 | 1,920 | 7.536s | 12／12 | 0／0 |
| 同一 corpus | 4 | 960 | 1,920 | 2.913s | 12／12 | 0／0 |
| 10 families × 8 seeds | 4 | 9,600 | 19,200 | 27.249s | 30／30 | 0／0 |
| 20 families × 8 seeds | 4 | 19,200 | 38,400 | 52.288s | 60／60 | 0／0 |
| 50 families × 8 seeds | 4 | 48,000 | 96,000 | 112s | 150／150 | 0／0 |

1-worker／4-worker 的 1,920 semantic rows 排除 `recommendationNs`／`recommendationMaxNs` 後，SHA-256 都是 `451b6340a6ac8c8dd457edfb41897b7ac09e64d4eaee71a3178b7014fffeef04`。後續經使用者授權的 v0.15→v0.18 64-seed 完整 preview 實際跑完 384,000 paired cases／768,000 solver episodes、150／150 shards、0 retry／timeout，wall clock 12 分 12 秒。使用者人工觀察四核心約 `86°C`，當時同時有遊戲負載；這支持本機互動式選擇繼續用 4 workers，但不是可信 CPU package sensor、隔離 workload 或 30 分鐘熱穩態 evidence，因此 4 workers 仍只是**使用者授權的 preview 設定**，沒有解除 formal unattended gate。

v0.19 因把 no-step、condition 不變的 Final Appraisal 誤當 sampling spacer 而撤回，不得再用其舊指令。修正後的 v0.20 在 50 families × 3 risks × 10 equipment × 4 worlds × 4 seeds 的 24,000 paired daytime gate 中，相對 v0.18 得到 completion `+554／-0`、quality target `+230／-0`；progress-only completion `+389／-0`、hard-quality completion `+165／-0`。Stable／Balanced／Aggressive completion 分別為 `+121／-0`、`+246／-0`、`+187／-0`；這份 checkpoint 現改作 v0.21 的 native 增量 baseline。

`generic-craft-ts-v0.6-semantic-port-v0.21.0` 已在相同 1,000-case balanced migration corpus 取回 TS 的 completion、stop reasons 與 hard-quality target 計數，utility delta `+0.0000435`；完整 action sequence `93.9%`、aligned actions `99.886%`，所以是 outcome parity，不是逐步 exact parity。v0.20 null-rescue bundle 只有 completion `+1／-0` 且多一個 failed episode，已撤回。

第四批 v0.20→v0.21 的 64-seed preview 已完成 384,000 paired cases／768,000 solver episodes、150／150 shards、0 retry／timeout，wall clock 約 39 分鐘。它證明 Rust 已追回 TS 的整體策略組合，但 full report 也顯示 hard-quality 在 Balanced／Aggressive 分別淨退 `179／160`；progress-only 雖幾乎全數交貨，Balanced／Aggressive 的 meaningful floor 也分別淨退 `1,231／1,784`。因此下一輪不再做「null 才補救」的寬泛 fallback，而先處理 hard-quality 的可重複家族缺口。

第五批候選 `generic-craft-condition-set-portfolio-v0.22.0` 維持一個共用 Rust solver，只在 `requiredQuality > 0`、Balanced／Aggressive，且配方宣告的隨機球色集合屬三組已重複驗證的 Centered＋Pliant 家族時，改用 v0.20 的資源／抽球路線；Stable、progress-only 與其他球色組逐案保持 v0.21。selector 不讀 recipe ID、equipment ID 或未來球序。`native-generic-episode-batch-v3` 把配方的 random-condition mask 納入 immutable episode input，避免 evaluator 與 solver 對球色組各自猜測。

提交前的 full daytime gate 是 50 families × 10 equipment × 4 worlds × 4 seeds，共三種 risk、24,000 paired cases／48,000 solver episodes：Stable `+0／-0` 且全部 outcome 相同；Balanced completion／hard-quality target `+60／-28`、淨 `+32`，failed `4→4`；Aggressive `+67／-30`、淨 `+37`，failed `0→2`。progress-only 全部不變。另以第四批已保存的 64-seed v0.20↔v0.21 paired rows重算相同 selector，Balanced 預期 `+1,032／-499`、淨 `+533`，Aggressive 預期 `+1,070／-522`、淨 `+548`；這只是支持投入第五批的既有資料重播，不是假裝第五批已經跑完。

current offline release smoke binary SHA-256 是 `4446b5498b7cb22839cf558ef4f147753355db54d6e096482d61264b920b4f11`；v3 handshake、v0.21→v0.22 identities、1／1 shard、40 solver episodes、0 retry／timeout 與 completed manifest 已驗證。先建置同 checkout 的 release binary，再執行：

```powershell
& 'C:\Users\User\.cargo\bin\cargo.exe' build --release --offline --manifest-path native/craft-kernel/Cargo.toml
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=native/craft-kernel/target/release/craft-kernel-generic-episode.exe --native-baseline-solver=generic-craft-ts-v0.6-semantic-port-v0.21.0 --native-candidate-solver=generic-craft-condition-set-portfolio-v0.22.0 --workers=4 --output=evaluation-runs/generic-cosmic-overnight-native --run-id=generic-native-v022-64seed-w4-20260825
```

這仍是明示 preview，不得改稱已通過 thermal calibration 的正式 unattended run，也不是實戰成功率。若中斷，以完全相同命令 resume；不要改 baseline／candidate、workers 或 run ID。

同一 case identity 的三組結果必須逐 episode 相同。比較：

- completed episodes／總 wall clock，也就是 episodes/sec；
- 相對 1-worker 的 speedup 與 parallel efficiency；
- shard duration 的 median／p95；
- timeout、retry、invalid output 與 child failure；
- aggregate peak RSS、paging、CPU 使用率、CPU sustained／max temperature、effective clocks、thermal-throttling 與 WHEA／hardware error；
- recommendation p95／p99 只用來觀察 contention，不作 runtime 品質 gate。

測試前先明示可信 sensor、取樣方式、溫度／降頻停止線，以及相對 8.5 小時 global budget 的 projected-wall-clock／headroom acceptance，不得看完結果才調整；sensor path 或自動 guard 尚未驗證時，不能用「程式應該會停」作 unattended safety。超過停止線、持續降頻、paging、timeout、hardware error，或無法在 8.5 小時內保有預先宣告的餘裕都不通過。選擇通過上述 gate 的最小 worker 數；1／2／4 都不通過就禁止 overnight。要嘗試 6／8／12，必須另做完全相同的持續熱校準，不能由歷史 TypeScript 表格恢復資格。

### 2026-08-25 歷史 TypeScript／Node 校準（不適用 Rust）

為了在不先消耗數小時的前提下決定第一晚 worker 數，本次先使用 4 families × 3 risks × 10 equipment × 4 worlds × 2 seeds＝960 episodes；每個 worker count 都是 12 shards、`retries=0`，並使用同一 checkout 與 inputs。

| Workers | Wall clock（秒） | Episodes／秒 | 完成 shards | 失敗 shards |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 294.43 | 3.26 | 12 | 0 |
| 2 | 162.26 | 5.92 | 12 | 0 |
| 4 | 103.87 | 9.24 | 12 | 0 |
| 6 | 89.06 | 10.78 | 12 | 0 |
| 8 | 72.90 | 13.17 | 12 | 0 |
| 12 | 54.15 | 17.73 | 12 | 0 |

這份短矩陣只顯示 TypeScript／Node scheduler throughput，沒有記錄持續溫度，也錯把「沒有 shard failure」當成正式 worker 推薦依據。操作者後續回報：12 與 8 的主機板 LED 讀值約維持 `93°C`，6 在前 10 分鐘約 `90～91°C`，最後以 4 跑完整夜、約 `85～87°C`；sensor 是否確為 CPU package temperature 尚未由程式驗證。這些數字只保存為硬體觀察，不能推估 Rust 溫度或恢復 12-worker 資格。

## Console 進度與時間報告

父程序只在啟動 shard、完成／保存 shard、retry／failure、status 與最終結算時輸出概覽，不逐 episode 洗畫面。進度列包含：

- completed／total shards 與百分比；
- running、failed、pending shards；
- 已通過驗證並保存的 episodes；
- 本次 invocation 已耗時；
- 依本次已完成 shard throughput 外推的粗略 ETA；首個 shard 完成前顯示 `unknown`。

ETA 只用來讓人掌握大致進度；不同 family／risk 的 shard 成本不完全相同，且 worker 競爭與熱降頻會使它漂移，不能當 deadline 保證。

`manifest.json` 的 `timing.currentInvocationWallClockMs` 是這次父程序真正經過的總時間。`timing.currentInvocationAttempts`、`timing.allRecordedAttempts` 與 `timing.completedShardEvaluators` 提供 Rust closed-loop child／evaluator 的 count、total、median、p95 與 max；`shards[].timing` 和 `shards[].attempts[]` 可下鑽到單一 family × risk 的 evaluator 時間、每次嘗試時間、exit code 與 timeout。由於 workers 平行執行，child／evaluator 的 total 是計算工作量加總，可能大於父程序 wall clock，兩者不得混為一談。resume 後 `currentInvocationWallClockMs` 只計這次啟動，不把中間關機或休息時間算成運算時間；跨 invocation 的已記錄 attempts 仍保留在 `allRecordedAttempts`。

## Budget、timeout、retry 與中斷

- 8.5 小時是嚴格 global budget。每個 child 的有效 timeout 是 `min(shard timeout, remaining global budget)`；時間到時可中止正在執行的 shard，避免夜跑無限跨過預期窗口。
- 已驗證並 atomic rename 的 final shards 全部保留。被 budget 中止的 shard 不算完成，下次 resume 從頭重跑該 shard。
- 單一 Rust child crash、timeout、輸出毀損或驗證失敗只消耗該 shard 的 attempt；`--retries` 是每次 invocation 在首次 attempt 後可再嘗試的次數，resume 會重新取得本次額度。每次 retry 都先重驗同一 binary 與 identity evidence，不能改跑 TS；達本次 retry 上限後記錄 failed，其他 workers 繼續。
- engine 無法啟動、debug build、ABI／hash／evidence mismatch 都是 invocation preflight failure，不派發任何 shard，也沒有 fallback。
- 第一次 Ctrl+C／SIGTERM 會停止派發新工作、終止所有 active children、保留 valid finals、刷新 manifest，分別以 130／143 離開。第二次 signal 是強制離開，可能只留下可由下次 scan 判定的 raw／partial。
- 同一 run directory 有 exclusive lock。同一時間只能有一個父 runner；`--status-only` 也不會和正在寫入的 runner 競爭。stale lock 只在確認 owner process 已不存在後保存到 `invalid/` 再恢復。

## 續跑與早上檢查

native preview resume 已實作：重跑完全相同的 semantic command 與 `--run-id`；runner 重新 bundle evaluator、讀取 config，並只從保存的 content-addressed binary snapshot 恢復。workers、time budget、timeout 與 retries 是 operational controls；formal mode 完成後，workers 只能取 calibration evidence 的 permitted 值。

native runner 不只相信舊 manifest。它會重新驗證 config、binary snapshot、engine／ABI／solvers 與 final，恢復已完整寫完且通過驗證的 completed partial，將無效檔移入 `invalid/`，只跳過真正完成的 shards。`workers`、time budget 與 retries 是本次 invocation 的 operational controls；engine／ABI／binary／model hashes、family／risk／equipment／world／seed／兩個 solver arms 等 semantic axes 必須維持一致。不符時拒絕整個 invocation，不能把不同 engine 的 shards 混在同一 run。

只檢查並重建狀態，不啟動 evaluator：

```powershell
npm run evaluate:generic-cosmic-overnight -- --status-only --run-id=generic-night-01
```

legacy TS `--status-only` 依原 config／schema 驗證；缺少 native evidence 不是 corruption，新 runner 不得替它補資料、改 config 或移動 valid shards。若原 run 使用非預設 `--family-limit`、`--risk`、`--seed-count`、`--base-seed` 或 `--baseline-dir`，status 命令也要帶相同 semantic options。native `--status-only` 只驗保存的 config／identity evidence／finals，不啟動 child；若 binary snapshot 缺失，標示 `resume blocked`，但不得使既有 valid evidence 失效。

native preview status 必須重送原 axes、兩個 solver IDs、`--engine=rust-native --native-preview`、明示 workers 與相同 `--run-id`；它不執行 episode，但仍重驗 evaluator identity 與 binary snapshot。

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

evaluation-runs/generic-cosmic-overnight/.artifacts/<binary-sha256>/
  craft-kernel-generic-episode(.exe)  exact release executable snapshot
```

native schema 已保存 exact executable、engine／ABI／handshake、binary SHA、solvers 與 evaluator bundle identity；`config.json` 鎖其 hashes，每個 native shard 回報 engine／ABI／binary／solver identity，final validator 逐 row 核對完整 axes 與 paired case。worker-calibration evidence 尚未加入，因此 formal mode仍 blocked。legacy TS run 依原 owner layout 解讀。manifest 是可重建的索引。不要手改 JSON 讓 incomplete 看似完成，也不要把 ignored 的 `evaluation-runs/` 當暫存清掉。

## 結果解讀底線

### 完成與品質必須分開

- `progress-only`：recipe 的 mechanics `requiredQuality=0`；`completed` 只證明作業進度完成、可以交貨，不表示品質滿或達到有意義分數。
- `progress-and-required-quality`：`completed` 同時要求作業進度與 mechanics 的最低品質硬門檻；仍不一定等於最大品質。
- `qualityTargetReached`：是否達到這個 recipe/objective 宣告的品質目標；只有該目標本身等於最大品質時，才能解讀為滿品質。

報告的主要 cell 至少是 family × equipment profile／tier × risk × world，並分開上述兩種 completion contract 與 quality target。difficulty cross-view 依 [`algorithm_verification.md`](../skills/domain/algorithm_verification.md) 的事前 schema；可信 schema 完成前保留 per-family cells 與 provisional 標示。全 catalog 混合 completed 只能作 overview。

### Assumption 與能力上界

- 四個 worlds 只證明在該 assumption 下的 sensitivity／stress 結果。
- seeds 加深 sampling precision，不修正錯誤或未知的 condition transition model。
- optimistic／clairvoyant witness、目前 solver 分數與夜間大量樣本，都不能單獨回答「已到裝備數理極限」。能力極限仍需要 causal upper／lower bound、可重播 witness 與相稱的未知分布邊界。

### 並行 latency 不是 UI SLA

多個 Rust evaluator children 會競爭 CPU cache、記憶體頻寬、排程與散熱餘裕。夜間報告中的 recommendation p95／p99 是「這台開發機在 N workers throughput run 下」的量測，不是玩家裝置的單請求 latency，也不能和不同 worker 數的 baseline 直接比較。worker 校準看 episodes/sec 與持續熱狀態；Web p95 `<1s` 與 `3000ms` watchdog 要用隔離、代表性目標裝置另測。

## GPU 邊界

這一輪不接 GPU。先完成並 profile Rust generic closed-loop；其分支多、每步狀態不同，直接增加 GPU 不會自動加速，反而需要另一份扁平資料表示、batch kernel、傳輸與 parity contract。

只有同時滿足下列條件才重新評估 GPU：

1. Rust 1／2／4-worker 持續 benchmark 證明 CPU throughput 仍無法守住需要的窗口；
2. Rust profiler 證明大部分時間集中在可大量 batch、分支可控的數值 hot path，而不是 policy control flow 或檔案序列化；
3. 單批工作夠大，預期收益能攤平 CPU↔GPU 傳輸與啟動成本；
4. 已有固定 schema、deterministic CPU oracle、逐 case parity、錯誤回退與目標機器 benchmark；
5. 相較已完成的 Rust closed-loop CPU core，GPU 有量測上的額外價值。

在這些證據出現前，優先使用獨立 CPU child 的 bounded parallelism；不要為了硬體存在就建立第二份難以驗證的 solver truth。
