# v1.7 全球色安全收尾研究

2026-08-29。以 v1.3 為基底，沒有帶入 v1.4–v1.6 的未採用功能。新增固定 suffix 的有界驗證：展開全部九種下一球，保留強制下一球／no-step 規則，只合併完整 state 相同的分支。所有分支均合法、技能必成且滿品質交貨，才直接提出該收尾；最多 256 frontier states／2,048 transitions，溢出為 unknown。品質已滿的多步進展路線同樣可檢查。

這是固定路線的 mechanics 證據，並非整個重新規劃 policy 的成功率保證；玩家每一步仍依實際結果重算。

## 驗證與結果

Release tests 通過，包含九種起始球色下正面路線的獨立全分支列舉、零預算不發證明、隨機技能拒絕，以及通常球可完工但未來大進展提前完成／長持續儉約妨礙儉約加工的反例。

61000000 開發資料，focus 600 pairs、broad 1,200 pairs：

| 切片 | 相對 v1.3 完成差 | 平均 U 差 | 滿品質件數差 | 本批相對 v1.1 運算比 |
| --- | ---: | ---: | ---: | ---: |
| Focus | 0 | +0.00058 | +1 | 1.421 |
| Broad | 0 | 0 | 0 | 1.268 |

收益不足，不採用、不交付 overnight。四個慢案例的 167 個實際狀態中，37 次驗證、8 次取得證明，表示命中範圍有限；這不是总体命中率。全部切片見 [focus](../v120-development/v170-certified-focus-summary.md)／[broad](../v120-development/v170-certified-broad-summary.md)。新的 81000000 確認資料尚未使用。

另新增 mechanics-only 技能紀錄重播工具，不再呼叫 solver：focus 兩臂 1,200 episodes 的完整終局 state、技能、成敗／球色亂數 cursor 均與保存輸出相同，重建 35,944 次實際球色／技能。`v170-certified-focus-condition-usage.json` 保留四種品質目標、17 類球色集及 risk；兩臂各自路徑上的出招次數不能視為單一球色的因果收益。
