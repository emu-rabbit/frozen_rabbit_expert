# v1.2 品質優先確認計畫

本計畫在品質候選的確認資料執行前固定。使用者已澄清：達成率與品質是首要目標，省時不能單獨作為進入 overnight 的理由。因此先前 [成本階段計畫](validation-plan.md) 的「效果相同但省 20% 即值得長跑」條件已撤回；其結果只作開發診斷。

## 資料與比較

- 直接比較保留的 v1.1 與凍結的 v1.2 candidate，同一 binary、同一案例、同一 native seed。
- 開發已看過 shared native seeds 31000000 與 41000000 的各批資料，全部是開發資料，不再作採用保留集。
- 第一批品質確認使用 base seed 51000000，依 canonical family/equipment/world counter XOR sample index 生成 native seed；不是所有 cell 共用四條相同 stream。先核對原始 source TSV 的 mechanics/state/objective/condition weights 和前輪完整輸入一致。
- Focus：50 families × E02/E09 × 3 risk × balanced-iid × 4 seeds，1,200 pairs。
- Broad：50 families × 3 risk × 4 worlds × 4 seeds，裝備按既有 cost slice 輪替，2,400 pairs。涵蓋全部 10 裝備，但不是完整 family × equipment 矩陣。
- 最多兩個 worker；兩個 slot 交換 baseline/candidate 執行順序，每個 child batch 上限 7 分鐘。確認後若改策略，該批重新歸為開發資料，另選新 seed block。

## 值得 overnight 的訊號

主要切片為 Balanced × balanced-iid × E02/E09；不混合 hard-quality 和 progress-only 成功定義。

| 量尺 | 相對 v1.1 可接受下界 | 有實際價值的改善訊號 |
| --- | ---: | ---: |
| Hard-quality 完成率 | −2 percentage points | +2 percentage points |
| Progress-only 交貨率 | −0.5 percentage points | 守住交貨，配合品質判斷 |
| Progress-only 平均 U | −0.01 | +0.01 |
| Progress-only 滿品質率 | 不以犧牲交貨／平均 U 取得 | +3 percentage points，且平均 U 不下降 |

需三項主要量尺守住下界，至少一項品質／hard-quality 改善達到上述幅度；收益應跨越不只一個 family。全格揭露勝負、U 與滿品質，特別檢查弱裝備、HQ 及 Stable。這是選擇值得完整驗證的候選，不是宣稱發布通過。

成本是護欄：同樣負載下 native 推薦總運算不超過 v1.1 的 110%，本機 p95 <1s、max <3s。若收益值得但超過護欄，先提出取捨，不自行把更久的長跑交給使用者。

正確性要求 0 illegal、合法非終局有技能時 0 policy-null、必要品質規則與身份一致。Normal-condition 路線證據不等於遊戲自然成功率；實際執行仍逐事件重算。新 seed 短測不是正式產品採用保留集。

## 2026-08-29 開發更新與下一批確認

51000000 的完整品質收尾候選確認沒有達到實際改善門檻：主要 progress-only 滿品質率 +2.083 pp、U +0.00299，hard-quality 不變。因此沒有交付 overnight；該批正式歸為開發資料。

使用者進一步要求所有九種球色及其組合都落入策略。開發範圍擴為 [全球色提案與分階段比較](conditions.md)。31000000 的低抽樣試驗雖省時，卻傷害 HQ／連續品質，不能因 hard-quality 改善就忽略。

下一批候選固定後，使用未參與調整的 canonical base seed **61000000**，仍為 focus 1,200 pairs + broad 2,400 pairs；樣本數、主要切片、上述效果／成本門檻不變。候選 binary 與 evaluator SHA 由各批 `plan.json` 固定。輸出按九種球色機會、17 種隨機池及四種品質目標檢查；球色分支存在只算覆蓋，效果另以配對結果與重播判斷。若後續修改選招，61000000 同樣歸為開發資料。

## 完整 overnight

2026-08-29 03:00 收尾更新：61000000 已用於多版開發；v1.3 的 81000000 確認未通過必要品質要求，結果用於 v1.10 分工後也已成開發資料。v1.10 使用新的 101000000，主要 progress-only 交貨退步 0.694 pp，未守住上述 0.5 pp 護欄，成本亦超界。門檻沒有調低，不交付候選；結果與後續方向見 [結案](../v1100-development/results.md)。若再調整策略，101000000 不能重稱新驗證資料。

只執行新 candidate，沿用已完成的 v1.1 原始結果作配對比較；不再重算 v0.30 或 v1.1。維持原本全部案例與 64 seeds。Runner／報告必須清楚區分本次執行與歷史沿用的 episode、binary 身份及時間，並驗證案例／來源 hash；完成支援與 bounded smoke 前不交付長跑命令。
