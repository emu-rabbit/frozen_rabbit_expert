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

缺少自動溫度感測不會自動使 solver 結果失效。若可取得可信 sensor，優先把溫度、有效時脈、降頻與停止線接入 manifest／console；若做不到，agent 在交付時提醒使用者自行監看溫度與散熱，決定 worker 數。

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

現行 native runner 仍要求 `--native-preview`；這是 CLI mode 名稱，不代表結果統計上無效，也不授權 agent 啟動。

命令至少明示：

- `--engine=rust-native`；
- `--native-preview`；
- release `--native-binary`；
- baseline／candidate solver identities；
- workers；
- seed／axes 或 preset；
- time budget、shard timeout、retries；
- output root 與唯一 run ID。

不要從本文件複製固定 IDs。Agent 每次由 current binary handshake 與 `--help` 生成可直接執行的 exact command。

## Resume

- 使用完全相同的 semantic config 與 run ID 重跑。
- Runner 驗證 immutable config、content-addressed binary snapshot 與 completed shards。
- Valid finals 跳過；partial／invalid shards 依 contract 重跑或隔離。
- Workers、budget、timeout 等 operational controls 只有 CLI 明確允許時可調整。
- 不用新的 binary 或 solver identity 覆蓋舊 run directory。

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

完整 50-family run 在成功收尾，或 `status-only` 確認完整時，另生成可由 Git 追蹤的 `reports/generic-cosmic-overnight/<run-id>.md`，console 必須顯示其絕對路徑。這份自動檔只包含固定 Balanced × `balanced-iid` × E02／E09 切片的四張量尺表，不包含策略判讀；完整分析仍由後續 task 讀原始 evidence 後進行。Smoke／partial axes 不冒充完整四表，console 要明示 skipped 原因。

四表在原本四種 objective 分表內，每個主要量尺只顯示 candidate，後方小括號顯示 `candidate − baseline`，不另列 baseline 數值。製作長度只保存 candidate 完成／未完成的 p50／max，括號同樣顯示相對 baseline 的差值；優先使用實際推進工序數 `S`，舊 evidence 沒保存 `S` 時整列回退使用全部技能數 `A`。這是初判入口，不是任務時間成敗判定；p90／p95、A／S 雙量尺、baseline 絕對值與更細切面的長尾仍從 raw evidence 分析，沒有任務倒數、動畫與玩家延遲證據前不得自訂門檻。

不逐 episode 輸出。

## 安全中止與溫度

- 優先從較低 worker 數開始；throughput 不是唯一選擇依據。
- 使用者可隨時中止；atomic shard 與 manifest 應保留已完成工作。
- 高溫、持續升溫、有效時脈下降、paging、WHEA／hardware error 或異常 timeout 時停止。
- 若 agent 修改的 workload 可能顯著增加 CPU 時間或 branch cost，交付時主動提醒重新觀察溫度。
- Sensor integration 若尚未驗證，不宣稱有自動 thermal guard。

## Exit 與資料完整性

- Exit `0`：依當次 CLI 定義完成或 status 確認完整。
- Exit `75`：budget 用完但可續跑，不當成 corruption。
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

完整 run 先確認資料有效，再依 [algorithm_verification.md](../skills/domain/algorithm_verification.md) 分別驗收正確性、搬移一致性或策略效果。結果 task 讀完整 evidence 後提出收益、代價、不確定性及重要切片，使用者決定研究 baseline、後續實驗或產品採用。

## 歷史資料

舊 worker calibration、run numbers、solver identities與命令只在 [archive snapshot](../archive/workflows/run-generic-overnight-evaluation-before-2026-08-26.md) 查閱。它們不能直接用於新 run。
