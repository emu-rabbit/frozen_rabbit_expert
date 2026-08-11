# 產品架構：Craft Policy、Mission Controller 與 Session

## 概述

產品不是單一「solver」畫面。它由單件製作決策、跨件任務控制、使用者回報／修正、研究評估四個 surface 組成；底層共用同一 mechanics 與 versioned data contract。

## 1. Craft policy

Craft policy 處理一件 craft 內的下一步推薦：

```text
CraftState + RecipeProfile + CrafterProfile
  -> legal action mask
  -> phase / guide signals
  -> candidate set
  -> finisher feasibility and reserve checks
  -> compact policy / limited immediate expectation
  -> recommendation + alternatives + reasons + confidence
```

它只根據目前 state 推論，不展開完整 future tree。每次玩家回報 action outcome 後重新執行。

## 2. Mission controller

Mission controller 管理單件 craft 以外的 objective：

- supplies remaining；
- crafts completed；
- accumulated score；
- mission failure state；
- mission deadline；
- Material Miracle／Stellar Steady Hand 使用與剩餘時間；
- 下一件 craft 應採取的 risk target。

`MissionState` 與 `CraftState` 必須分離。大部分 crafting actions 只改 Craft state；完成一件、消耗 supply 或使用 Duty Action 才改 Mission state。

## 3. Session interaction

Session surface 負責：

- 呈現本步使用 condition、建議 action 與玩家實際 action；
- 只在 action 可能失敗時要求 success／failure；
- 接收結算後的下一 condition；
- 顯示預測 state；
- undo／edit／resync；
- 保存 event path 與 model versions；
- 匯出可匿名化的 debug／golden trace。

玩家偏離推薦不是錯誤；系統應以實際 action 更新 state。若預測與遊戲不符，建立 `stateResynced` event，不能無聲覆寫歷史。

## 4. Research and evaluation

研究 surface 與實戰 runtime 分開：

- deterministic replay 與 mechanics mismatch diagnosis；
- fixed-budget policy rollout；
- common-random-number candidate comparison；
- condition profile sensitivity；
- held-out／adversarial benchmark；
- disagreement、recovery、mistake 與 OOD state corpus；
- policy artifact promotion／rollback。

大型分析、distribution materialization 與訓練不得阻塞玩家的下一步推薦。

## 5. Auxesia 任務族

`last_verified: handoff snapshot 2026-08-11`

| Family | 核心難題 | POC 順序 |
| --- | --- | --- |
| `auxesia-doh-wr01` | 前置材料＋最終 expert craft；主件具 Robust、Primed、Malleable、Pliant、Centered 等反應式狀態 | 1 |
| `auxesia-doh-wr02` | 9 分鐘、最多兩份材料、兩次 45 秒 Material Miracle、fast interaction | 2 |
| `auxesia-doh-tr01` | 兩件都需完成且不可失敗，跨件分配 Stellar Steady Hand | 3 |

精確 recipe／mission 數值與 ID 由 data owner 管理，不能只靠本表或顯示名稱識別。

## 6. 產品文案邊界

- 使用「推薦」、「依目前模型」、「估計」、「目前仍保有完成路線」。
- 只有被 deterministic mechanics／finisher proof 支持的內容才能稱 guaranteed；其他一律稱 estimate／high-confidence。
- confidence 必須至少拆為 mechanics version、condition profile confidence、policy coverage。
- alternatives 描述完成率、Gold 機率、資源、步數或 variance 的 trade-off，不列無意義的 raw score 排名。

## 7. 產品 surface 的演進順序

1. 先建立 manual state tracker 與 deterministic replay，不先做 solver。
2. 加入 WR.01 guide-policy-v1 與 finisher certificates。
3. 以離線 evaluator 改善 compact policy。
4. 再加入 WR.02 mission clock／fast mode。
5. 最後處理 TR.01 joint risk。

詳細交付與 gate 由 `.agents/roadmaps/poc_implementation_plan.md` 管理。
