# Rust solver overnight brief：球色工作排程 active candidate

`last_updated: 2026-09-02`

## 目前決定

`generic-craft-route-portfolio-v1.13.0` 是本輪 active overnight candidate。相同行為先以 `generic-craft-route-portfolio-exp-condition-work-scheduler` 通過當時涵蓋三個 risk axes 的 50-family 結構 gate，確認具備可解釋且跨軸的玩家收益後才取得 v1.13 版號。2026-09-02 起產品與後續迭代只支援預設策略 `Balanced`；Stable／Aggressive 的既有結果保留作歷史證據，不再消耗 full-run 或策略維護成本。完整 Balanced 64-seed 評測通過前，v1.13 仍未取代 `generic-craft-route-portfolio-v1.12.0`。

結構 gate 的 release binary SHA-256 是 `66cdbb077453862c340af66b2186f6eb4b153f4733423ff49a2c1ef4682c1f1a`；v1.13 只將該行為從描述性實驗 identity 升為數字候選，沒有再改策略。最終 v1.13 release binary SHA-256 是 `6624aa18793fd00b393d4b355b719a768e9740014ca994e2ba7694ff6a7ca79c`，fresh baseline 是 `generic-craft-route-portfolio-v1.12.0`。不要啟動或續跑已撤回的 `generic-native-condition-option-master-vs-v112-fresh-balanced-64seed-20260831`。

## 2026-09-02 球色工作排程 bounded 證據

- 候選不再依 objective／risk 從 v1.12 頂層回到 v1.1；所有目標共用同一 route portfolio，依 mechanics 動態提出能利用當前球色的作業、品質、混合、準備與資源工作，並允許原 funded route 在球色插隊後恢復。
- 已支付 setup 且 consumer 可用時，只允許能吃到當前球色、擁有完整 funded continuation 或立即完工的工作取代它。這直接保存工作投資，不以 objective 綁定舊 solver 間接取得穩定性。
- `capture` 比較同一工作現在與 Normal 的 mechanics 收益；`reservation` 只指出同一工作在配方宣告之其他球色能取得的最佳收益。它只用於淘汰明確錯配的未投入準備／資源工作及輸出診斷，不是未來 RNG 預測或額外 utility。
- 36 families × E02／E09 × `balanced-iid`／`opportunity-scarce-iid` × 2 seeds，共 288 paired cases：完成 241→245、滿品質 173→179、平均 utility 207.47→211.98；p95 26.18→48.10 ms。直接退回共同舊基礎路線的 ablation 只有完成 243、滿品質 162，因此不採用。
- 50 families × Stable／Balanced／Aggressive × E02／E09 × `balanced-iid`／`opportunity-scarce-iid` × 4 seeds，共 2,400 paired cases：完成 1,954→1,984、滿品質 1,162→1,261、utility total 1,555.176→1,654.037。配對為完成 62 勝／32 敗、滿品質 181 勝／82 敗、utility 558 勝／278 敗，0 illegal、0 policy-null、0 action-limit。
- 三個風險的 utility delta 分別為 Aggressive `+12.854`、Balanced `+17.294`、Stable `+68.714`；兩個 worlds 分別為 `+54.621`、`+44.240`，四個 seed 各自也都為正。硬品質完成／滿品質是 59 勝／22 敗，三個風險都淨正向；收益不是由單一風險、world 或 seed 撐起來。
- 一般收藏品完成是 2 勝／8 敗、HQ 完成 0 勝／2 敗，但一般收藏品滿品質是 101 勝／38 敗、utility `+48.401`，HQ utility `+4.150`。這些地板退步分散在少量 family／seed，bounded gate 沒顯示全面崩壞；完整 64-seed 結果仍必須把完成地板獨立列為採用阻擋項，不能用品質總收益遮掉。
- 單步 recommendation baseline／candidate 為 mean 5.688→13.824 ms、p95 29.157→63.992 ms、p99 54.905→119.352 ms、max 148.371→503.552 ms。候選約慢 2.4 倍，但仍在主要求解器 3 秒契約內；50-family gate 150／150 shards、0 timeout，wall time 6 分 18 秒。完整四表入口見 [readiness gate 報告](../reports/generic-cosmic-overnight/condition-work-readiness-gate-50f-3risk-2world-4seed-20260902.md)。
- 未來球色負向保留稅、Normal bridge 與便宜 greedy continuation 的 broad 退步版本均已移除，不以局部補丁繼續追。

