# Overnight 評測交接簡報

本輪 brief 更新：2026-08-29，使用者要求繼續迭代。**目前是具名實驗，尚未交付完整 overnight 候選。** 先前 v1.2–v1.10 的 [逐版盤點](../reports/generic-cosmic-overnight/funded-tail-development/prior-experiments.md) 保存改動、結果與判定；新假說及驗證批次見 [球色與路線協調計畫](../reports/generic-cosmic-overnight/funded-tail-development/plan.md)。

## 本輪決策

以 v1.1 為直接比較基準，先守住既有製作路線，再依當前球色、資源與路線成本提高滿品質機會。球色研究是本輪主軸：全九球色的提案、改道／恢复、投資價值與風險都需改善；關閉擴展候選只作診斷，不以較少球色能力作交付目標。首要量尺仍為必要品質、一般收藏品／HQ／連續品質成果，省時單獨不能構成 overnight 理由。

上一輪 150-shard v1.1 overnight 已完整檢視，見 [結果分析](../reports/generic-cosmic-overnight/v110-review-20260828/review.md)；舊跑前條件已移至 [archive](archive/handoffs/overnight-v110-review-2026-08-28.md)。目前候選 identity 及交付狀態由 [current state](current_state.md) 擁有。

## 假說與切片

- 全部九種球色提供獨立候選，按實際效果比較資源投資、品質建立／爆發、進展與兩步機會；不以固定順序、終生使用次數或 recipe ID 修補。
- 球色集控制可遇到的機會，transition weights 表示假設分布，Good Omen／Robust 的強制下一球由 mechanics 處理。不能將隨機池與可達球色混為一談。
- 保留完整品質與可支付的收尾路線；共用 scorer、風險與合法性，不代表不同品質目標使用相同效用。
- 計算重用與分階段比較需要效果檢查，不因成本下降而接受品質退步。

策略盤點、17 種球色集、開發試驗與限制集中於 [全球色證據](../reports/generic-cosmic-overnight/v120-development/conditions.md)。

## 判讀與接受條件

1. 先核對 binary、config、bundle、shards、case identity、seed、必要品質及 timing；0 illegal、合法非終局有招時 0 policy-null。
2. 先讀 Balanced × balanced-iid × E02/E09 的四種品質目標，再拆全部 family × equipment × risk × world。
3. Hard-quality 完成與 progress-only 交貨分開；品質使用包含失敗零分的 U，另報滿品質、HQ、收藏品檔位與製作長度。
4. 主要完成／品質界線與新種子確認流程由 [品質優先確認計畫](../reports/generic-cosmic-overnight/v120-development/quality-validation-plan.md) 固定。重大局部退步及成本超界不由平均成績抵銷。
5. 配對 family／seed 區塊 bootstrap 保存不確定性；新種子短測只判斷值得完整研究，不代表 Web 或全部配方正式採用。

## 下一次完整矩陣

沿用原來 50 families × 10 equipment × 3 risk × 4 assumed worlds × 64 seeds、base seed 20260824 與 action limit。**只執行新 candidate 的 384,000 episodes**，讀取已完成 run `generic-native-v110-perf-vs-v030-64seed-20260827` 中 v1.1 candidate 的 384,000 筆結果作 baseline；不重跑 v0.30／v1.1。

這仍是 384,000 pairs 的共同 benchmark，不是全新獨立保留集。Runner 必須驗證原 source/config/report/binary hash、mechanics、case fingerprint、裝備、world、objective 與 seed 一致。兩臂結果可配對；baseline 計時來自歷史，不能稱為本次同負載的效能 A/B。

候選通過 bounded 效果確認與 run／resume／status／cutoff smoke 後，才補上固定 binary、唯一 run ID 與可直接執行的命令。歷史對照 infrastructure 已完成先前 v1.2 的 bounded 整合，不能代替 v1.10 效果或最終 binary 的交付驗證；本輪沒有正式長跑命令。操作目標仍是 2 workers、每次 invocation 最多 10 小時；實際長度與持續熱負載另有不確定性。長跑只由使用者啟動，依 [工作流](workflows/run-generic-overnight-evaluation.md) 執行。
