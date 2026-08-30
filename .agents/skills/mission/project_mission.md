# 專案使命與核心目標

## 專案定位

Frozen Rabbit's Cosmic（冷凍兔肉的宇宙）是 Final Fantasy XIV 宇宙探索高難度巧匠的 local-first 即時決策助手。玩家填入裝備、選擇配方與風險取向，每一步回報實際技能結果與下一球色，系統再依完整 state 推薦下一技能。

它主要服務有滿等巧匠、願意依畫面逐步操作，希望學習高難製作或把即時計算交給工具的玩家。熟練玩家可以自行手工判斷；本產品的價值是把一般無球色求解器無法處理的當步機會轉成更高的完成與滿品質機率。

它不是固定巨集，也不承諾全域最佳。每一步以玩家實際回報的 state 重新規劃；初期產品先確保照建議操作的基本解題能力與讀球價值，玩家自行偏離後的深度救回在後續有足夠產品收益時再擴充。

## 核心使用流程

```text
填入裝備
  -> 選擇配方
  -> 選擇 Stable／Balanced／Aggressive
  -> 取得下一技能
  -> 回報實際技能、成敗與下一球色
  -> 依新 state 重新推薦
```


常見路徑中，玩家照建議使用 100% 成功技能時主要只需點下一球；非必定成功技能仍需回報成功／失敗。自行選擇其他合法技能是正常操作，不是錯誤。

## 使用者價值

- 依實際面板與配方計算，而不是套用單一玩家 rotation。
- 利用高品質、高效、結實等當步機會，同時保留完工與回復路線。
- Balanced 是預設：只用少量失敗交換玩家看得見的大幅品質提升。Stable 更重視下行保護；Aggressive 願意承擔更多失敗以提高滿品質占比。
- 高難配方先確保完成，再以完成成品跨過有意義獎勵檔位作主要改善；品質增加但未跨檔，或跨檔但沒有完成，都不算玩家可感知收益。
- Hard-quality 追求滿品質，一般收藏品顯示 100／300／700／滿品質四檔，HQ 類顯示 50%／75%／100% protected floors 與隨品質上升的 HQ 機率；所有 risk 都持續貪求更高品質。
- HQ／Master 的滿品質尾端優先於未跨檔的小幅平均增益。
- 弱裝備仍提供誠實 best-effort，並說明可能交換的品質、完成或風險。
- 顯示推薦理由與替代技能的取捨，讓玩家保有最後決定。

## 正式支援情境

- 主戰範圍是有食物與藥、合理鑲嵌的 720／750 裝備；E02／E09 是主要非專家評測 profile。
- E03／E10 涵蓋專家，E05／E07 涵蓋不同合理鑲嵌強度。
- 未食藥、未鑲嵌或明顯不足裝備提供 best-effort，仍遵守合法性與誠實結果，但不以其滿品質率作主要產品 gate。
- 主要求解器每步最多等待 3 秒。製作總步數會影響操作負擔，列為次要玩家量尺；overnight 總耗時只屬研究迭代成本。

## 產品底線

### 規則與決策分離

Mechanics engine 追求和遊戲一致，solver 只宣稱「依目前模型的建議」。Mechanics correctness、未來球色模型與策略效果使用不同 evidence，不用一個 confidence 掩蓋。

### 全配方整體發布

第一批產品範圍是 catalog 中全部 432 個宇宙探索高難度配方。相同求解規則的配方共用 family-level mechanics 與評測；發現遊戲實證反例後才建立例外。

正式發布採單一 gate：使用者確認所有 families 已足夠可靠後才對外發布。產品不顯示配方成熟度分級；評測報告仍需逐 family 揭露失敗，不能靠平均值通過。

### 兩種運算能力

目標產品有：

- 主要求解器：用較完整規劃取得較好的決策，每步最多等待 3 秒。
- 快速求解器：固定預算、目標裝置 p95 小於 100ms；合法非終局 state 仍有合法技能時必須回傳一個技能。

快速結果不會永久降級 session。玩家執行任一合法技能後，下一步仍以實際 history 重新嘗試主要求解器。

### Local、可恢復、尊重玩家

- 玩家實戰運算不依賴 server round-trip。
- Session 支援 undo、手動技能、resync 與主動 export。
- 不讀遊戲記憶體或封包、不自動按鍵、不做 bot。
- Web 不是永久唯一平台；採用 Rust 結果時再依實測選擇 WASM 或新的 TypeScript Web 核心。

## 不在目前承諾範圍

- 跨多件製作的材料、分數、倒數與 Duty Action controller。
- 每個配方長期維護獨立 solver 或 recipe-ID patch。
- 全 action sequence 暴力枚舉、完整 policy tree materialization、無 deadline 的大型 primitive-action search。
- 用舊五配方逐手相容限制 generic solver。
- 以 synthetic、IID、fixed-tape 或 relaxed bound 宣稱真實成功率或理論上限。
- 讓舊 TypeScript solver 恢復演進。
- 未確認授權時複製第三方攻略、UI、圖示或 source implementation。

## 成功定義

- 已知 family 的新名稱配方可以 data-only 進入 catalog，不改 solver control flow。
- 全部 432 配方在發布前通過使用者接受的整體 evidence review。
- 主／快速求解器都接受玩家實際 action history；合法性、終局與必要品質不被破壞。
- 評測分開呈現 progress-only delivery、四檔／連續收藏品質量、hard-quality 滿品質、HQ 機率、裝備壓力、risk 與球色情境。
- 低裝備結果誠實，高裝備效果不外推成所有裝備保證。
- 玩家在目標裝置能低負擔回報並看懂下一技能與主要取捨。
