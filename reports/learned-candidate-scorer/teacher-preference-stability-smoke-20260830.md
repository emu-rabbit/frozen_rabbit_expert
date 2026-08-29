# Route-aware teacher preference stability smoke

`date: 2026-08-30`

## 問題與結論

這個 bounded smoke 只回答：同一個 v1.12 可觀測 state 與同一批合法候選，離線 teacher 把 common-random-number futures 從 16 增至 32、再從 32 增至 64 時，最高排名是否已足夠穩定，可直接當單一正解教材。

答案是：**不能把目前最高排名直接當 hard label 大量生產。**254 個多候選決策中，16→32 與 32→64 都只有 219 個 candidate 一致、227 個下一招一致；增加到 64 samples 沒有提高 top-1 agreement。不過分差診斷也顯示，兩輪各 27 個動作翻轉全都落在兩倍配對標準誤內，或屬於零標準誤的同分／決勝規則情況。這較像「近似等價候選被強迫選唯一第一名」，不是明顯優劣之間任意翻轉。

因此目前停止條件是：不啟動大量 train corpus，不以 top-1 action imitation 當標籤。下一個 bounded slice 應保存各候選分數、配對不確定度與近似同分關係，再以 teacher-selected closed loop 檢查這些不同選擇是否真的帶來等價或更好的玩家成果。

## 實驗身份與邊界

- Baseline solver：`generic-craft-route-portfolio-v1.12.0`。
- 描述性實驗：`native-route-candidate-teacher-probe-v1`；沒有 solver 數字版號。
- Corpus：從既有、已看過的 `v111-gated-causal-broad` development input 取 Balanced × `balanced-iid` × E02／E09，共 10 cases（各 5）；只把 solver 欄位改為 v1.12。這不是 fresh grouped holdout，也不支援 promotion。
- 每個 state 先由 ordinary v1.12 產生候選；teacher 不改 candidate generation、順序、legality、continuation、routing、guard 或 selector，只以固定 samples／horizon 重評全部候選。明示 teacher budget 關閉 staged screening。
- 每一候選在相同 budget 使用相同 planning random streams；較高 samples 延長相同 deterministic sample 序列，不讀取 episode 尚未發生的實際 RNG。
- Horizon 固定 64，仍受當下 action runway 上限約束。
- Episode 始終依 ordinary v1.12 的動作前進；teacher recommendations 是同一 observed state 上的 read-only counterfactual。因此本結果不是 teacher closed-loop 玩家成果。

## 結果

兩輪都觀察 333 decisions，其中 254 個有超過一個候選，另 79 個單候選決策不納入 agreement 分母。

| 比較 | Candidate 一致 | 下一招一致 | Baseline 與高預算 candidate 一致 | Baseline 與高預算下一招一致 | 低／高預算 projected transitions | Release elapsed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 16→32 | 219／254（86.22%） | 227／254（89.37%） | 179／254（70.47%） | 194／254（76.38%） | 319,808／640,097 | 36.503 s |
| 32→64 | 219／254（86.22%） | 227／254（89.37%） | 180／254（70.87%） | 195／254（76.77%） | 640,097／1,280,251 | 69.621 s |

32→64 的主要裝備切片：

| 裝備 | 多候選決策 | Candidate 一致 | 下一招一致 | 動作翻轉 |
| --- | ---: | ---: | ---: | ---: |
| E02 | 138 | 116／138（84.06%） | 121／138（87.68%） | 17 |
| E09 | 116 | 103／116（88.79%） | 106／116（91.38%） | 10 |

動作翻轉的分差診斷：

| 比較 | 動作翻轉 | 高預算分差 ≤ 1× paired SE | 高預算分差 ≤ 2× paired SE | paired SE = 0 的同分／決勝情況 |
| --- | ---: | ---: | ---: | ---: |
| 16→32 | 27 | 12 | 19 | 8 |
| 32→64 | 27 | 15 | 23 | 4 |

`paired SE = 0` 不列入前兩欄；因此兩輪的 `≤ 2× paired SE` 與零 SE 個數合計都正好涵蓋全部 27 個動作翻轉。32→64 翻轉的高預算絕對分差 p50 為 0.00440、p90 為 0.07495、最大 0.25277；這些數值只在目前 selection-score 尺度內有意義。

Rows 的 deterministic FNV-1a 診斷 hash：

- 16→32：`c1a2c98384c9d4db`
- 32→64：`a496bbea7737ff12`

FNV 只用來快速抓 row drift；未來正式 corpus 仍需 frozen manifest 與 SHA-256 artifact identity。

## 代表意義

1. **高預算 teacher 不是 v1.12 的昂貴重播。**32／64-sample teacher 與 baseline 在多候選 state 約有 23% 的下一招不同，足以進入 closed-loop 因果比較；但「不同」本身不是改善證據。
2. **硬式唯一答案目前不成立。**Sample budget 加倍後約 10.6% 動作翻轉，而且 32→64 沒有下降；直接用 top-1 cross-entropy 會把統計近似同分誤寫成唯一真值。
3. **估值尚未顯示廣泛失控。**所有動作翻轉都被兩倍配對不確定度或零 SE 同分涵蓋，支持先改成 pairwise／soft／equivalence-aware labels，而不是立即否定 route-aware ranker。
4. **是否值得訓練仍未回答。**Teacher 必須在 fresh grouped cells 的 closed-loop same-tape 玩家成果上至少保住完成，並改善完成成品檔位、滿品質或 U；否則學生只會快速模仿一個沒有新增玩家價值的老師。
5. **成本需要分片。**10-case development probe 的 32→64 release 執行已需 69.621 秒；正式 teacher corpus 不能靠單一未分片程序，也不能在本階段啟動 unattended 長跑。

## 下一個 gate

1. Teacher artifact 保存每個候選的連續分數、與翻轉對手的 cross margin／paired SE，以及 route-aware outcome heads；不把 recipe／equipment／seed identity 納入 runtime feature。
2. 建立 teacher-selected closed-loop runner，在相同實際 condition tapes 上直接比較 v1.12、32-sample 與 64-sample teacher。主要判讀仍是 completion、完成成品檔位、滿品質、U、illegal、policy-null 與成本。
3. 在產生 fresh labels 前凍結 family／route／近似面板 grouped split、leave-one-anchor-out 與 fresh seed namespace manifest。
4. 只有 teacher closed loop 通過玩家成果 gate，才生成大量 soft／pairwise corpus；否則回到候選產生或估值的手寫改善。