## 撤回理由

- 400-case bounded gate 的分母是 400：完成 `+1`、檔位 `+22`、滿品質 `+11`、品質 `+69,109`，49 勝、14 負、337 平。
- 換算每 100 cases 是 `+5.5` 檔位與滿品質率 `+2.75` 個百分點，但 84.25% cases 完全持平，收益集中度高。
- 同一批 baseline／candidate wall time 為 39.804／174.423 秒，約 4.4 倍；這個增幅遠大於可重複的玩家收益。
- all-Normal 的主要提升來自昂貴 continuation certificate，不是球色預備；改成便宜固定 suffix 後，收益由檔位／滿品質 `+13／+7` 縮成 `+6／+1`。
- 強迫消費特殊球、永久保留 finalist、雙 route、productive bridge 與 HQ extension 等 ablation 都沒有找到兼具泛化收益與合理成本的版本。
- incomplete overnight 的已完成 shards 只涵蓋 F03／F05；昂貴 families 多次 timeout，因此其 latency 分布不能代表完整 50-family corpus。

完整數字、失敗 ablation 與可重用假說見 [球色資訊邊界與撤回報告](../reports/generic-cosmic-overnight/condition-information-boundary-and-option-planning-20260831.md)。

## 保留的產品正確性

- evaluator 可以用私有權重抽下一球，但 solver、Web planner identity、dataset 與 cache 不得接收、保存或推導這些權重。
- solver 只知道配方宣告可能出現哪些球色，以及玩家已回報的實際球色；舊 MPC 由 declared condition mask 建立等權重內部 model。
- recipe／equipment ID、episode seed 與未來 RNG 不得成為 selector、planning seed 或 semantic cache feature。
- 未來新增球色可依 declared set 與 observed state 泛化處理；在不知道權重時，不把完成能力押在某球一定會出現。

## 可重開但必須獨立的假說

1. **Master objective extension：**960 paired cases 完成 945→960，所有 equipment／world 的平均 continuous utility 為正，但滿品質尾端淨 `−8`。若重開，只測 objective-kind extension，不帶回 option planning 或 certificate。
2. **稀疏深搜：**先找只在可觀測 state 證明有價值的小型 selector，再允許局部深搜；必須先證明命中率、miss regression 與 bounded wall cost，不能直接擴大每步候選。
3. **玩家紀錄：**匿名 opt-in 的完整 observed state、推薦／實際技能、成敗、下一球色、undo／resync 與終局結果，可用來建立真實 state corpus。紀錄用於離線評測與發現 selector，不把私有或個別 episode 的球色比重偷渡進 runtime。
4. **集中加工診斷：**400 個 v1.12 Balanced episodes 中，Good 當下選集中加工 473 次、胚料加工 87 次。下一輪若研究這個選擇，需先保存完整 state／candidate score，而不是加入「Good 一律集中加工」硬規則。

## Active overnight 契約

本輪 run ID 固定為 `generic-native-v113-vs-v112-balanced-e02-e03-e07-e09-e10-2world-64seed-20260902`。評測範圍是 50 families × Balanced × E02／E03／E07／E09／E10 × `balanced-iid`／`normal-heavy-iid` × 64 seeds，共 32,000 paired cases／64,000 executed arms；`base-seed=20260824`，不在途中加入 strategy、裝備或 world。

原本含三個 risk axes 的 `generic-native-v113-vs-v112-e02-e03-e07-e09-e10-balanced-normal-heavy-64seed-20260902` 已安全中斷：15／150 shards 完成，Stable／Balanced／Aggressive 各 5，0 failed。不要續跑它。5 個已完成的 Balanced shards 可供診斷，但其 run ID 與 config fingerprint 屬於舊 immutable manifest；本輪不增加搬運／改寫 evidence 的特殊路徑，直接重跑完整 50 個 Balanced shards。

