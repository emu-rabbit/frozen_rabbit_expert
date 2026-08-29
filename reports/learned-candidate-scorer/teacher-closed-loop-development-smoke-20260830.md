# Route-aware teacher closed-loop development smoke

`date: 2026-08-30`

## 問題與結論

這個 bounded smoke 讓 fixed-budget teacher 真正接管每一步，直接回答「多看 32／64 條 planning futures 後的不同決策，是否在同一實際 RNG streams 上帶來比 ordinary v1.12 更好的最終玩家成果」。

答案是：**目前沒有 budget-stable superiority，不能啟動 fresh teacher gate、overnight 或大量教材生成。**32-sample 在 10 個已看過的 development cases 中把完成從 7 提到 8；64-sample 卻失去這個唯一收益，回到 7。64 與 baseline 的完成、完成檔位、滿品質完全相同，而 32／64 只有 2／10 條完整 action trace 一致。較貴的 64 沒有保留 32 的結果，故不能把 32 的單格救回視為可泛化進步。

這也不是整條 learned ranker 路線失敗。32 的救回證明同一批合法 candidates 中存在不同閉環結果；但下一個 teacher 必須對近似同分候選採用 uncertainty-aware／consensus 規則，而不是直接把有限抽樣最高分當唯一動作。

## 實驗身份與邊界

- Baseline：`generic-craft-route-portfolio-v1.12.0`。
- Teachers：`generic-craft-route-teacher-samples-32-horizon-64`、`generic-craft-route-teacher-samples-64-horizon-64`。
- Runner protocol：`native-route-candidate-teacher-episode-v1`；沒有 solver 數字版號。
- Corpus：與 preference smoke 相同，從既有 `v111-gated-causal-broad` development input 取 Balanced × `balanced-iid` × E02／E09，各 5 cases；只把 solver 欄改為 v1.12。這 10 cases 已看過、沒有 frozen grouped split，不是 promotion evidence。
- Baseline、32、64 都從相同 seed／initial cursor 開始，使用相同實際 condition／success RNG streams；不同 action 可能合法地消耗不同 stream 次數，因此比較的是同源 closed-loop，而不是強迫每一步看到相同 condition。
- Teacher 只重評 v1.12 當下產生的合法 candidates，保留 mechanics、route continuation、objective／risk routing、Stable／hard-quality guard 與 planner-context 更新。Teacher 不讀 episode 尚未發生的實際 RNG。
- 輸出保留每次 recommendation timing；summary 的 outcome FNV-1a signature 會先排除 timing，只簽 action、終態、RNG cursor、planner context 與其他 deterministic outcome cells。FNV 仍只是快速 drift 診斷，不是正式 artifact identity。

## Aggregate 結果

| Policy | 完成 | Failure | Action limit | Policy-null | Illegal | 完成檔位總和 | 滿品質 | Actions | Release elapsed | Recommendation time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v1.12 | 7／10 | 3 | 0 | 0 | 0 | 21 | 6 | 333 | 2.321 s | 2.241 s |
| Teacher 32 | 8／10 | 2 | 0 | 0 | 0 | 22 | 7 | 376 | 29.463 s | 29.409 s |
| Teacher 64 | 7／10 | 3 | 0 | 0 | 0 | 21 | 6 | 318 | 44.625 s | 44.608 s |

配對差值：

| 比較 | 完成 Δ | 完成檔位 Δ | 滿品質 Δ | 雙方都完成 cases 的品質合計 Δ | 完整 action trace 一致 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Teacher 32 − v1.12 | +1 | +1 | +1 | +1,894 | 0／10 |
| Teacher 64 − v1.12 | 0 | 0 | 0 | +1,623 | 1／10 |
| Teacher 64 − Teacher 32 | −1 | −1 | −1 | −271 | 2／10 |

Deterministic outcome signatures：

- Teacher 32：`285fcca48b1863a8`
- Teacher 64：`b970ba0e67218725`

Baseline 的現有 generic runner hash 包含 timing，不當作 deterministic outcome identity；teacher runner 已在這個 slice 修正該問題。

## 唯一 completion 差異

唯一改變 completion 的格是 mechanics `d47b28fc1173`、recipe 36227、E02、Balanced、`balanced-iid` 的 hard-quality-max case，品質上限與必要品質都是 29,800，進展需求 11,400。

| Policy | 終局 | Actions | 最終進展 | 最終品質 | 耐久 | CP |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| v1.12 | Failure | 57 | 10,419 | 25,663 | 0 | 0 |
| Teacher 32 | Completed | 49 | 11,400 | 29,800 | −3 | 7 |
| Teacher 64 | Failure | 53 | 11,400 | 26,136 | 0 | 0 |

Teacher 32 與 64 前 10 招相同，之後 32 選精密加工（Precise Touch，`preciseTouch`），64 選秘訣（Tricks of the Trade，`tricksOfTheTrade`）；後續路線再分岔。32 的確找到可完成且達必要品質的路線，但 64 在相同起點與更多 samples 下改選後，雖推滿進展，卻因必要品質不足而失敗。這是實際玩家結果，不只是 score 差；也正因 64 沒保留收益，目前不能採用 raw top-1 teacher。

## 代表意義

1. **更多 samples 不保證更好的 policy。**它只降低有限預演的抽樣誤差；candidate value、utility、horizon 與 top-1 decision rule 若仍有缺口，64 可以比 32 更貴但不更好。
2. **32 的 +1 仍是有效診斷。**它證明 candidate set 內有能救回 hard-quality 的閉環選擇；但單一 development win 且無 64 confirmation，不能成為 selector、版號或 overnight 理由。
3. **Preference instability 已轉成玩家成果 instability。**先前 32→64 有 27／254 個多候選決策翻轉；本輪顯示至少一個翻轉鏈會改變 completion，因此不能只把所有近似同分視為無害。
4. **安全邊界仍成立。**三者都沒有 illegal、policy-null 或 action-limit；問題是合法策略的品質／完工取捨，不是 mechanics 或 runtime contract 壞掉。
5. **成本尚不適合直接擴大。**Teacher 32 約為 baseline 13 倍 recommendation time，Teacher 64 約 20 倍；在未建立穩定收益前，不應交付 unattended 長跑。

## 下一個最小可否決 slice

1. 建立 uncertainty-aware teacher：只有較高預算候選對 ordinary reference 有超過事前 paired uncertainty／practical margin 的證據才 override；32／64 不同意時退回 reference，或保留近似同分集合而不硬選唯一標籤。
2. 在相同 10-case development corpus 先比較 raw 32、raw 64 與 consensus／reference-fallback teacher。若唯一 completion gain 消失且沒有其他玩家成果提升，停止這個 teacher 定義，不擴 seeds。
3. 若 consensus teacher 同時保留安全、產生 budget-stable 玩家收益，再凍結 grouped split／fresh namespace，進入未見資料的中型 gate；仍須先於 overnight。
4. Student 仍不進場。任何模型 fit、action imitation 或 rank correlation 都不能補上 teacher 尚未證明的 closed-loop 價值。
