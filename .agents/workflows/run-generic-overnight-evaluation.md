# Generic Cosmic 長時間評測工作流

## 文件角色

本檔規範如何準備、交付、續跑與判讀長時間 generic evaluation。Solver identity、workload 與結果以當次 CLI／config 為準，不在 workflow 保存歷史 run 數字。

## 權限邊界

- 長跑只能由使用者啟動。
- Agent 可以建置、跑 bounded smoke、驗證命令與檢查既有結果。
- 交付完整 run／resume／status 命令後，agent 結束 task，不保持對話等待。
- 使用者日後提供結果時，以新的 task 驗證。
- Agent 不因 terminal condition「完成」而擴張成代替使用者啟動長跑。

## 結果有效性與硬體責任分開

Evaluation evidence 是否有效，看 config、binary、identities、shards、case rows 與 validation。

溫度與持續負載影響的是：

- 使用者是否願意 unattended 執行；
- worker 數是否適合該台機器；
- throughput／thermal claim 是否可重用。

缺少自動溫度感測不會自動使 solver 結果失效。已提供 AMD SDK 溫度 reader 與可選的動態 worker／停止線，見下方操作方式。使用者已停止降頻研究；目前不偵測 HTC／PROCHOT，不把有效時脈下降當作熱降頻。未啟用或未驗證感測時，交付仍須提醒使用者自行監看溫度與散熱。

## Agent 交付前檢查

1. 執行 `git status --short --branch`，記錄 exact checkout。
2. 讀 `current_state.md`、`overnight_review_brief.md` 與本 workflow，以 active brief 固定本輪版本、假說、主要效果、可接受代價與停止條件。尚未選定新 candidate 時先完成實驗規劃，再準備執行交付。
3. 建置 Rust release binary：

~~~powershell
cargo build --release --offline --manifest-path native/craft-kernel/Cargo.toml
~~~

4. 驗證 CLI 與 runner tests：

~~~powershell
npm run test:generic-cosmic-overnight
npm run evaluate:generic-cosmic-overnight -- --help
~~~

5. 依本輪 baseline／candidate 準備 bounded native smoke。先核對 `package.json` 的快捷命令與 brief 身份相同時，使用：

~~~powershell
npm run evaluate:generic-cosmic-overnight:native-smoke
~~~

6. 若快捷命令屬於舊實驗，改用明示本輪 identities 的 CLI smoke 命令；核對 binary handshake、axes、episode budget 與 output path。
7. 用當次 exact identities 組出 full run、resume 與 status-only 命令。
8. 說明預估 workload、workers、timeout、global budget、disk、溫度風險與安全中止方式。
9. 停止工作，讓使用者自行執行。

完整 run 的下一個結果 task 先讀 active review brief，再依其中的預先聲明切片檢查四表與 raw evidence。本輪決策完成後才將 brief 移入 archive，避免舊成功標準繼續指揮下一版。

Smoke 成功只驗證路徑，不代表 solver 效果、長時間溫度或整體 run 已通過。

## Full command 組成

跨版本比較沿用使用者確認的 families、equipment、risk、world、每格 seed 數、base seed 及 action limit。效能需求透過計算優化與 operational controls 處理；案例範圍的變更由使用者明確確認。交付使用既有 `npm run evaluate:generic-cosmic-overnight -- ...` 介面，並列出可直接執行的完整命令。

裝備與球色世界由 runner 的正式軸參數控制：

- `--equipment=all` 是預設完整裝備集；子集合可寫 `--equipment=E02,E09`，也可使用 evaluator description 公布的 exact equipment IDs。`E01` 起按該 description 的 canonical 順序編號，config 保存解析後 ID，不把簡碼當結果 identity。
- `--world=all` 是預設完整 world 集；子集合使用 exact IDs，例如 `--world=balanced-iid,opportunity-scarce-iid`。
- Runner 依完整 canonical 裝備 × world 座標計算 paired seed；縮小 axes 不得重新壓縮座標，因此相同 base seed 的切片與全量 run 仍是同一批案例。
- 輸入順序會 canonicalize；未知、重複、空白或 `all` 混用都 fail closed。
- 裝備與 world 屬於 immutable semantic config。Full、resume、status-only 與 historical-baseline command 必須重送相同選擇；改軸要使用新的 run identity，不能把舊 run directory 改成另一份案例集。

現行 native runner 仍要求 `--native-preview`；這是 CLI mode 名稱，不代表結果統計上無效，也不授權 agent 啟動。

命令至少明示：

