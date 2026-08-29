<!-- doc-status: archived -->

> 這是 v1.11 完整 overnight 執行前的評測契約，只用於重播該輪決策；目前方向見 [active brief](../../overnight_review_brief.md)。

# Overnight 評測交接簡報

本輪 brief 更新：2026-08-29。**v1.11 已通過使用者指定的基本能力 checkpoint，交付為下一次完整 overnight 候選。** 先前 v1.2–v1.10 的 [逐版盤點](../../../reports/generic-cosmic-overnight/funded-tail-development/prior-experiments.md) 保存改動、結果與判定；v1.11 的能力、直接比較與代價見 [checkpoint 結果](../../../reports/generic-cosmic-overnight/v111-development/results.md)。

## 本輪決策

使用者指定的 [Raphael 無球色基本製作參考](../../../reports/normal-reference/plan.md) 500 組已完成保存。新的效果要求不變：全白球不能明顯落後參考，有球色需提供不劣於參考的成果；允許有收益的隨機技能冒險，不以穩定量產取代成就挑戰。兩輪加時重試後 495 組為 `optimal`、500 條 optimal／incumbent 路線可逐招一致重播；300 秒內未完成搜尋的 5 組不記成無解。完整結果見 [參考報告](../../../reports/normal-reference/raphael-main-500.md) 與 [加時報告](../../../reports/normal-reference/raphael-main-500-refine-300s.md)。

基本路線探針在 495 個 `optimal` 格的原始 Q 加總達 Raphael 的一般收藏品 94.6%、hard-quality 91.7%、HQ 90.3%、連續品質 92.7%；食藥主戰裝備合計 94.17%、沒有格低於 80%。這不能解讀為達成率，且 hard-quality 只有 6/140 達滿品質。使用者已設定 checkpoint：當基本解題能力足夠，且繼續補全白球的邊際價值低於開始球色演進，就把主要成本轉往球色。額外完整搜尋 arm 已需 +17.1% 計算，多個 program planner 整合又更昂貴且收益不穩；因此目前認定基本功 gate 已達，後續全白球只作防退步檢查，不再阻塞九球色策略。

以 v1.1 為直接比較基準，守住上述全白球 gate，再依當前球色、資源與路線成本提高滿品質機會。球色研究是本輪主軸：全九球色的提案、改道／恢復、投資價值與風險都需改善；關閉擴展候選只作診斷，不以較少球色能力作交付目標。首要量尺仍為必要品質、一般收藏品／HQ／連續品質成果，省時單獨不能構成 overnight 理由。

最終候選 `generic-craft-route-portfolio-v1.11.0`：Stable 與 hard-quality 精確沿用 v1.1；Balanced／Aggressive optional-quality 使用全九球色共同提案與 funded route 比較，Aggressive 非 HQ 再以 mechanics 尺度的 CP／耐久／進展 reserve／IQ／buff 資源價值排序 bounded endgame beam。最終新 seed 600 pairs 完成不退、U +0.03601、滿品質 +28；食藥 360 pairs 完成不退、U +0.04305、滿品質 +24，計算比 1.132。前一 1,200-pair 因果批食藥 720 組也完成不退、U +0.03409、滿品質 +25。未食藥只作 best-effort 參考；完整矩陣仍需揭露其交換。

上一輪 150-shard v1.1 overnight 已完整檢視，見 [結果分析](../../../reports/generic-cosmic-overnight/v110-review-20260828/review.md)；舊跑前條件已移至 [archive](overnight-v110-review-2026-08-28.md)。目前候選 identity 及交付狀態由 [current state](../../current_state.md) 擁有。

## 假說與切片

- 全部九種球色提供獨立候選，按實際效果比較資源投資、品質建立／爆發、進展與兩步機會；不以固定順序、終生使用次數或 recipe ID 修補。
- 球色集控制可遇到的機會，transition weights 表示假設分布，Good Omen／Robust 的強制下一球由 mechanics 處理。不能將隨機池與可達球色混為一談。
- 保留完整品質與可支付的收尾路線；共用 scorer、風險與合法性，不代表不同品質目標使用相同效用。
- 計算重用與分階段比較需要效果檢查，不因成本下降而接受品質退步。
- 完整基本路線需以顯式 planner context 保存及重播，和既有球色策略在同一 forecast 比較；不得用 process-global 暖快取、benchmark ID 路由或每步重跑完整 beam。

策略盤點、17 種球色集、開發試驗與限制集中於 [全球色證據](../../../reports/generic-cosmic-overnight/v120-development/conditions.md)。

## 判讀與接受條件

1. 先核對 binary、config、bundle、shards、case identity、seed、必要品質及 timing；0 illegal、合法非終局有招時 0 policy-null。
2. 先讀 Balanced × balanced-iid × E02/E09 的四種品質目標，再拆全部 family × equipment × risk × world。
3. Hard-quality 完成與 progress-only 交貨分開；品質使用包含失敗零分的 U，另報滿品質、HQ、收藏品檔位與製作長度。
4. 主要完成／品質界線與新種子確認流程由 [品質優先確認計畫](../../../reports/generic-cosmic-overnight/v120-development/quality-validation-plan.md) 固定。重大局部退步及成本超界不由平均成績抵銷。
5. 配對 family／seed 區塊 bootstrap 保存不確定性；新種子短測只判斷值得完整研究，不代表 Web 或全部配方正式採用。

## 下一次完整矩陣

沿用原來 50 families × 10 equipment × 3 risk × 4 assumed worlds × 64 seeds、base seed 20260824 與 action limit。**只執行新 candidate 的 384,000 episodes**，讀取已完成 run `generic-native-v110-perf-vs-v030-64seed-20260827` 中 v1.1 candidate 的 384,000 筆結果作 baseline；不重跑 v0.30／v1.1。

這仍是 384,000 pairs 的共同 benchmark，不是全新獨立保留集。Runner 必須驗證原 source/config/report/binary hash、mechanics、case fingerprint、裝備、world、objective 與 seed 一致。兩臂結果可配對；baseline 計時來自歷史，不能稱為本次同負載的效能 A/B。

候選已通過 bounded 效果確認。最終 binary SHA256 `05da5f22463ff248663f975c432b8cecefd0cadf00dd0e37b4b0eaacb815769d` 已通過 600 組非計時結果 parity、runner 全測試與完整 `--status-only` preflight；固定 run ID 是 `generic-native-v111-checkpoint-vs-v110-history-64seed-20260829`。依使用者決定，預設為 **4 workers**、每次 invocation 最多 10 小時；實際長度與持續熱負載另有不確定性。可直接執行、續跑與查狀態的完整命令見 [overnight handoff](../../../reports/generic-cosmic-overnight/v111-development/overnight-handoff.md)。長跑只由使用者啟動，依 [工作流](../../workflows/run-generic-overnight-evaluation.md) 執行。
