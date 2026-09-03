# Rust solver overnight brief：v2.0 基線與下一輪改善

`last_updated: 2026-09-03`

## 目前決定

`generic-craft-external-reference-v2.0.0` 是目前採用的 Rust 與 Web policy。它將已通過完整 overnight 的 `generic-craft-external-reference-exp-full-quality-certificate` 原樣升為正式 identity：固定 Artisan Expert decision tree 是 fallback；只有當前可觀測 state 能以成功率 100% 的技能，對 recipe 宣告的每個可能下一球色都證明最多三招內滿品質完工時才接管，且每一步依實際回報重新證明。舊實驗 identity 保留以重播原 evidence，不改名、不重寫。

v2.0 是足夠好的現行求解器基線，但仍是過渡架構，不代表 fallback 已由自有核心取代。使用者目前暫停 fallback 替換與 Artisan 蒸餾，先研究 mechanics-derived 滿品質 certificate 的深度甜蜜點；不能為了架構獨立而犧牲已取得的玩家結果，也不能把行為蒸餾的工程解耦冒充不同產品。

## 64-seed overnight 結論

已完成的採用 run 是 `generic-native-full-quality-certificate-vs-artisan-balanced-e02-e03-e07-e09-e10-2world-64seed-20260904`：50 families × Balanced × 五套裝備 × `balanced-iid`／`normal-heavy-iid` × 64 seeds，共 32,000 paired cases／64,000 rows，50／50 shards 完成、0 failed、0 timeout。累積 wall time 64 秒；22 筆溫度樣本平均 79.57°C、最高 85.06°C，沒有降 worker。

| Arm | 完成 | 滿品質 | Failed | Action limit | 推薦 p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Artisan | 27,493／32,000（85.916%） | 24,003（75.009%） | 2,343 | 2,164 | 約 0.0002 ms |
| v2.0 行為候選 | 27,562／32,000（86.131%） | 24,138（75.431%） | 2,304 | 2,134 | 0.365 ms |

- 滿品質增加 135 件（+0.4219 percentage points），paired `135 勝／0 敗`；完成增加 69 件（+0.2156 points），paired `69 勝／0 敗`。
- hard-quality 滿品質 5,769→5,831（64.386%→65.078%，+62／0）；一般收藏品 +58、HQ +7、Master +8。14 個 hard-quality families 全部正增。
- 34 families 正增、16 持平、0 負向；五套裝備、兩個 world、250 個 family × equipment、100 個 family × world 與 500 個 family × equipment × world cells 都是正增或持平。
- 7,168 traces 改變，但沒有 final quality 或 progress 下降；utility paired `135 勝／0 敗`。Action limit 下降只列為伴隨診斷，不是採用理由。
- F36 hard-quality 仍只有 35.781%，F46 只有 10.625%；v2.0 改善安全的 terminal envelope，尚未解決這些中段能力缺口。

完整四表見 [v2.0 採用 run](../reports/generic-cosmic-overnight/generic-native-full-quality-certificate-vs-artisan-balanced-e02-e03-e07-e09-e10-2world-64seed-20260904.md)。報告與上述數字都是 synthetic／assumed-world development evidence，不是真實遊戲自然成功率；它證明的是在固定評測座標下跨 family、裝備與 world 穩定超過 Artisan。

## 外部學習邊界

Artisan 的 Expert decision tree 固定在 commit `882202ce04fcd4fe405812ea24d78b660d8ff64e`，以本專案 mechanics 消耗相同 condition／success tapes。它不是原 plugin 的實機 outcome parity，也不含 Dalamud automation 或可選 Cosmic Duty Action。來源、修改狀態與完整 BSD-3-Clause notice 保存在 source header、`THIRD_PARTY_NOTICES.md`，Web build 會把 notice 複製到部署產物根目錄。

Thal's Expert 非開源。目前只把其公開使用指南與可觀察產品行為當設計／驗證參考，不下載、反編譯、複製私有實作，也不把網站輸出當本專案的 ground truth。公開指南值得轉成假說的部分包括：

- 直接把 requested quality 設成品質上限，以成功機率而非「能交貨」作主要承諾。
- 每一步回報實際球色與技能成敗後重算；使用者可修正歷史，state 必須持續與遊戲一致。
- 一旦找到不受後續球色影響的完整解，顯示 `Solution found` 並固定執行，而不是繼續逐步換路。
- 明確分成 progress、Inner Quiet、quality、finisher 四階段，先算 CP／耐久能否支付收尾；無解時另標示 panic／best-effort，不把它冒充成功。

若要建立系統化 black-box 對照，先取得站方同意或至少確認其使用條款與可接受頻率；預設只做少量人工輸入／輸出比較，不自動大量查詢。

## 描述性實驗結果

