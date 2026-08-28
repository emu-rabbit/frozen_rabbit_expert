# v1.8 搜尋上界研究

2026-08-29。以 v1.3 為基底，沒有啟用 v1.4–v1.7 未採用功能。首個變體只對品質爆發查詢使用樂觀品質上界：免費增益、忽略資源與技能條件、最多一次比爾格的祝福；仍不可能達標才跳過。`v180-bound` 的 1,800 cases 與 v1.3 逐招／終局／context 精確相同，但成本為 focus 1.418、broad 1.255，沒有足夠改善。

最終變體 `v180-pruned` 收緊內靜每步最多增加兩層的上界，並加入純進展支線的樂觀上界。進展 buff 使用實際剩餘回合，無償給資源及最高 potency 技能；確定剩餘步數不足的支線不再消耗後續搜尋預算。這會讓固定預算找到不同 witness，因此是策略變動，不能宣稱整個 policy 等價。

## 最終開發比較

61000000 開發資料，每格兩條 stream。表內 v1.3 為保存的同案例結果，計時跨批；本批 v1.1 才是直接同負載比較。

| 切片 | 相對 v1.3 完成件数 | 平均 U 差 | 滿品質件數差 | 本批相對 v1.1 運算比 |
| --- | ---: | ---: | ---: | ---: |
| Focus 600 pairs | 0 | −0.00201 | +4 | 1.396 |
| Broad 1,200 pairs | −2 | −0.01084 | −9 | 1.293 |

不採用，不交付 overnight。單項搜尋保留較好的資源 witness，不代表完整策略的品質必然改善。完整切片見 [focus](../v120-development/v180-pruned-focus-summary.md)／[broad](../v120-development/v180-pruned-broad-summary.md)；原始輸入、binary snapshots 與 SHA 在 `evaluation-runs/v120-development/<label>/plan.json`。81000000 尚未使用。

99 個 release Rust tests 通過：品質上界與原搜尋在 768 種查詢完全對照；進展上界不能丟掉既知 witness，所得路線完整重播，並涵蓋 scope／巢狀恢復／舊版不啟用。它們證明這些 mechanics／搜尋契約，並沒有替代整體效果驗收。
