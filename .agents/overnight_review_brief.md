# Rust solver overnight brief：目前沒有 active candidate

`last_updated: 2026-08-31`

## 目前決定

本輪 `generic-craft-route-portfolio-exp-normal-route-certificate` 與 `generic-craft-route-portfolio-exp-condition-option-planning` 已撤回。不要啟動或續跑 `generic-native-condition-option-master-vs-v112-fresh-balanced-64seed-20260831`；該 run 只完成 2／50 shards，另有 7 次完整 30 分鐘 timeout 與 4 次中斷，不能判讀策略效果，只足以證明評測成本失控。

Rust runtime 目前只保留 `generic-craft-route-portfolio-v1.12.0` 與資訊邊界修正。沒有已達成本／收益 gate、可交付 unattended overnight 的新 identity。

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

## 下一次 overnight 的重開條件

只有新的描述性 identity 同時具備下列證據，才建立新的 run ID 與 overnight brief：

- 在 fresh 修正後 v1.12 baseline 上，以 family × equipment × world bounded corpus 顯示實質玩家收益；
- illegal、合法非終局 policy-null 與 completion／mandatory-quality 沒有結構性退步；
- 玩家收益不是主要來自單一 world、少數 seed 或 ID selector；
- wall time 與 single-recommendation p95／p99／max 的增幅和收益成比例；
- build、run、resume、status 與 thermal preflight 都由同一 release binary 驗證。

在此之前不啟動 unattended run。
