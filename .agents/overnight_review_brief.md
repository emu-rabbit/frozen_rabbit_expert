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
4. **下一步：**建立 teacher-selected closed-loop runner；在相同實際 condition tapes 直接比較 v1.12、32-sample 與 64-sample teacher。Preference probe 始終跟隨 baseline，不能代替這個玩家成果 gate。
5. 把 family／route／近似面板 grouped split、leave-one-anchor-out 與 fresh seed namespace 寫入 frozen manifest；fresh labels 只能在 manifest 之後產生。
6. Teacher 通過 closed loop 後才開始大量資料生成與小模型訓練。教材保存連續分數、paired uncertainty 與近似同分關係，不把 top-1 action 當唯一正解。

## 接受與停止條件

- Exporter round-trip、identity、hash 或 RNG 隔離失敗，先修資料契約，不生成更多資料。
- 目前 16→32 與 32→64 在 254 個多候選 development 決策都只有 227 個下一招一致；27 個翻轉全落在兩倍 paired SE 內或零 SE 同分。這否決 top-1 hard labels，但保留 soft／pairwise teacher 研究；closed loop 未通過前不訓練模型。
- Teacher 在 fresh grouped cells 沒有玩家可見收益，或出現 completion practical regression、illegal、合法非終局 policy-null，停止大量訓練。
- Teacher 通過後，學生仍只作合法候選 ranker；低信心／OOD／guard 命中退回 v1.12。Action imitation accuracy、rank correlation 或較低 loss 只能診斷，不能通過 gate。
- 只有學生 closed loop 在 family × equipment × world 上保留 teacher 的可重現收益、重要切片不退且成本相稱，才建立 solver candidate。之後仍需新的 bounded promotion brief；目前不啟動 overnight。

完整資料、teacher 權限與模型契約見 [學習式候選排序器重啟計畫](research/learned_candidate_scorer_plan.md)。
