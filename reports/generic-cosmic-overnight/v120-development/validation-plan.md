# v1.2 bounded 驗證計畫

固定於 2026-08-28，新的確認 seed 尚未執行前建立。前輪完整結果見 [v1.1 review](../v110-review-20260828/review.md)。本次只準備下一次 overnight，不決定 Web 採用或發布。

## 方向與資料分工

- 保留 v1.1 原始決策路徑作直接比較；每次實驗保存 binary SHA、輸入與兩臂原始 TSV。
- 開發 seed `31000000` 已用於方案挑選；不能當獨立確認資料。
- 候選凍結後使用 `41000000 XOR sampleIndex`，sampleIndex 0–3，與開發 seed 及前輪完整 `20260824 XOR 0..63` 不相交。
- Focus：50 families × E02/E09 × 3 risk × balanced-iid × 4 seeds，1,200 pairs。
- Broad：50 families × 3 risk × 4 worlds × 4 seeds，每個 family/risk/world 依預先固定規則輪替裝備，2,400 pairs。全部 10 裝備都有覆蓋；不是完整 family × equipment 矩陣。
- 每次最多兩個 worker，每個 child batch 7 分鐘上限；逐批查看。相同 seed 的不同軸不視為互相獨立樣本。

## 事前判斷界線

主切片 Balanced × balanced-iid × E02/E09。Hard-quality 完成、progress-only 交貨與 U 分開。

| 量尺 | 相對 v1.1 的確認下界 |
| --- | ---: |
| Hard-quality 完成率 | −2 percentage points |
| Progress-only 交貨率 | −0.5 percentage points |
| Progress-only 平均 U | −0.01 |

進 overnight 的價值可來自：有完成／品質改善且不使成本暴增；或在效果相當下，兩組抽樣都至少省 20% native 推薦總運算。後者不能寫成策略成功率改善。品質策略改動若使成本增加超過 10%，不直接交付。

上述三項點估計需守住下界。另列 family × equipment × risk × world 的所有勝負交換、U 變化與 action-limit，不用 aggregate 遮蔽損失。小樣本區間不足以證明效果相當；若發現實質退步或集中損失，回到開發，不把確認資料重新稱作保留集。

正確性要求：0 illegal、合法非終局有技能時 0 policy-null、hard-quality 完成規則未改、沒有 recipe/equipment ID 或 future RNG 分支。快取變更另比對未計時的 episode 結果，功能測試覆蓋 state、history、budget 與 route 行為。

本機 latency 目標 p95 <1s、max <3s；時間估計分列 baseline/candidate，不能用 v0.30 便宜的成本掩蓋新版本運算。短測不作持續溫度、全部 seed 或目標裝置保證。

## 過程保留

已試的「有短收尾證據時，懲罰缺少證據的候選」傷害品質；擴充為有限步數證明後損失縮小，但改善不足，兩者不交付。不得因能修復特定已知案例就保留這類策略。

凍結候選為通用的無效操作排除，以及依 leaf engine 真正歷史輸入共用續算。增加 progress-only 共同抽樣為 8 的方案在開發 focus 只增加約 0.0017 U，卻增加約 34% 運算，故不採用；保留原先 hard-quality 8／progress-only 4 samples。最後內容、未採用方案與證據由 results.md 保存。
