# 專案使命與核心目標

## 專案定位

Frozen Rabbit Expert 是 Final Fantasy XIV 宇宙探索高難度巧匠的 local-first 即時決策助手。玩家填入裝備、選擇配方與風險取向，每一步回報實際技能結果與下一球色，系統再依完整 state 推薦下一技能。

它不是固定巨集，也不承諾全域最佳；價值在於玩家偏離、技能失敗或球色改變後，仍能重新規劃。

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
- 讓 Stable／Balanced／Aggressive 表達願意承擔的風險，而不是三個沒有可觀察差異的標籤。
- 高難配方追求有意義品質；低品質交貨不能自動視為產品成功。
- Hard-quality 追求滿品質，一般收藏品顯示 100／300／700／滿品質四檔，HQ 類顯示 50%／75%／100% protected floors 與隨品質上升的 HQ 機率；所有 risk 都持續貪求更高品質。
- 弱裝備仍提供誠實 best-effort，並說明可能交換的品質、完成或風險。
- 顯示推薦理由與替代技能的取捨，讓玩家保有最後決定。

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
