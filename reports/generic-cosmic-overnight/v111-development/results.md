# v1.11 基本能力 checkpoint

2026-08-29。`generic-craft-route-portfolio-v1.11.0` 是使用者校正版號規則後第一個取得數字版號的能力推進；直接基準為 v1.1。它不是 Web 採用或遊戲內成功率證據。

## 行為

- Stable 與全部 hard-quality 狀態精確沿用 v1.1，不用 optional-quality 收益交換必要品質或安全模式。
- Balanced／Aggressive 的一般收藏品、HQ 與連續收藏品質使用既有全九球色共同提案、終局機率加權與 funded route 決選能力。
- Aggressive 且非 HQ 的 bounded endgame beam 另使用 mechanics 尺度的資源排序：同時估計 CP、耐久、掌握／儉約、工匠的神技、剩餘進展成本、內靜與品質／進展增益。沒有增加 width、depth 或 transition 上限。
- Selector 只讀 objective、risk、recipe／crafter mechanics 與當前 state；不讀 recipe／equipment ID、seed 或未來 RNG。

## 直接比較

兩批效果評測使用的 binary SHA256 為 `e0f8d89150b50f0ad2bbcded6642c3d2365febf490600de99ba5eff28044a59a`。最終交付 binary 補上 native handshake 的 v1.11 identity 後，SHA256 為 `05da5f22463ff248663f975c432b8cecefd0cadf00dd0e37b4b0eaacb815769d`。以 fresh-confirm 的 600 組輸入逐欄重播，除三個執行時間欄位外，episode 結果、路線、停止原因與狀態欄位完全相同；handshake 修正沒有改變策略行為。兩批都使用 canonical seed method、v1.1 同 binary 直接比較；第二批是固定版本後的新 seed block。

| 批次 | pairs | 完成差 | 平均 U 差 | 滿品質差 | hard-quality | Stable | Native 計算比 |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| `v111-gated-causal-broad` | 1,200 | -1 | +0.03235 | +37 | 51→51 | 精確相同 | 1.159 |
| `v111-gated-fresh-confirm` | 600 | 0 | +0.03601 | +28 | 23→23 | 精確相同 | 1.135 |

第一批唯一交貨損失是未食藥 E05 × Aggressive；第二批一勝一負都在未食藥 E08。食藥主戰裝備另拆如下：

| 批次 | 食藥 pairs | 完成差 | 平均 U 差 | 滿品質差 | U 勝／負 | 計算比 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| causal | 720 | 0 | +0.03409 | +25 | 173／36 | 1.182 |
| fresh confirm | 360 | 0 | +0.04305 | +24 | 95／10 | 1.132 |

成本是同機、兩 workers 的開發量測，不能外推成目標裝置 latency。Fresh confirm 的逐次推薦為 baseline／candidate p95 20.20／21.46ms、p99 52.10／49.01ms、max 155.09／135.73ms；總計算量增加來自 Balanced／Aggressive 走較深入的品質路線，不是單次長尾暴增。

## 判定

通過基本能力 checkpoint，值得進入下一次完整 overnight：

- Raphael 495 個最佳解上，食藥全白球 Q 加總比 94.17%、沒有格低於 80%，基本功沒有明顯遠離教師。
- v1.11 對 v1.1 的 hard-quality 與 Stable 精確不退；兩批食藥主戰裝備完成都不退，同時有可重現的 U／滿品質增益。
- 整體計算量增加約 13.5%～15.9%，明顯低於先前 program planner 的高成本路徑，且單次 latency 長尾沒有暴漲。
- 再投資全白球完整搜尋的邊際收益已低於開始九球色策略演進；後續把全白球當防退步 gate，不再要求先消除 hard-quality 與 Raphael 的全部差距。

完整 overnight 仍是共同歷史 benchmark，不是新保留集；長跑只由使用者啟動。通過完整矩陣仍不等於 Web／遊戲實戰採用。
