# Craft State 與 Session Event Contract

## 文件角色

本檔定義單件 craft 的可重播 state／event 邊界。跨件 Mission controller 不在目前產品範圍，不在此 contract 預留 state。

Code owner：

- State types：`packages/domain/src/types.ts`。
- Events／export：`packages/protocol/src/events.ts`。
- Replay／undo：`packages/protocol/src/replay.ts`。

文件範例和 code 不一致時，以本次核對後的 code 與 tests 修正 owner，不能維護兩套 schema。

## Profiles

### RecipeProfile

配方的客觀 mechanics data：

- canonical recipe／item／family identity；
- 進展要求、品質上限、必要品質與耐久；
- progress／quality divider、modifier；
- available／random conditions；
- quality outcome 與 source metadata。

### CraftObjective

求解器希望追求的品質／收藏價值，和 `RecipeProfile.requiredQuality` 的 mechanics completion rule 分開。

### CrafterProfile

等級、craftsmanship、control、max CP、specialist 與會影響 mechanics 的工具特性。

Profiles 在一次 craft 中 immutable；換配方或裝備會開始新 craft，不在中途改 owner data。

## CraftState

`CraftState` 只保存目前可觀察的單件製作事實：

- step、進展、品質、耐久、CP、condition；
- 內靜、buff durations、combo；
- 一次性技能 availability／active state；
- terminal 與 failure reason。

不放入：

- 主／快速求解器模式；
- route intent、search node 或 future RNG；
- equipment／recipe ID 的策略 shortcut；
- 跨件材料、分數、倒數或 Duty Action。

跨步策略記憶使用獨立 `PlannerContext`，並可由 events／actual history 重建或失效。

## Session events

目前正式事件：

~~~ts
type SessionEvent =
  | { id: string; at: number; type: 'craftStarted' }
  | {
      id: string; at: number; type: 'conditionSelected'
      condition: MaterialCondition
    }
  | {
      id: string; at: number; type: 'craftActionUsed'
      action: CraftActionId
      previousCondition: MaterialCondition
    }
  | {
      id: string; at: number; type: 'craftActionResolved'
      success: boolean
      nextCondition: MaterialCondition
    }
  | {
      id: string; at: number; type: 'stateResynced'
      patch: Partial<CraftState>
      reason: string
    }
~~~

Event meaning 不依 UI 當下狀態改變。Edit／undo 以 immutable replacement 或重建 event list 實作，不原地竄改 export 中某個 event 的語意。

## Event reducer rules

### 開場

新 craft 最小序列：

~~~text
craftStarted
conditionSelected(normal)
~~~

第一手固定通常（Normal），UI 不詢問開場球色。

### 執行技能

- `craftActionUsed` 記錄玩家實際使用的技能與當時 condition。
- 同一時間最多一個 unresolved action。
- Action 必須對當時 state legal；mismatch 先 resync。
- 推薦出現本身不能自動當成已使用。主要路徑點擊下一球色是玩家的明確合併輸入：確認已使用畫面上的推薦技能，同時回報觀察到的 `nextCondition`；UI 不再要求另一個「已使用技能」或「確認球色」按鈕。

### 結算

- `craftActionResolved` 必須和前一個 unresolved action 配對。
- 非必定成功技能保存實際 success／failure。
- `nextCondition` 是結算後 condition；forced transition 優先於一般玩家選擇。
- 觀察（Observe）會推進 step 並產生 `nextCondition`；不要和不增加作業次數的 Final Appraisal／專家技能混為一類。
- 終局 action 不要求玩家回報不存在的下一球；codec 若為相容性保存 placeholder，文件與 UI 必須明說它不是觀察值。
- Apply outcome 後再次檢查 state invariant。

### Resync

- 沒有 pending action 時才能 `stateResynced`。
- Patch 保存原因並保留先前 events。
- Resync 後主／快速求解器都讀取新 state；PlannerContext 必須失效或依實際 history 重建。
- Resync 不是刪除歷史，也不以 reload 代替。

### Terminal

- `completed`／`failed` 後不再產生一般 recommendation。
- Progress 達標但必要品質不足時使用 `required-quality` failure。
- Terminal、no-legal-action 與 solver policy-null 分開。

## Replay 與 undo

相同 recipe、crafter、initial state、model identities 與 events 必須 deterministic replay。

`removeLastStep` 的語意：

- 先移除尾端尚未形成 step 的 condition selection；
- 移除最後一組 resolved／used action；
- 單獨的 resync 可作一個 undo unit；
- 不留下 orphan used／resolved event。

Planner memory 不需要寫進 `CraftState`；以 actual action history 和必要的 versioned context rebuild。

## Persistence

- 進行中的 craft、scenario、events 與 UI state 只存在記憶體。
- Reload 回到設定畫面，不恢復上次 craft。
- Local storage 只保存裝備、語言、明暗模式與首訪語言設定完成狀態。
- 啟動時清除已淘汰的 session storage keys，避免舊資料被誤讀。
- 玩家主動下載的 debug export 不屬於自動 persistence。

## Debug export

Export 至少包含：

- schema／session codec identity；
- recipe、objective、crafter 與固定的預設策略 identity；
- initial state；
- mechanics、solver、catalog、condition identities；
- ordered events；
- created time 與必要 notes。

Export 不包含配方成熟度或 coverage snapshot；產品對全 catalog 使用單一整體 gate，新文件或功能不得重新引入這類產品分級。

Export 預設匿名；角色、世界與非重播必要資訊不加入。Import 時先驗證 schema、identity、ranges 與 event ordering，再 replay。

## Mechanics APIs

- `legalActions`：回傳當前合法技能。
- `enumerateActionOutcomes`：offline simulation／evaluation。
- `applyObservedOutcome`：玩家實戰事件結算。
- `assertCraftState`：邊界與 invariant。

Simulation 與 observed outcome 共用同一 transition semantics，不維護兩套公式。