- `--engine=rust-native`；
- `--native-preview`；
- release `--native-binary`；
- baseline／candidate solver identities；
- workers；
- seed、family、risk、equipment、world 等 axes；
- time budget、shard timeout、retries；
- output root 與唯一 run ID。

不要從本文件複製固定 IDs。Agent 每次由 current binary handshake 與 `--help` 生成可直接執行的 exact command。

## Resume

### Native 歷史 baseline 沿用

Native 模式可指定 `--baseline-dir=<已完成 run 或其 shards>`；來源為原 report v4 的 candidate arm。本次只執行 `--native-candidate-solver`，將来源 candidate 讀入 baseline，不啟動第二套 baseline 求解。來源與新 run 可以共用 evaluator bundle，因為 native solver identity 位於 binary／CLI 中。

Preflight 核對來源 config／report／bundle／binary 身份及完成狀態、ABI／mechanics、family、裝備、world、品質契約、base seed、每格 seed 數與 action limit。每筆 case fingerprint／paired seed 仍須一致；來源缺失、受修改或比較契約不同時拒絕沿用。

Report v5 分開保存 `executedEpisodes`、`reusedEpisodes` 與邏輯配對 rows；開始時 console 明示本次執行量與沿用量。歷史 baseline 的逐次計時保留，但 `baselineWallClockMs` 為 null，不能當成本次同負載效能比較。四表差值比較同一案例成果，不代表新的獨立保留集。

目前支援從完整 v4 source 沿用；不接受 v5 再轉接成多代歷史來源。若需要後續多代沿用，先擴充並驗證 provenance contract，不能手動改 schema 或假造執行時間。

- 使用完全相同的 semantic config 與 run ID 重跑。
- Runner 驗證 immutable config、content-addressed binary snapshot 與 completed shards。
- Valid finals 跳過；partial／invalid shards 依 contract 重跑或隔離。
- Workers、budget、timeout 等 operational controls 只有 CLI 明確允許時可調整。
- 不用新的 binary 或 solver identity 覆蓋舊 run directory。

### 累積耗時與剩餘時間

Console 的 `elapsed ... cumulative` 與 `timing.activeWallClockMs` 累加同一 run 的各次實際執行時間，包含失敗／中止的運算成本，但排除兩次啟動間的停機時間；`this invocation` 保留本次耗時。`--status-only` 不增加累積耗時。

ETA 以「累積耗時 ÷ 全部已完成 shards × 尚未完成 shards」重算，續跑不必等第一個新 shard 完成才有估值。尚無已完成 shard 或可用時間時顯示 unknown；只有全部完成才是零。不同 family 成本、worker 數或負載變動會影響估值，它不是精準 deadline。`--time-budget` 仍限制每次 invocation，不會扣掉前幾次已用時間。

Runner 在進度變動與每 30 秒原子保存 manifest。正常 Ctrl+C 等待子程序清理後保存最後耗時；強制關閉／斷電只能保留最後成功 checkpoint，通常少掉最後約 30 秒，I/O 或事件迴圈阻塞時可能更多。不要連按 Ctrl+C 取代正常收尾。

舊 manifest 自動從已記錄的 attempts、完成 shard 起訖與最後一次非 status invocation 重建時間區間，合併平行 worker 的重疊區間，不把並行 child 時間直接加總，也不把整晚停機算進去。Console 的 `legacy reconstructed` 與 `timing.activeWallClockHistorySource=legacy-intervals` 會持續標明這是歷史下界；未保存的舊運算／啟動時間無法精確補回。新增的 timing 欄位不改 immutable config、solver identity 或既有 shard 格式。

## Status-only

Status command 必須重送原 run 所需的 semantic options與 run ID，並加 `--status-only`。它只驗證／重建 manifest，不啟動 child episode。

Console／manifest 至少顯示：

- completed／total shards 與百分比；
- running／failed／pending；
- saved episodes；
- elapsed 與粗略 ETA；
- retry／timeout；
- config、binary、solver identity；
- run 是否完整、可續跑或 blocked。

50-family run 在成功收尾，或 `status-only` 確認完整時，若 axes 包含 Balanced × `balanced-iid` × E02／E09，另生成可由 Git 追蹤的 `reports/generic-cosmic-overnight/<run-id>.md`，console 必須顯示其絕對路徑。這份自動檔只讀固定切片並生成四張量尺表，不包含策略判讀；完整分析仍由後續 task 讀原始 evidence 後進行。缺少固定報表所需的 risk、world、E02 或 E09 時不冒充完整四表，console 要明示 skipped 原因；其他未納入報表的裝備／world 可按本輪假說暫停，而不影響固定切片的報表資格。

