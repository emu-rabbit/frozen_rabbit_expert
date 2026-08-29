# Completion-aware 完整確認簡報

`last_updated: 2026-08-29`

本輪要確認：completion-aware 候選能否在完整正式支援矩陣守住 v1.11 的基本解題能力與至少 80% 的主要收益，並證明 condition-specific proposals 對一般玩家有足夠大的完成後檔位價值。Bounded gate、exact-tape 修正與成本見 [completion-aware review](../reports/generic-cosmic-overnight/v111-completion-aware-bounded-review-20260829.md)；v1.11 原始四表見 [完整 overnight output](../reports/generic-cosmic-overnight/generic-native-v111-checkpoint-vs-v110-history-64seed-20260829.md)。

## 比較身份

同一案例、同一 RNG tape 直接比較三個 arm：

1. **基本基準**：`generic-craft-route-portfolio-v1.1.0`，代表已站穩的通用基本解題能力。
2. **球色機會消融**：`generic-craft-route-portfolio-exp-condition-opportunity-ablation`，與候選共用 mechanics、完成保護及 established continuation，只關閉 condition-specific proposal／coordination。
3. **Completion-aware 候選**：`generic-craft-route-portfolio-exp-completion-aware`，保留九球色機會提案與 funded routes，並以當前 state 的 bounded completion evidence 保護完工能力。

由「球色機會消融 − v1.1」判斷共用架構的價值；由「completion-aware 候選 − 球色機會消融」判斷額外球色機會決策的價值。消融仍會依 condition mechanics 計算技能效果，不把它描述為完全不看球色的外部 solver。v1.11 對 v1.1 的既有比較只回答整體組合效果，不單獨歸因成球色收益。

## 玩家切片與量尺

- **預設決策**：Balanced。
- **主戰裝備**：E02／E09；E03／E10 顯示專家能力，E05／E07涵蓋合理鑲嵌差異。這些 profile 均以食物與藥為正式支援情境；未食藥或明顯不足裝備只作 best-effort 壓力證據。
- **主要世界**：`balanced-iid`、`normal-heavy`、`opportunity-scarce`。`all-normal` 用來找結構性缺陷，不作自然球色成功率或主要產品收益 gate。
- **一般收藏品**：只計算已完成製作的 100／300／700／滿品質檔位遷移；未完成但品質較高不算玩家收益。
- **HQ／Master**：先看完成，再看滿品質尾端；沒有跨檔或滿品質改善的小幅平均增加不能抵銷滿品質明顯下降。
- **Hard-quality**：完成即代表必要品質達標。F36／F46 需在最強正式支援裝備維持非零達成並接受一次通用改善研究，不要求在本輪磨成高成功率。
- **成本**：每步主要求解器低於 3 秒是玩家 gate；總 overnight 時間與計算倍率是研究成本，用來判斷收益是否值得，不取代玩家結果。

## 已通過的 bounded gate

- F25／F26／F27 共 17 個滿品質未交貨 tapes 全數恢復為滿品質完成；F44 兩個新 seed 完成缺口及 F50 action-limit 也已修正。
- E02／E09 × Balanced × 三個主要 worlds × 50 families 的未見 seed 小矩陣為 0 illegal、0 policy-null、0 action-limit，候選相對 v1.11 完成持平。
- 一般收藏品相對球色機會消融的完成後檔位淨上升 5.38 pp，完成不退；相對 v1.11 的檔位／滿品質跨 corpus 保留率 proxy 為 89.4%／93.4%。
- 完整矩陣需確認上述結果能跨正式支援裝備重現，並分開判讀檔位與滿品質尾端。

## 執行與判讀順序

1. 由使用者依 [overnight workflow](workflows/run-generic-overnight-evaluation.md) 啟動完整 same-tape 評測；三個 arm 使用相同 cases 與 RNG tape。
2. 先判讀 Balanced × `balanced-iid` × E02／E09，再看全部正式支援裝備與三個主要 worlds；family × equipment × risk × world 分開呈現。
3. 一般收藏品分別計算已完成檔位、滿品質與完成率；HQ／Master 驗證 v1.1 fallback，hard-quality／Stable 驗證既有安全基準。
4. 通過完整接受條件後才建立新數字版號，接續 hard-quality 通用改善與 Web runtime 採用。

## 接受條件

- 0 illegal、0 valid-nonterminal policy-null、0 新增 action-limit；mechanics 與必要品質正確性不容效果平均抵銷。
- Completion-aware 候選相對球色機會消融，在主切片的已完成檔位淨上升或滿品質率至少有一項達到 5 percentage points，完成率下降不超過 0.5 percentage points。
- Completion-aware 候選相對 v1.1，在同一完整 corpus 保留至少 80% 的 v1.11 一般收藏品主要可感知收益。
- 主戰高裝備不得因同一通用 policy 系統性弱於較低正式支援裝備；`all-normal` 的個別壓力交換可存在，但必須有可解釋的 state／route 原因。
- HQ／Master 的滿品質尾端不得用未跨檔的平均品質小增幅交換。若共同球色策略在某 objective 沒有正回報，允許以 objective kind 選回 v1.1；這是通用能力邊界，不是配方特例。
- Stable 與 hard-quality 保持 v1.1 的既有安全基準，除非另有事前定義且更好的通用實驗。

完整矩陣通過時，候選取得數字版號並成為 Web 採用基礎；未通過時，以 family／objective／world 的玩家可見差異定位是否有一個小範圍通用修正。沒有明確產品回報的假說不以擴大 seeds 延長。