第一次嘗試直接重用舊 portfolio 的多步 certified suffix，在 1,600 個相同 tape 配對中雖有滿品質 14 勝，仍有 2 敗；完成 10 勝／3 敗。原因是產品每一步都依新球色重算，只回傳 suffix 首招不能保證後續仍執行原證明。這條路已撤回，不能進產品。

改成單招終局證明並剝除 portfolio 搜尋後，同一個 50 families × Balanced × E02／E09 × 兩 worlds × 8 seeds gate 得到：

- 完成 1,403→1,405，配對 2 勝／0 敗。
- 滿品質 1,228→1,231，配對 3 勝／0 敗，即 +0.1875 percentage points。
- 只改動 4／1,600 cases；4 件都減少工序，沒有增加工序的案例。
- candidate 單次推薦 p50／p95／p99 是 0.2／0.3／0.4 µs，max 78.7 µs；release binary SHA-256 `42b655d984f9f5587f893c19eb6a3e0dcfb7d521b47a4da63756f7b2d0f2a324`。

證據見 [單招終局實驗報告](../reports/generic-cosmic-overnight/external-reference-certified-finish-direct-s8.md)。這個提升安全但太小，不升數字版、不切 Web，也不值得單獨啟動 overnight。

第二個實驗沒有放寬成「預先承諾一串 suffix」，而是對每個 declared next condition 都要求下一個觀察 state 仍有滿品質完工 continuation。它最多看三招，只使用成功率 100% 的技能；action limit 僅判定證明是否可執行，不是主要量尺。

| Gate | 軸 | Base seed | Cases | 完成 勝／敗 | 滿品質 勝／敗 |
| --- | --- | ---: | ---: | ---: | ---: |
| A | 50 families × E02／E03／E07／E09／E10 × 兩 worlds × 8 seeds | 20260824 | 4,000 | 7／0 | 13／0 |
| B | Gate A 的獨立 base seed | 20260903 | 4,000 | 9／0 | 16／0 |
| C | 50 families × 全 10 裝備 × 全 4 worlds × 4 seeds | 20260903 | 8,000 | 7／0 | 23／0 |

Gate C 的 10 套裝備各自都有滿品質 wins，`balanced-iid`／`normal-heavy-iid`／`opportunity-scarce-iid` 各自正增，`all-normal` 持平；hard-quality contract 為滿品質 7 勝／0 敗、完成 7 勝／0 敗，progress-only 為滿品質 16 勝／0 敗、完成持平。50 families 中 20 個滿品質正增、30 持平、0 負向。Candidate recommendation p95 最高 0.289 ms，三批 max 最高 4.710 ms。完整判讀與可重現身份見 [readiness 報告](../reports/generic-cosmic-overnight/external-reference-full-quality-certificate-readiness-20260903.md)。

## 下一個決策點

深度 sweep 已完成。兩組不同 seed、共 8,000 paired cases 中，三→四步為滿品質 +21／0、完工 +10／0；四→五步再增加滿品質 +13／0、完工 +9／0，五步 p95 76.378 ms。六步在 120-case 跨裝備 screens 無新增成果，p95 1,261.978 ms、max 1,803.628 ms，因此不擴 gate、不跑七步。native bounded evidence 的甜蜜點是五步，但正式 Rust／Web 仍維持三步 v2.0；五步要切 runtime 前仍需 target-device WASM 成本與較廣 axes 驗證。完整報告見 [certificate 深度研究](../reports/generic-cosmic-overnight/full-quality-certificate-depth-sweet-spot-20260903.md)。

Fallback 替換暫停；本輪沒有 Artisan 蒸餾 runtime 或 artifact。未來若重開替換，Artisan／Thal 只作反例、外部參考與評測對手，不能用純 action imitation 冒充新的產品核心。

判讀順序與交換規則：

1. 先看滿品質率，再看完成；步數與 action limit 只作次要診斷。
2. 同一 family × equipment × world 內允許跨 seed 的勝敗交換，以淨滿品質、完成與 objective utility 衡量，不要求 paired losses 為 0。
3. 跨 family、equipment 或 world 的交換必須逐軸揭露，不能由 aggregate 自動沖銷；若收益是否足以支付重要維度退步無法明確決斷，停在 checkpoint 交由使用者裁決。
4. F36／F46 hard-quality 與 F15／F37／F40／F44／F47、F48–F50 仍分開呈現；合法非終局不得 policy-null。
5. 主要求解器每步小於 3 秒；交付下一次 overnight 前，bounded p95 應保留未來 100 ms fast-solver 空間或明確說明超出的原因。

長跑仍只能由使用者啟動。下一個描述性 identity 通過兩個不同 seed 的五裝備／兩 world gate，以及全 10 裝備／全 4 worlds 廣域 gate 後，才生成新的 exact full／resume／status commands。