四表在原本四種 objective 分表內，每個主要量尺只顯示 candidate，後方小括號顯示 `candidate − baseline`，不另列 baseline 數值。製作長度只保存 candidate 完成／未完成的 p50／max，括號同樣顯示相對 baseline 的差值；優先使用實際推進工序數 `S`，舊 evidence 沒保存 `S` 時整列回退使用全部技能數 `A`。這是初判入口，不是任務時間成敗判定；p90／p95、A／S 雙量尺、baseline 絕對值與更細切面的長尾仍從 raw evidence 分析，沒有任務倒數、動畫與玩家延遲證據前不得自訂門檻。

不逐 episode 輸出。

## 安全中止與溫度

- 優先從較低 worker 數開始；throughput 不是唯一選擇依據。
- 使用者可隨時中止；atomic shard 與 manifest 應保留已完成工作。
- 中止驗證涵蓋 evaluator 及其原生子程序。Windows 使用本次 spawned PID 的程序樹中止，POSIX 使用 evaluator 自有 process group；完整 run 的 native timeout 由 shard timeout 傳入。
- 自動溫控只依下方已定義的溫度與感測失聯條件停止；paging、WHEA／hardware error 或異常 timeout 仍需人工注意，不宣稱已有全部硬體事件監測。
- 若 agent 修改的 workload 可能顯著增加 CPU 時間或 branch cost，交付時主動提醒重新觀察溫度。
- Sensor integration 若尚未驗證，不宣稱有自動 thermal guard。

Windows CPU 溫度來源、MSI Center／AMD SDK 的本機調查與獲授權的短測結果，見 [溫度研究紀錄](../../reports/generic-cosmic-overnight/runner-temperature-investigation-20260828.md)。SDK 三筆讀值、模擬溫控測試與真實負載下的長期穩定性是不同層級的證據。

### 溫度窗口與動態 worker

啟用 `--temperature-file=PATH` 才有自動溫控；省略時 console 明示 DISABLED，沿用固定 worker。`--workers=N` 是起始數量，`--max-workers=M` 是增員上限，不改 CPU 核心親和性、時脈、電壓或風扇。上限未指定時為 `max(N, auto worker 數)`，其中 auto 是 `min(8, max(1, floor(logical threads / 3)))`；這只是操作限制，不是已校準的安全 worker 數。建議命令明示兩者。

| 條件 | 動作 |
| --- | --- |
| 開始／續跑 | 取得三筆不同且有效的 <90°C 讀值，再以指定的 `--workers` 開始；不是從較少 worker 慢慢爬升。30 秒仍未達啟動條件就停止。 |
| ≥93°C | 單筆有效讀值即停止全部 evaluator 程序樹。 |
| 最近 5 分鐘內，≥90°C 累計達 60 秒 | 停止全部 evaluator 程序樹；不要求連續高溫。`--thermal-window=5m` 可改成 1 分鐘至 1 小時。 |
| ≥90°C 持續 20 秒，尚未達停止條件 | 在滿 20 秒後的第一筆有效高溫讀值減 1 worker，最低 1 個；每次減員後重新觀察 20 秒。任一筆 <90°C 重置這段連續計時，但不清除 5 分鐘窗口的累計高溫時間。 |
| <82°C 持續 120 秒 | 加 1 worker，不能超過 `--max-workers`；每次加員後重新計時，且距上次增減至少 60 秒。任一筆 ≥82°C 重置低溫計時。 |
| 有效讀值逾 10 秒未更新，reader 明示錯誤／停止，資料格式無效或 reader 重啟 | 停止，不把未知當成低溫，也不自動恢復。 |

低溫增員必須在目前目標 worker 都有工作、且仍有排隊 shard 時才累計；尾端只剩少數工作造成的降溫不拿來提高目標。控制根據上一筆有效讀值估算取樣間隔的高溫時間；約 3 秒取樣無法捕捉所有瞬時峰值，也不能保證實體溫度不越過門檻。這些數字是使用者選定的工作停止政策，不是硬體安全規格。

減 worker 時立即中止超出目標 slot 的 evaluator 與其原生子程序，未完成 shard 以 `thermal-rescheduled` 排回佇列，不消耗失敗重試次數。這會損失該 shard 本次尚未保存的運算；已驗證 finals 不重跑，恰好已輸出完整有效結果則仍收下。增員不改案例、seed、solver 或 deterministic budget。每次 attempt 保存起始 target／active worker 數，整段變動以 thermal event log 為準。

滑動窗口以時間老化，不以每 5 分鐘整點清零，也不因瞬間降溫清零。近期高溫區間會隨 manifest 保存；短暫停止後續跑仍保留窗口內紀錄，但不把停機時間當作高溫或運算時間。`status-only` 不讀 sensor、不調整 worker，保留前次 thermal observation；新的執行重新驗證感測並使用本次指定的起始 workers。停止後須人工確認再重跑，不自動重啟。

