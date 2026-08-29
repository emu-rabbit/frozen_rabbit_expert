# Rust solver optimization brief：學習式候選排序器 teacher gate

`last_updated: 2026-08-30`

使用者已決定暫停 Web integration，並重新啟動 2026-08-29 提出的 route-aware learned candidate scorer 方向。這不是舊 action-only POC，也不是待啟動的 unattended overnight；目前第一個 bounded gate 只回答：**能否建立可重播、比 v1.12 現行排序更有玩家價值的離線 Rust teacher？**

## 比較身份與玩家結果

- Baseline：`generic-craft-route-portfolio-v1.12.0`。
- Experiment identity：先用描述性的 `generic-craft-route-teacher-gate`；沒有 solver 數字版號。
- 玩家結果：以完成優先，改善已完成成品檔位、滿品質或 U；不得以 aggregate 品質抵銷重要切片未交貨。
- Teacher 權限：只重新評估 v1.12 已產生、已驗證合法的 route-aware candidates；不改 mechanics、candidate legality、Stable／hard-quality guard 或 fallback。
- Student 暫不進場。Teacher 自己未通過 closed-loop player-outcome gate 前，不產生大規模 train corpus。

## 第一個 implementation slice

1. **已完成：**Rust `rust-route-candidate-dataset-v1` schema、observer exporter 與 bounded CLI；保存 pre-action state／context、全部候選、route intent／continuation、現行估值、selected candidate 與 work counters，不輸出 recipe／equipment ID 作 runtime feature。
2. **已完成：**deterministic rows／hash、parser round-trip、精確 selected candidate、identity-only field 排除與 observer 不改 episode outcome／RNG 的測試；evidence 見 [exporter smoke](../reports/learned-candidate-scorer/dataset-exporter-smoke-20260830.md)。
3. **已完成：**固定高預算 offline candidate evaluator 與 `native-route-candidate-teacher-probe-v1`。明示 budget 重評全部候選、關閉 staged screening，保留 candidate generation／routing／guard；16→32 與 32→64 stability smoke 見 [preference evidence](../reports/learned-candidate-scorer/teacher-preference-stability-smoke-20260830.md)。
4. **已完成：**`native-route-candidate-teacher-episode-v1` closed-loop runner 與 10-case development smoke。Raw 32-sample 為 8／10 完成，baseline／raw 64 都是 7／10；64 沒保留 32 的唯一 hard-quality completion gain，完整結果見 [closed-loop evidence](../reports/learned-candidate-scorer/teacher-closed-loop-development-smoke-20260830.md)。
5. **已完成並停止：**`native-route-candidate-teacher-consensus-episode-v1` 要求 32／64 exact candidate 一致且 paired gain 大於 2SE 才 override。10-case development 結果與 baseline 同為 7／10 完成，但完成檔位 21→19、滿品質 6→5；證據見 [consensus smoke](../reports/learned-candidate-scorer/teacher-consensus-development-smoke-20260830.md)。
6. **下一步：**不再調 samples 或 SE 門檻。拆解 8 次 confident overrides，尤其 recipe 37521 的 route-level 反向，找出局部 paired gain 為何不能保住 closed-loop 成品檔位；新 teacher 必須加入 mechanics／objective／route-level player-outcome signal。
7. 在新的 teacher 先通過相同 development gate 前，不建立 grouped split manifest、不產生 fresh labels、不比較學生模型，也不交付 teacher overnight。

## 接受與停止條件

- Exporter round-trip、identity、hash 或 RNG 隔離失敗，先修資料契約，不生成更多資料。
- 目前 16→32 與 32→64 在 254 個多候選 development 決策都只有 227 個下一招一致；27 個翻轉全落在兩倍 paired SE 內或零 SE 同分。這否決 top-1 hard labels，但保留 soft／pairwise teacher 研究；closed loop 未通過前不訓練模型。
- Raw closed loop 的 32-sample 唯一 +1 completion 未被 64-sample 保留，視為 budget-unstable，不擴 seeds、不啟動 overnight。Consensus／reference-fallback teacher 若不能在同一 development corpus 產生穩定玩家收益，停止這個 teacher 定義。
- Consensus 已觸發停止條件：只有 8／325 decisions override，仍造成一個 E02 滿品質→第 2 檔退步。3SE／4SE 沒有新 causal signal，只是在已看資料調門檻，不執行。
- Teacher 在 fresh grouped cells 沒有玩家可見收益，或出現 completion practical regression、illegal、合法非終局 policy-null，停止大量訓練。
- Teacher 通過後，學生仍只作合法候選 ranker；低信心／OOD／guard 命中退回 v1.12。Action imitation accuracy、rank correlation 或較低 loss 只能診斷，不能通過 gate。
- 只有學生 closed loop 在 family × equipment × world 上保留 teacher 的可重現收益、重要切片不退且成本相稱，才建立 solver candidate。之後仍需新的 bounded promotion brief；目前不啟動 overnight。

完整資料、teacher 權限與模型契約見 [學習式候選排序器重啟計畫](research/learned_candidate_scorer_plan.md)。
