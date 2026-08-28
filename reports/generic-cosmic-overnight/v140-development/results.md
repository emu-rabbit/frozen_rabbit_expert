# v1.4 起手與品質建立研究

2026-08-29。此版本作為失敗研究 checkpoint 保存，不交付 overnight。前版的完整紀錄與固定確認計畫見 [v1.3](../v130-development/results.md)。

## 問題與方法

原候選集合在通常球的起手與早期內靜建立上，仍容易受限於既有能力提出的一招。本輪讓品質起手、進展起手、確定性品質累積與可支付加工連招參與共同比較。前綴只證明這幾招付得起，沒有偽裝成完整完工證明；後續仍按共同球色模型與風險評估。

另一個協調問題是 Semantic 能力固定以 `BuildQuality` 標記選項，新提案則依技能用途分類；相同動作仍會因未被該葉端讀取的 option／persona 而占用不同決選名額。v1.4 依已驗證的五欄 SemanticContext 合併預測；Budgeted 的完整歷史仍保留，不泛用刪除。

沒有配方／裝備 ID 特例，也沒有增加未來 RNG 輸入。舊 v1.1、v1.2、v1.3 行為保留作研究比較。

## 開發資料

以下使用已看過的 canonical base seed 61000000，每格 2 seeds：focus 600 pairs，broad 1,200 pairs。它們是快速開發篩選，不能取代最後 4-seed 新資料確認。

| 變體 | 改動 | 當時判讀 |
| --- | --- | --- |
| `v140-opening` | v1.3 加入兩種起手共同評估 | 同案例對 v1.3：focus 完成 −2 件、U −0.0030；broad 完成 +1 件、U −0.0022。起手本身未形成穩定收益。 |
| `v140-compact` | 收尾寬度 32→16 | 對 opening 幾乎沒有整體成本改善，不能當成效能突破；broad 品質略降。 |
| `v140-construction` | 加入內靜累積與可支付連招；Semantic 預測按真正的 context 依賴分組 | Focus 對 v1.1 交貨 −11 件、U +0.0087、成本 1.825 倍；broad 成本 2.485 倍。局部 HQ 與交貨退步，撤回採用。 |

主要 Balanced／balanced-iid／E02E09 的 progress-only 交貨 140/144（−3 件）、U +0.0025，HQ U −0.1275；hard-quality 39/56（−1 件）。新增局部候選並沒有建立足夠好的整段資源安排，不能只因某些品質平均值上升就保留。下一版回到 v1.3 有收益的完整收尾行為，先做不改選招的純查詢快取，再重新確認效果。

此 checkpoint 的 release Rust tests 已通過，包含全球色／品質目標、起手合法性、recipe identity 不影響結果、可支付的加工連招，以及 Semantic 合併不影響真正讀取的歷史欄位。測試通過只證明邊界與機制，沒有抵銷上述效果失敗。

原始資料、binary SHA 與 evaluator SHA 在 `evaluation-runs/v120-development/<label>/plan.json`。共用工具 [compare-variants.mjs](../v130-development/compare-variants.mjs) 依 recipe／equipment／risk／world／seed 精確對齊兩個既有 candidate；不同批次的時間比只作近似成本診斷。對 v1.1 的同批配對切片由 `v120-development/<label>-summary.md` 保存。

## 確認與交付

尚未動用 81000000 新資料。候選先固定、確認主要品質與成本方向，再依 [品質優先界線](../v120-development/quality-validation-plan.md) 做 focus 1,200 + broad 2,400 pairs。沒有通過就不交付完整長跑，亦不以平均收藏品改善掩蓋 hard-quality、HQ 或交貨代價。