### AMD reader 操作

在使用者另外開啟的「系統管理員 PowerShell」執行以下 reader；**runner 留在一般權限 PowerShell**。這不授權 agent 自行提權或代跑徹夜。Reader 固定使用本機已驗證的 `GetPMTableData`、AMD CLI 簽章／SHA-256 及既有 Running 驅動，無 API 名稱參數，不安裝／啟動驅動，不修改硬體設定。SDK 版本或 driver 改變時拒絕執行，先重新查核。

~~~powershell
& '.\tools\evaluate-generic-cosmic-overnight\read-amd-temperature.ps1' -OutputPath '.\.tmp\overnight-cpu-temperature.json' -DurationMinutes 720
~~~

在原本已確認的完整 run 命令中，保留 semantic options／run ID，將 worker 操作參數設為以下例子（4 起跑，最多 8）：

~~~text
--workers=4 --max-workers=8 --temperature-file=.tmp/overnight-cpu-temperature.json --thermal-window=5m
~~~

續跑仍使用相同完整命令與 sensor 路徑；只查狀態時加 `--status-only`，不必啟動 reader。不要用新增 run ID 取代續跑。Reader 約每 3 秒讀一次，每次 CLI 呼叫上限 3 秒，預設最多運作 12 小時；run 完成後在 reader 視窗 Ctrl+C 收尾。強制關掉 reader 時，runner 最遲在失去新讀值的 10 秒門檻停止（事件迴圈／OS 阻塞會增加延遲）。Reader 是獨立程序，不會因 runner 結束就自動關閉。

`manifest.thermal` 保存 policy、最後溫度、窗口累積、目標／最大 worker 與停止原因；`logs/thermal-<time>-<pid>.jsonl` 保存每筆樣本、增減與停止事件。新參數不進 immutable config fingerprint，既有 run 可接上溫控，不改 solver identity；ETA 仍用累積運算時間粗估，worker 變動時不承諾線性準確。

## Exit 與資料完整性

- Exit `0`：依當次 CLI 定義完成或 status 確認完整。
- Exit `75`：budget 用完但可續跑，不當成 corruption。
- Exit `76`：溫度護欄或感測失聯停止；檢查 `manifest.thermal.stopReason`，人工處理後再續跑。
- 其他非零：先看 preflight、shard validation、timeout 與 manifest；不直接刪 run。
- 同一 output 同時只允許一個 parent writer。
- Raw／partial／invalid evidence 分區保存；只有 validated finals 進 aggregate。
- 自動四表只讀 completed shards；生成失敗要讓 invocation 非零退出，但不得破壞已完成的 manifest 或 shard evidence。

## 結果判讀

至少分開：

- progress-only delivery；
- 一般收藏品 100／300／700／滿品質四檔與 Master 連續品質；
- hard-quality 滿品質；
- HQ 50%／75%／100% protected floors 與所有 risk 共用的完整 HQ 機率 utility；
- family × equipment × risk × world；
- paired wins／losses與 completion regression；
- policy-null、action-limit、illegal、terminal failure；
- 完成／未完成的全部技能數與推進工序數 p50／p90／p95／max，並定位 family × equipment × risk × world 長尾；
- latency 與 workers；
- assumed worlds、synthetic equipment 與 live evidence。

Native report v4 的每個 episode 保存依呼叫順序排列的 `recommendationDurationsNs`，包含以空白建議結束的那次呼叫；終局沒有呼叫時為空陣列。驗證 samples 長度等於 `recommendationCalls`、總和等於 `recommendationNs`、最大值等於 `recommendationMaxNs`。百分位使用合併後的原始 samples 及 nearest-rank，單位為 ns。各次 attempt／completed shard 的 worker 配置提供量測脈絡；舊報告缺少逐次 samples 時保留 unknown。固定四表維持原量尺，延遲分析由原始資料另外切分。

完整 run 先確認資料有效，再依 [algorithm_verification.md](../skills/domain/algorithm_verification.md) 檢查正確性並比較求解效果與成本。結果 task 讀完整 evidence 後提出收益、代價、不確定性及重要切片，使用者決定研究 baseline、後續實驗或產品採用；具體落差透過相關案例重播診斷。

## 歷史資料

舊 worker calibration、run numbers、solver identities與命令只在 [archive snapshot](../archive/workflows/run-generic-overnight-evaluation-before-2026-08-26.md) 查閱。它們不能直接用於新 run。
