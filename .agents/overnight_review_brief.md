# Condition value 評測簡報

`last_updated: 2026-08-29`

本輪要回答的產品問題是：在可靠的基本製作能力上，讀取玩家回報的球色是否能帶來一般玩家可感知、且值得維護成本的成果。v1.11 完整矩陣已完成；原執行契約封存於 [v1.11 overnight brief](archive/handoffs/overnight-v111-review-2026-08-29.md)，原始固定四表見 [v1.11 overnight output](../reports/generic-cosmic-overnight/generic-native-v111-checkpoint-vs-v110-history-64seed-20260829.md)，完成後檔位重算與 exact-tape 原因見 [玩家價值 review](../reports/generic-cosmic-overnight/v111-player-value-review-20260829.md)。

## 比較身份

同一案例、同一 RNG tape 直接比較三個 arm：

1. **基本基準**：`generic-craft-route-portfolio-v1.1.0`，代表已站穩的通用基本解題能力。
2. **無球色控制組**：沿用 v1.11 的 funded route、scorer 與 endgame 架構，只關閉 condition-specific proposals。這是描述性實驗身份，不取得新數字版號。
3. **球色候選組**：以 v1.11 能力為起點，保留全九球色提案，加入本輪通用的完工路線保護。這同樣先使用描述性實驗身份。

由「無球色控制組 − v1.1」判斷新基本架構的價值；由「球色候選組 − 無球色控制組」判斷讀球本身的價值。v1.11 對 v1.1 的既有比較只回答整體組合效果，不單獨歸因成球色收益。

## 玩家切片與量尺

- **預設決策**：Balanced。
- **主戰裝備**：E02／E09；E03／E10 顯示專家能力，E05／E07涵蓋合理鑲嵌差異。這些 profile 均以食物與藥為正式支援情境；未食藥或明顯不足裝備只作 best-effort 壓力證據。
- **主要世界**：`balanced-iid`、`normal-heavy`、`opportunity-scarce`。`all-normal` 用來找結構性缺陷，不作自然球色成功率或主要產品收益 gate。
- **一般收藏品**：只計算已完成製作的 100／300／700／滿品質檔位遷移；未完成但品質較高不算玩家收益。
- **HQ／Master**：先看完成，再看滿品質尾端；沒有跨檔或滿品質改善的小幅平均增加不能抵銷滿品質明顯下降。
- **Hard-quality**：完成即代表必要品質達標。F36／F46 需在最強正式支援裝備維持非零達成並接受一次通用改善研究，不要求在本輪磨成高成功率。
- **成本**：每步主要求解器低於 3 秒是玩家 gate；總 overnight 時間與計算倍率是研究成本，用來判斷收益是否值得，不取代玩家結果。

## 實作與判讀順序

1. 重播 v1.11 相對 v1.1 的完成互換，先定位 F25／F26／F27 的 E09 `all-normal` 非單調裝備結果，以及 F50 的 80-step action-limit。
2. 以 completion evidence、funded route 與 route continuation 作通用修正；不使用 family、equipment、seed 或 future RNG selector。
3. 對同一失敗 tapes 驗證補救確實保住可完工路線，並確認原本受益 tapes 沒有被全面退回 v1.1。
4. 建立三臂 same-tape bounded matrix，先驗 E02／E09 Balanced，再擴至正式支援裝備與主要 worlds。
5. bounded gate 通過後才準備下一個完整矩陣；長跑仍由使用者啟動。

## 接受條件

- 0 illegal、0 valid-nonterminal policy-null、0 新增 action-limit；mechanics 與必要品質正確性不容效果平均抵銷。
- 球色候選相對無球色控制組，在主切片的已完成檔位淨上升或滿品質率至少有一項達到 5 percentage points，完成率下降不超過 0.5 percentage points。
- 球色候選相對 v1.1，保留至少 80% 的 v1.11 一般收藏品主要可感知收益。
- 主戰高裝備不得因同一通用 policy 系統性弱於較低正式支援裝備；`all-normal` 的個別壓力交換可存在，但必須有可解釋的 state／route 原因。
- HQ／Master 的滿品質尾端不得用未跨檔的平均品質小增幅交換。若共同球色策略在某 objective 沒有正回報，允許以 objective kind 選回 v1.1；這是通用能力邊界，不是配方特例。
- Stable 與 hard-quality 保持 v1.1 的既有安全基準，除非另有事前定義且更好的通用實驗。

若下一個小範圍通用改動未達上述結果，保留 v1.11 已證明的能力與本輪可重播證據，再由使用者依實際收益決定是否繼續 solver 研究或轉入 Web；不以擴大 seeds 延長沒有產品訊號的假說。
