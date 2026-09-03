# Rust solver overnight brief：v2.1 採用後的精度決策

`last_updated: 2026-09-07`

## 目前決定

`generic-craft-external-reference-v2.1.0` 是目前採用的 Rust 與 Web policy。它把 v2.0 mechanics-derived 滿品質完工 certificate 的最大深度由三步提高到四步；固定 Artisan Expert decision tree、技能集合、declared-condition 分支、合法性與逐步重新證明契約都不變。v2.0 與四步實驗 identity 保留作 immutable replay。

使用者已接受四步整體相對歷史 v1.12 的品質／完成交換。這不是「所有維度都優於 v1.12」的宣稱：64-seed full run 的 aggregate 滿品質增加 18.0984 percentage points、完成下降 0.6828 points；`normal-heavy-iid` 完成下降 6.9906 points，且六個 families 的 aggregate 滿品質為負。完整歸因與切片見 [v2.1 採納報告](../reports/generic-cosmic-overnight/v210-adoption-review-20260907.md)。

## 下一個決策點

目前沒有排定新的 long run。若需要從 64 提高到 256 seeds，應先決定要回答哪一個問題：

1. 要量 v2.1 相對 v2.0 的第四步純增量，使用 v2.0 作 fresh baseline；不要再用 v1.12 混入 Artisan 架構差異。
2. 要縮小既有 v1.12 對照的 cell 誤差，才重跑同一個全 10 裝備、兩 world 的 256-seed 雙臂矩陣。解析度會由每 seed 1.5625 points 提高到 0.390625 points，標準誤約減半，但 broad 結論不會因加 seeds 才首次可見。
3. 若重點是正式 v2.1 單臂容量／熱成本，執行 candidate-only run，直接量四 worker host elapsed；目前雙臂 run 只能提供候選 subprocess 精確加總與排程估算。

長跑仍只能由使用者啟動。任何新 run 都要先固定 baseline、candidate、axes、seed identity、預期判讀與停止條件；不可把 64-seed 歷史列混進新的 256-seed aggregate。

## 架構與外部來源邊界

- Artisan commit `882202ce04fcd4fe405812ea24d78b660d8ff64e` 的 Expert decision tree 是 v2.1 在 certificate 無法證明時的完整 fallback；BSD-3-Clause notice 與修改狀態由 source header 和 `THIRD_PARTY_NOTICES.md` 保存。
- 本專案擁有 mechanics、完整 state/history replay、合法性、declared condition mask、四步 AND／OR certificate、每步重證、Rust／WASM bridge、評測與產品互動。
- Thal's Expert 沒有 source、binary、model、網路呼叫或 runtime dependency；只把公開可觀察的「找到完整解後採用」當研究假說來源。
- 目前 evidence 沒記錄每次推薦由 certificate 或 fallback 產生，因此不能宣稱兩者在實際呼叫中的占比。

Fallback 替換與 Artisan 行為蒸餾維持暫停。v2.1 是較強的混合架構，不是已獨立於 Artisan 的新核心。
