# v1.9 等價候選比較研究

2026-08-29。以 v1.3 為策略基底，單獨啟用 Semantic 續作真正依賴的 context 等價性：同首招、同 suffix／consumer／engine 的候選，不因 option／persona 標籤不同占用重複比較名額。Budgeted 歷史與不同續招不合併。沒有帶入 v1.4 的起手、局部品質擴充或縮窄搜尋，也沒有啟用 v1.5–v1.8 的快取、預算或剪枝。

99 個 release tests 通過。等價標籤的完整 candidate evidence 相同、模擬 transitions 減少；三候選參考保留、九球色四目標、不同 consumer／Budgeted context 區別仍受測試。

## 開發結果

61000000 開發資料，每格兩條 stream；v1.3 使用保存的完全相同案例。

| 切片 | 相對 v1.3 完成件數 | 平均 U 差 | 滿品質件數差 | 本批相對 v1.1 運算比 |
| --- | ---: | ---: | ---: | ---: |
| Focus 600 pairs | −1 | −0.00259 | 0 | 1.459 |
| Broad 1,200 pairs | −2 | −0.00142 | +1 | 1.301 |

不採用。移除重複名額後比較了不同的替代路線，但完整效果没有進步；主要 HQ 的 U 差相對 v1.1 為 −0.05375。局部計算重用不能替代整體效果驗證。完整切片見 [focus](../v120-development/v190-equivalent-focus-summary.md)／[broad](../v120-development/v190-equivalent-broad-summary.md)。SHA、native inputs／outputs 留在 `evaluation-runs/v120-development/<label>/plan.json`。

最後的新種子確認選回 v1.3 的凍結 binary `70c8aff10b5795f26b03758148f0799169b4de0ca6a90d4fac8a0a139786c872`。81000000 首次用於 `confirm-v130-final-focus` 1,200 pairs 與 `confirm-v130-final-broad` 2,400 pairs，兩批分開判讀；正在確認，不能預告通過。原定品質與成本門檻不變，若僅品質成立而成本仍超界，只能提出明示取捨，不當成全部通過。