本輪必須 fresh 執行雙臂，不能使用 `--baseline-dir`。目前沒有已完成且與上述 families、Balanced、equipment、worlds、64 seeds、base seed、action limit 及資訊邊界一致的 v1.12 source；4-seed readiness gate 的 semantic config 不同，既有 64-seed fresh run 則未完成且 axes 不同。更早的 v1.12 full-run 位於 evaluator-private condition weights 修正前，不能當足夠意義匹配的 baseline。本輪會保存 fresh v1.12 baseline arm，但現行 `--baseline-dir` 只接受來源的 candidate arm，不能直接沿用它；未來若要省掉舊版計算，必須先擴充並驗證 baseline-arm reuse，或另建相同 axes 的 v1.12-as-candidate source。

- 先看整體完成、滿品質與 objective utility，再拆 family × equipment × world；不得只用 aggregate 宣稱採用。
- hard-quality 的完成即滿品質，必須維持淨正向，且不能在某個 family × equipment × world 形成跨 seeds 的結構性崩壞。
- progress-only 的完成地板獨立判讀。bounded gate 已知的一般收藏品 8 個與 HQ 2 個完成退步若在 64 seeds 擴成穩定模式，就阻擋採用；不能拿額外滿品質勝場抵銷未揭露的交貨退步。
- illegal、合法非終局 policy-null 與 action-limit 必須維持 0；single-recommendation p95／p99／max 必須保持在 3 秒主求解器契約內，並與玩家收益一併判讀。
- 完整結果只決定是否升數字版與採用，不因少量個案直接補規則；若不通過，回到可解釋的跨配方策略層判斷。

策略行為已由結構 gate binary 完成 bounded run；最終 v1.13 binary 已完成 build、identity smoke、同 run resume 與 status-only。實際 unattended 啟動前，使用者仍需在管理員 PowerShell 啟動 AMD temperature reader；runner 必須帶 `--temperature-file`，讀值未就緒或失聯時 fail closed。Agent 不代為啟動長跑。

## 使用者啟動命令

先在管理員 PowerShell 啟動 temperature reader：

~~~powershell
& 'C:\Users\User\Documents\GitHub\frozen_rabbit_cosmic\tools\evaluate-generic-cosmic-overnight\read-amd-temperature.ps1' -OutputPath 'C:\Users\User\Documents\GitHub\frozen_rabbit_cosmic\.tmp\overnight-cpu-temperature.json' -DurationMinutes 720
~~~

再在 repository 的一般權限 PowerShell 啟動完整 run：

~~~powershell
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=native/craft-kernel/target/release/craft-kernel-generic-episode.exe --native-baseline-solver=generic-craft-route-portfolio-v1.12.0 --native-candidate-solver=generic-craft-route-portfolio-v1.13.0 --family-limit=50 --risk=balanced --equipment=E02,E03,E07,E09,E10 --world=balanced-iid,normal-heavy-iid --seed-count=64 --base-seed=20260824 --workers=4 --max-workers=8 --temperature-file=C:\Users\User\Documents\GitHub\frozen_rabbit_cosmic\.tmp\overnight-cpu-temperature.json --thermal-window=5m --time-budget=8.5h --shard-timeout=30m --retries=2 --output=evaluation-runs/generic-cosmic-overnight --run-id=generic-native-v113-vs-v112-balanced-e02-e03-e07-e09-e10-2world-64seed-20260902
~~~

續跑使用完全相同命令；只看狀態時在末尾加 `--status-only`，不需啟動 temperature reader。依 4-seed gate 的 6 分 18 秒線性換算約 1 小時 24 分，但實際時間會受新增裝備、溫控調整、family 成本與系統負載影響；8.5 小時是可續跑的單次 invocation 上限，不是預估完成時間。
