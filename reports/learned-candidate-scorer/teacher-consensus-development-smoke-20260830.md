# Route-aware consensus teacher development smoke

`date: 2026-08-30`

## 問題與結論

Raw 32-sample 的唯一 completion gain 沒被 raw 64 保留後，這個 slice 測試較保守的會診老師：只有 32／64 選到相同 route candidate，而且 64-sample 對 ordinary v1.12 selected candidate 的 common-random-number 配對平均增益大於 `2 × paired standard error`，才允許 override；其餘 state 一律使用 ordinary v1.12 recommendation。

結果是：**會診老師未通過 development gate，這個 teacher 定義停止，不擴 seeds、不凍結 fresh labels、不啟動 overnight 或大量教材生成。**它與 v1.12 同為 7／10 完成，但完成檔位從 21 降到 19、滿品質從 6 降到 5；唯一新增的局部品質沒有跨檔。這不是 aggregate 無收益而已，而是重要 E02 case 的玩家可見退步。

## 實驗身份與邊界

- Baseline：`generic-craft-route-portfolio-v1.12.0`。
- Consensus identity：`generic-craft-route-consensus-low32-high64-h64-z4000000000000000-min0000000000000000`；`z` 與 `min` 以 IEEE-754 bits 固定 identity，分別代表 2.0 與 0.0。
- Protocol：`native-route-candidate-teacher-consensus-episode-v1`；沒有 solver 數字版號。
- Corpus：與前兩輪相同的已看過 development 10 cases，Balanced × `balanced-iid` × E02／E09，各 5。這不是 fresh holdout。
- Override 必須同時滿足：32／64 exact selected candidate index 一致、與 baseline 不同、64-sample candidate 對 baseline candidate 的 paired mean gain 大於 `max(0, 2 × SE)`。Candidate generation／order 必須完全一致，teacher candidates 不得被 staged screening。
- Fallback 回傳完整 ordinary v1.12 recommendation，不自行拼動作；override 回傳完整 64-sample recommendation。Planner context 仍依實際採用 decision 更新。

## 結果

| Policy | 完成 | Failure | Action limit | Policy-null | Illegal | 完成檔位總和 | 滿品質 | Actions | Release elapsed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v1.12 | 7／10 | 3 | 0 | 0 | 0 | 21 | 6 | 333 | 2.321 s |
| Raw Teacher 32 | 8／10 | 2 | 0 | 0 | 0 | 22 | 7 | 376 | 29.463 s |
| Raw Teacher 64 | 7／10 | 3 | 0 | 0 | 0 | 21 | 6 | 318 | 44.625 s |
| Consensus 32／64＋2SE | 7／10 | 3 | 0 | 0 | 0 | 19 | 5 | 325 | 65.521 s |

325 次 consensus decisions 的 disposition：

| Disposition | 次數 | 意義 |
| --- | ---: | --- |
| 32／64 與 reference 同 candidate | 232 | 使用 v1.12 |
| 32／64 不同意 | 43 | 使用 v1.12 |
| 同意但 paired gain 不足 | 42 | 使用 v1.12 |
| 通過 2SE 並 override | 8 | 使用 64-sample recommendation |
| Recommendation unavailable | 0 | — |

Consensus recommendation time 65.447 秒；deterministic outcome signature 為 `2ddb13936fd4952b`。

## 主要退步

E02 mechanics `5921cd1d6a76`、recipe 37521：

| Policy | 完成檔位 | 最終品質 |
| --- | ---: | ---: |
| v1.12 | 4／滿品質 | 19,500 |
| Raw Teacher 32 | 4／滿品質 | 19,500 |
| Raw Teacher 64 | 4／滿品質 | 19,500 |
| Consensus | 2 | 15,422 |

這個退步特別重要：兩個 raw teacher 各自完整接管時都與 baseline 達滿品質，但逐 state 混合「confident override／reference fallback」後反而只到第 2 檔。局部候選的配對估值即使超過 2SE，仍沒有證明一連串 override 與 fallback 組成的 hybrid policy 保有 route-level 玩家成果。

Consensus 在另一個 E02 case 把品質從 baseline 18,451 提到 20,074，但仍低於唯一 22,100 milestone，沒有玩家可見檔位收益；它不能抵銷前述滿品質退步。先前 raw 32 唯一救回的 hard-quality case 在 consensus 仍失敗，最終品質 26,719／必要品質 29,800。

## 代表意義

1. **提高統計門檻不能補 route-level value 缺口。**把 2SE 調成 3SE／4SE 只會在這 10 個已看 cases 上調參；沒有新的 mechanics／objective／route signal，不構成下一個因果假說。
2. **逐 state confidence 不是完整策略 confidence。**學生未來也是 reactive ranker；若教材只教局部 candidate gain，仍可能在 closed loop 組成老師自己沒完整驗證過的 hybrid route。
3. **目前沒有值得大量模仿的老師。**Raw 32 有單格 gain 但不隨 budget 保留；raw 64 無玩家可見 aggregate gain；consensus 產生重要品質退步。大量資料只會昂貴地放大未通過的 value signal。
4. **負結果保留工程價值。**Dataset exporter、fixed-budget evaluator、preference probe、closed-loop runner、deterministic outcome signature 與 consensus disposition counters 都可重播；未來有新的 route-level signal 時不必重建實驗基礎。
5. **Web 路線不受阻。**v1.12 仍是已採用且 full-run 驗證的核心；Web 可在獨立 worktree 接它的 Rust／WASM ABI，未來 solver 透過 planner adapter／identity 替換。

## 停止點與下一步

- 不建立 teacher corpus manifest、不產生大量 labels、不比較學生模型、不交付 teacher unattended overnight。
- Solver optimization 回到手寫 candidate／value signal。第一個診斷是拆解 8 次 confident overrides，尤其 recipe 37521：比較局部 paired gain、route intent／continuation、必要進展與實際完成檔位，找出為何局部正值在 hybrid closed loop 反向。
- 下一個 teacher 必須預先提出 route-level 或 player-outcome-backed signal，不能只是更多 samples 或更高 SE 門檻。它先在相同 bounded development gate 通過，再凍結 fresh grouped split。
- 若未找到新 signal，learned candidate scorer 保留為研究方向，不繼續消耗 solver token；主線改做其他可泛化 Rust solver 改善。
