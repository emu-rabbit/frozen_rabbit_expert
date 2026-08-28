# v1.2 全球色候選研究結果

2026-08-29。**保存研究節點，不交付 overnight。** 新種子結果顯示一般收藏品質改善，但必要品質與 HQ 的代價不符合接受條件。後續迭代不可把此版描述成已採用。

## 固定版本與驗證

- Candidate：`generic-craft-route-portfolio-v1.2.0`；baseline：同 binary 內保留的 v1.1。
- 確認 binary SHA-256：`7f134db4cb4cdf2de78cc8efe92c4533275c47df286e978212d78f41c3d0cc8f`。
- Focus 1,200 pairs，50 families × E02/E09 × 3 risk × balanced-iid × 4 seeds；broad 2,400 pairs，50 families × 3 risk × 4 worlds × 4 seeds，裝備輪替涵蓋 E01–E10。
- Canonical base seed 61000000；同案例兩臂直接執行，最多兩個 native children，每個 batch 上限 7 分鐘。實際 seeds 與原 128,000 個歷史 seeds 不重疊；原始 source mechanics/state/objective/weights 已與前輪完整 TSV 核對。
- 全部 Rust release tests 通過。九球色 × 四品質目標合法候選、強制下一球、資源成本、偏離後滿品質收尾與無效果換球均有測試；0 illegal／0 policy-null。
- 原始結果位於 `evaluation-runs/v120-development/condition-confirm-{focus,broad}`；來源、binary、輸入 digest 與 evaluator SHA 在各自 `plan.json`。已重算 audit，逐格及逐案輸出保存在本目錄。

## 新種子主要切面

Balanced × balanced-iid × E02/E09；pp 為百分點，數字是 v1.2，括號為 v1.2−v1.1。

| 品質類別 | 配對數 | 完成／交貨 | 平均 U 差 | 滿品質差 | 配對勝／負 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hard-quality | 112 | 73 (−3) | −0.02679 | −3 | 10/13 |
| 一般收藏品 | 248 | 248 (+2) | +0.03164 | +11 | 2/0 |
| HQ | 16 | 16 (0) | −0.05750 | −5 | 0/0 |
| 連續品質 | 24 | 23 (−1) | −0.01170 | −2 | 0/1 |
| Progress-only 合計 | 288 | 287 (+1) | +0.02308 | +4 | 2/1 |

必要品質 −2.679 pp 超過 −2 pp 下界。一般收藏品帶來跨 family 品質收益，但不能抵銷 HQ 滿品質 13→8 或必要品質退步。必要品質差的 family／seed 配對 bootstrap 95% 區間為 −14.286～+8.929 pp，不能據此宣稱穩定改善。

完整 1,200-pair focus 淨少 11 件完成；2,400-pair broad 淨少 19 件，其中必要品質淨少 15 件。Broad HQ 的 U +0.02167，與主要裝備切面方向不同，必須保留分層而非挑一個有利平均。

詳細切片與區間：[focus](condition-confirm-focus-summary.md)、[broad](condition-confirm-broad-summary.md)。各自有 17 種隨機球色集與全部 50 family 索引；全格 evidence 見 `condition-confirm-*-cells.md`，不將不同 assumed worlds 混成玩家機率。

## 時間與工程

同負載 native 推薦總耗時：focus 為 v1.1 的 1.170 倍，broad 1.055 倍。Focus candidate p95 27.734 ms、max 161.493 ms；不是 Web／手機或持續熱負載證據。沒有為省時接受必要品質／HQ 退步。

保留的結構改善包括：typed Semantic context、完整 state 的局部快取、finish-query 快取、相同 root 分支共用、初評 sample 原值重用、模擬葉端不更新未使用的路線記憶。真實事件仍完整更新 route memory。曾試驗的 step/count normalization 與 16k cache 沒有實測收益，已撤除。

## 已試而未採用的方向

| 試驗 | 觀察與決定 |
| --- | --- |
| 僅省重算、保持原選招 | 有省時，但沒有品質改善，不能單獨作為 overnight 理由 |
| 全部球色、每個提案完整抽樣 | 部分品質提升，成本約 2～2.7 倍，不交付 |
| 初評後只精評兩個方案 | 成本下降，但初評受少量樣本影響；本版新 seeds 揭露必要品質／HQ 代價 |
| Progress-only 決選降為兩樣本 | 開發 HQ／連續品質退步，撤回；本版決選四樣本 |
| 只提供滿品質且可完工的品質路線 | 先前 51000000 確認幅度不足，作能力底座而非獨立成功成果 |

下一個假說是改善 setup 的實際 consumer、可靠品質收尾，以及初評篩選的穩定性。61000000 自此是已看過的開發資料；策略再變更時，新的確認須換實際不重疊 seed block。

U 是無單位的 0–1 交付品質效用：未交貨算 0；一般收藏品按四檔間插值，HQ 為估計 HQ 機率除以 100，連續品質為 quality/max。它不是遊戲分數，也不能把 hard-quality 失敗當成部分成功。
