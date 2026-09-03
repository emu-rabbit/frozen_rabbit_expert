# 產品架構：Catalog、Craft Solver 與 Session

## 文件角色

本檔定義穩定的產品 surface 與責任邊界。實作現況看 [current_state.md](../../current_state.md)；package 與語言選擇看 [technical_architecture.md](../professional/technical_architecture.md)。

## Recipe catalog

每個可選配方至少綁定：

- canonical recipe／item identity 與來源；
- `RecipeProfile`：等級、進展要求、品質上限、耐久與可用 conditions；
- `CraftObjective`：hard-quality 或 soft-quality／收藏價值目標；
- mechanics family identity；
- 玩家顯示名稱、職業與搜尋 metadata。

相同 family 代表所有會改變求解的 mechanics、condition set 與 objective semantics 相同。現階段假設 family 內配方可以共用求解與評測；遊戲 trace 出現反例時，先修正 data／family identity，再判斷是否需要新策略訊號。

Catalog identity、數量與 hashes 由 data package／importer 擁有，本檔不複製 snapshot。

## 單件製作決策

輸入：

~~~text
RecipeProfile
+ CraftObjective
+ CrafterProfile
+ observed CraftState
+ actual action history
~~~

輸出：

- 建議技能；
- 推薦理由；
- 主要替代技能與取捨；
- 使用的是主要求解器或快速求解器；
- 計算時間與失敗原因；
- 必要的能力邊界說明。

Mechanics 先產生合法技能與 state transition；solver 再比較路線。Solver intent 放在獨立 planner memory，不污染客觀 `CraftState`。

## 主要求解器

主要求解器可使用固定預算的多步規劃、route memory 與隨機情境比較，目標是在 3 秒內提供較完整的品質／完成取捨。產品只使用單一預設策略；每一步都依實際 state 與 history 重算，不能假設玩家遵循上一個建議。

## 快速求解器

快速求解器是獨立、固定計算預算的完整策略，不是舊五配方 guide，也不是任意合法技能 selector。

優先順序：

1. 回傳合法技能。
2. 避免立即且確定的失敗。
3. 若仍有可證明的完工路線，保留它。
4. 依預設策略提高有意義品質。
5. 無法證明完成時仍提供誠實 best-effort。

只要合法非終局 state 至少有一個合法技能，快速求解器就不能回傳空白。較深入比較接近預算時，最後由 bounded selector 掃描合法技能並選出結果。

目標裝置 p95 小於 100ms，同時報告 p99 與 max。這是已決定的產品契約；目前是否已實作以 `current_state.md` 為準。

## Runtime 選擇流程

~~~text
嘗試主要求解器，最多 3 秒
  -> 成功：顯示主要建議
  -> 失敗／逾時：顯示快速建議與原因
玩家執行任一合法技能
  -> 記錄實際 action／outcome／condition
  -> 下一步重新嘗試主要求解器
~~~

使用快速建議不會永久切換模式。若 state 已終局、沒有合法技能或輸入損壞，明示結果並提供 resync／restart，不捏造技能。

## Session interaction

- 新 craft 第一手固定 Normal。
- 推薦卡先顯示技能，再讓玩家回報需要的成敗與下一球色。
- 100% 成功或不推進 step 的技能不要求不存在的輸入。
- 玩家可選其他合法技能，session 以實際技能更新。
- 預測與遊戲不符時，以 `stateResynced` event 明確校正，不覆寫歷史。
- Undo 以 event path 重建 state 與 planner memory。
- 進行中的 craft 不自動持久化；reload 後回設定畫面。裝備、語言、明暗模式與首訪語言設定完成狀態可保存。
- Debug export 包含匿名 replay 所需 versions、profiles 與 events。

完整事件契約見 [session_state_and_events.md](../../specs/session_state_and_events.md)。

## 發布 gate

產品不維護配方成熟度標籤。開發期以 family matrix 找出缺口；所有 families 達到使用者接受的可靠程度後，才把整個網站視為可發布。

Evidence package 至少分開呈現：

- mechanics／合法性；
- progress-only 與 hard-quality；
- family × equipment × assumed condition world；
- policy-null、無合法技能、終局與 action-limit；
- 主／快速求解器 latency；
- 玩家偏離、undo、resync 與 replay；
- synthetic、assumption 與玩家實戰 evidence 的界線。

最終發布是使用者明確決策，不由單一 aggregate 指標自動觸發。

## 明確移出的範圍

跨件材料、任務分數、倒數與 Duty Action controller 不在目前產品承諾。歷史結果可保留在 evaluation output，但 active architecture 不為它預留扁平 state、UI 或 runtime branch。
