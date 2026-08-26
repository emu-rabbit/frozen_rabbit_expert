<!-- doc-status: archived -->

> **歷史文件。** 這是使用者提供的 2026-08-11 研究快照，不是目前 runtime truth、產品範圍或工作優先級。一般任務不要讀取；目前方向以 [`../../current_state.md`](../../current_state.md) 與 active canonical owners 為準。

# FFXIV 宇宙探索 EX+ 高難度巧匠求解器 POC 研究交接

> 文件狀態：新專案啟動用研究交接
>
> 研究快照：2026-08-11
>
> 主要遊戲版本：Patch 7.51，Auxesia 目前內容
>
> 來源專案：[`emu-rabbit/frozen_rabbit_tome`](https://github.com/emu-rabbit/frozen_rabbit_tome) `staging@07a8680`
> 預定產物：獨立的新 repository，不直接加入 `frozen_rabbit_tome`

## 1. 文件目的

這份文件交接一個「宇宙探索 EX+ 高難度巧匠即時決策助手」的 POC 方向。

產品預期流程是：

1. 使用者輸入配方、角色能力值、裝備／專家與任務條件。
2. 系統根據完整目前狀態推薦下一個技能。
3. 使用者在遊戲中施放技能。
4. 使用者回報技能成敗、新球色，以及必要的狀態修正。
5. 系統立刻推薦下一步，直到製作或任務結束。

這不是固定巨集產生器，也不是宣稱能找出全域最佳解的完整搜尋器。它的目標是在可運行的時間與記憶體內，提供比單純攻略表更貼近當前狀態、比玩家臨場心算更穩定，而且能解釋理由的推薦。

## 2. 已確認的產品決策

### 2.1 直接以宇宙探索 EX+ 為目標

POC 不先做一般高難度配方。第一個資料集與實戰驗收對象是 Patch 7.51 的 Auxesia DoH EX+ 任務。

官方 7.51 資料顯示 Auxesia 是目前宇宙探索的最新區域；EX+ 任務會給予 Auxesia exploration tokens。[Patch 7.51 Notes](https://na.finalfantasyxiv.com/lodestone/topics/detail/c46881a31a2c90d0965493c921b434eca09113f8) [Cosmic Exploration](https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/)

### 2.2 使用者回報完整狀態，不限於球色

只回報球色不足以重建狀態。高速製作、倉促製作與大膽製作等技能可能失敗；球色無法表示該技能是否實際增加作業或品質。

完整模式至少必須能接收：

- 系統上一手推薦與玩家實際使用的技能；
- 技能成功或失敗；
- 技能結算後出現的新球色；
- 玩家是否啟動 Duty Action；
- 玩家偏離建議、誤按或發現狀態不一致時的 resync 資料。

### 2.3 不使用完整暴力搜尋

明確排除以下正式求解路徑：

- 展開所有技能序列；
- 建立完整球色／成功失敗 policy tree；
- 以 memo capacity 不斷加大來硬撐完整 DP；
- 每一步在玩家端執行大型 MCTS 或長時間 stochastic tree search；
- 先產生巨大 policy 再嘗試完整 materialization。

正式方向是「相位化候選技能＋安全約束＋壓縮策略」，並用固定預算的離線模擬改進策略。

## 3. 研究結論摘要

可行，但應拆成兩層：

1. **Craft policy**：根據單件製作的完整狀態，立即推薦下一技能。
2. **Mission controller**：追蹤剩餘材料、已完成件數、累積分數、任務倒數與 Duty Action 次數，決定目前這一件應採用的風險目標。

玩家看見的是逐步決策樹；系統內部不建立完整樹，而是執行：

```text
完整目前狀態
  -> 合法技能過濾
  -> 製作相位與候選技能
  -> 完成可行性／收尾證書
  -> 壓縮 policy 評分
  -> 下一技能、理由、風險
```

使用者回報後，再從新狀態重新查詢 policy。歷史紀錄只保存走過的路徑。

## 4. Auxesia EX+ 不是單一問題

Auxesia 沒有先前星球的 Sequential Mission，但目前 DoH EX+ 仍至少有三種不同的任務型態。[Auxesia overview](https://www.icy-veins.com/ffxiv/auxesia)

### 4.1 已知任務族

| 代稱 | 任務特性 | 單件／配方資料 | 特殊資源 | POC 順序 |
|---|---|---|---|---|
| DoH WR.01 | 天候限定、兩階段材料製作，最後一件為真正 expert condition 配方 | 前置：耐久 75／作業 7800／品質 19600；主件：耐久 50／作業 7700／品質 26000 | 主件球色含 Robust、Primed、Malleable、Pliant、Centered | 第一優先 |
| DoH WR.02 | 天候限定，任務內有 9 分鐘倒數，材料最多兩份 | 耐久 80／作業 7200／品質 24100 | Material Miracle 2 次，每次 45 秒 | 第二優先 |
| DoH TR.01 | 任務出現受 ET 時段限制；要求製作兩件且一次都不能失敗 | 每件耐久 55／作業 7600／品質 21100 | Stellar Steady Hand 2 次 | 第三優先 |

資料來源與代表頁面：

- WR.01：[EX+: Purified Biofuel Development](https://ffxiv.consolegameswiki.com/wiki/EX%2B%3A_Purified_Biofuel_Development)
- WR.02：[EX+: Voyager Resource Research](https://ffxiv.consolegameswiki.com/wiki/EX%2B%3A_Voyager_Resource_Research_%28Carpenter%29)
- TR.01：[EX+: Portable Weatherproof Supplies](https://ffxiv.consolegameswiki.com/wiki/EX%2B%3A_Portable_Weatherproof_Supplies_%28Carpenter%29)

上述數字來自社群資料庫，實作前仍應由玩家在遊戲內 Cosmic Crafting Log 截圖確認，並保存 canonical recipe／mission ID，而不是只以英文或中文顯示名稱識別。

### 4.2 第一個 POC 為什麼選 WR.01

WR.01 主件直接包含此專案最想解的反應式狀態：

- Normal
- Good
- Robust
- Primed
- Malleable
- Pliant
- Centered

Robust 會減半耐久損耗並保證下一步為 Sturdy。Patch 7.41 官方說明也指出 Robust 只適用於該版本新增的特定配方。[Patch 7.41 Notes](https://na.finalfantasyxiv.com/lodestone/topics/detail/0de7befbbcefe67d1af77dcbe1bae937b916b67e/)

注意：即使 WR.01 的「可出現球色清單」沒有把 Sturdy 列為隨機球色，狀態機仍必須允許 `Robust -> Sturdy` 的強制轉移。不能把 sampled condition set 誤當成所有 reachable conditions。

WR.01 沒有 45 秒即時 Duty Action 壓力，因此最適合先驗證：

- 巧匠 simulator 是否正確；
- 完整狀態回報是否可用；
- 非暴力 policy 是否能在實戰給出合理建議；
- 低信心 fallback 與 resync 是否安全。

POC 可以先把前置材料階段視為已完成，或提供一段固定、已驗證的 deterministic rotation；核心研究集中在最後的 expert craft。

### 4.3 WR.02 是不同難題，不是多加一個 Buff

WR.02 代表任務有 9 分鐘倒數、兩份材料與兩次 Material Miracle。Material Miracle：

- 持續 45 秒；
- 每一步保證出現 Good、Sturdy、Centered、Pliant、Primed 或 Malleable；
- 即使原配方不是 expert recipe，也能出現上述特殊球色；
- 使用次數依任務限制。[Material Miracle](https://ffxiv.consolegameswiki.com/wiki/Material_Miracle)

社群實測初步推測啟動期間六種球色近似各 `1/6`，但樣本較小，必須標成 empirical／provisional，不能當官方公式。[Condition probability study](https://www.reddit.com/r/ffxivdiscussion/comments/1sg0428/the_precise_odds_of_expert_recipe_conditions/)

現有逐步 expert 工具刻意不把 Material Miracle 納入成功率與推薦，原因就是它依 real-time 而不是 step 數計算。[Thal's Tools guide](https://thiria.com/expert/guide/)

因此 WR.02 需要：

- 本機、無網路 round-trip 的即時 policy；
- 大按鈕與鍵盤快捷鍵；
- Duty Action 啟動時間與 45 秒倒數；
- 每一步操作耗時估計；
- mission-level 的剩餘 9 分鐘、材料與累積分數；
- Material Miracle 啟動期間的 fast mode；
- 對 UI 切換成本的實機測量。

### 4.4 TR.01 的風險是跨兩件累積

TR.01 要求完成兩件 collectable 且一次都不能失敗，並提供兩次 Stellar Steady Hand。Stellar Steady Hand 會保證接下來三步的技能成功。[Stellar Steady Hand](https://ffxiv.consolegameswiki.com/wiki/Stellar_Steady_Hand)

單件品質期望不是正確目標。Mission controller 必須考慮：

- 兩件都完成的 joint probability；
- 兩件累積分數是否達到 Silver／Gold；
- Steady Hand 是否各留一次，或某一件因狀態較差需要額外資源；
- 任一件失敗導致整個任務條件失敗的成本。

## 5. 來源可信度與資料治理

### 5.1 來源層級

建議每項資料保存 `sourceKind`、`sourceUrl`、`verifiedAt` 與 `confidence`：

1. **Official**：Lodestone patch notes、官方技能表與遊戲內 tooltip。
2. **Datamined／community database**：Teamcraft、FFXIV Console Games Wiki 等。
3. **Empirical**：玩家統計、截圖、逐步 trace。
4. **Assumption**：尚未證實但為了 POC 暫時採用的假設。

### 5.2 不可硬編一套全域球色率

Teamcraft simulator 是重要的 mechanics cross-check，且採 MIT license，但目前 source 內有一套 generic expert condition rate。它適合當參考，不代表所有 Cosmic recipe 共用同一分布。[Teamcraft simulator](https://github.com/ffxiv-teamcraft/simulator) [condition transition source](https://github.com/ffxiv-teamcraft/simulator/blob/master/src/simulation/simulation.ts)

近期玩家統計顯示，同樣球色集合的 expert recipes 仍可能有不同發生率。[Condition probability study](https://www.reddit.com/r/ffxiv/comments/1sfzcwn/the_precise_odds_of_expert_recipe_conditions/)

另外，Patch 7.51 上線時部分 Auxesia EX+ 一度錯用一般配方球色規則，官方已於 2026-06-12 修正。[7.51 known issue](https://na.finalfantasyxiv.com/lodestone/news/detail/1e229f18b31a9ac87e7c5ea5a14f96f6dad408b6)

建議 schema：

```ts
interface ConditionProfile {
  id: string;
  patch: string;
  recipeFamilyId: string;
  sampledConditions: MaterialCondition[];
  forcedTransitions: Partial<Record<MaterialCondition, MaterialCondition>>;
  probabilities?: Partial<Record<MaterialCondition, number>>;
  sourceKind: 'official' | 'datamined' | 'empirical' | 'assumption';
  sampleSize?: number;
  verifiedAt: string;
  notes?: string[];
}
```

Auxesia WR.01 的精確自然球色率目前仍是研究缺口。POC 不應偷偷套用 Oizys 或 Teamcraft generic rate。初期可同時用多組 plausible profiles 做 sensitivity evaluation，並讓規則 baseline 不過度依賴「再等幾步大概會出 Pliant」這類單一機率假設。

## 6. 正式狀態模型

高難度製作在每一步結算後，對玩家而言大致是 fully observable。隨機性來自下一球色與部分技能成功率，而不是看不見的隱藏狀態。只要完整保存狀態，問題可以建模為有限期 MDP；加入未知球色率後，則同時存在 model uncertainty。

### 6.1 配方與玩家輸入

```ts
interface RecipeProfile {
  recipeId: number;
  recipeFamilyId: string;
  missionFamily: 'auxesia-doh-wr01' | 'auxesia-doh-wr02' | 'auxesia-doh-tr01';
  job: CraftingJob;
  recipeLevel: number;
  progressRequired: number;
  qualityMax: number;
  durabilityMax: number;
  requiredCraftsmanship?: number;
  conditionProfileId: string;
  scoreTable: ScoreTable;
}

interface CrafterProfile {
  level: number;
  craftsmanship: number;
  control: number;
  maxCp: number;
  specialist: boolean;
  cosmicToolGoodMultiplier?: number;
  unlockedActions: CraftActionId[];
  delineationsAvailable: number;
}
```

食物與藥水可以在 UI 中分開輸入，但傳進 mechanics engine 前應正規化成實際 craftsmanship／control／CP。原始選項仍需保存，方便重現與除錯。

### 6.2 單件製作狀態

```ts
interface CraftState {
  step: number;
  progress: number;
  quality: number;
  durability: number;
  cp: number;
  condition: MaterialCondition;

  innerQuiet: number;
  buffs: {
    wasteNot: number;
    veneration: number;
    greatStrides: number;
    innovation: number;
    finalAppraisal: number;
    manipulation: number;
    muscleMemory: number;
    expedience: number;
    trainedPerfection: number;
    stellarSteadyHand: number;
  };

  comboFrom?: CraftActionId;
  trainedPerfectionAvailable: boolean;
  carefulObservationUsesLeft: number;
  heartAndSoulAvailable: boolean;
  heartAndSoulActive: boolean;
  quickInnovationAvailable: boolean;

  terminal: 'none' | 'completed' | 'failed';
}
```

這只是概念型別。正式實作前要逐一驗證：

- 哪些 action 不增加 step；
- 哪些 action 不消耗／不 tick 既有 buff；
- Manipulation 的回復與耐久歸零順序；
- Great Strides、Muscle Memory、Final Appraisal 的消耗時點；
- combo state 在 Observe 或失敗後是否保留；
- Pliant 的 CP 取整；
- Sturdy／Robust、Waste Not、Trained Perfection 疊加與耐久取整；
- Primed 增加 buff duration 的作用對象；
- Centered 與 Stellar Steady Hand 對成功率的上限；
- Heart and Soul、Careful Observation 與 Quick Innovation 的 no-step 行為。

官方 Lv.100 action 文字是最初規格來源。[Official Disciplines of the Hand actions](https://na.finalfantasyxiv.com/crafting_gathering_guide/culinarian/)

### 6.3 任務層狀態

```ts
interface MissionState {
  missionId: number;
  family: RecipeProfile['missionFamily'];
  suppliesRemaining: number;
  craftsCompleted: number;
  accumulatedScore: number;
  missionFailed: boolean;

  missionStartedAt?: number;
  missionDeadlineAt?: number;

  materialMiracleUsesLeft: number;
  materialMiracleEndsAt?: number;
  stellarSteadyHandUsesLeft: number;

  currentCraft?: CraftState;
}
```

Mission state 與 Craft state 不可混成一個扁平 key。大部分製作技能只改 Craft state；完成一件、使用 Duty Action 或耗掉 mission supply 才改 Mission state。

### 6.4 事件紀錄優於直接覆寫 state

建議 session 使用 event sourcing：

```ts
type SessionEvent =
  | { type: 'missionStarted'; at: number }
  | { type: 'craftStarted'; recipeId: number; at: number }
  | { type: 'dutyActionActivated'; action: 'materialMiracle' | 'stellarSteadyHand'; at: number }
  | { type: 'craftActionUsed'; action: CraftActionId; previousCondition: MaterialCondition }
  | { type: 'craftActionResolved'; success: boolean; nextCondition: MaterialCondition; at: number }
  | { type: 'stateResynced'; patch: Partial<CraftState>; reason: string }
  | { type: 'craftEnded'; result: 'completed' | 'failed'; score: number; at: number };
```

好處：

- 玩家可以修正前一步的成敗或球色；
- 可以從頭 replay 找出 mechanics mismatch；
- 可以匿名匯出 golden trace；
- model version 更新後可以重放舊紀錄；
- 不需要保存完整未走訪的 policy tree。

## 7. Mechanics engine 的邊界

### 7.1 核心 API

```ts
interface TransitionOutcome {
  probability: number;
  success: boolean;
  nextState: CraftState;
  explanation: string[];
}

function legalActions(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState
): CraftActionId[];

function enumerateActionOutcomes(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
  conditionProfile: ConditionProfile
): TransitionOutcome[];

function applyObservedOutcome(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
  observed: { success: boolean; nextCondition: MaterialCondition }
): CraftState;
```

`enumerateActionOutcomes` 給訓練與模擬使用；實戰走訪使用 `applyObservedOutcome`，不需要展開後續樹。

### 7.2 正確性與策略品質必須分離

- Mechanics engine 的狀態轉移應追求精確。
- Solver policy 只能稱為依目前模型推薦，不能稱為已證明最佳。
- Condition probability 不明時，預估成功率必須帶來源與不確定性。
- UI 不得把 simulator bug、condition profile uncertainty 與 policy approximation 混成同一個「信心值」。

建議分開顯示：

```ts
interface RecommendationConfidence {
  mechanicsVersion: string;
  conditionProfileConfidence: 'verified' | 'empirical' | 'assumed';
  policyCoverage: 'in-distribution' | 'near-boundary' | 'out-of-distribution';
  evaluationSampleSize?: number;
}
```

### 7.3 公式實作的起始交叉檢查

目前可先用 Teamcraft 的開源 simulator 作為實作起點，但它是社群實作，不是官方規格；每一條仍要用遊戲內 golden trace 驗證，尤其不能改變 `Math.fround`、`floor`、`ceil` 與乘算順序後假設結果等價。

截至本文件日期，它的關鍵計算順序包括：

- 基礎進展候選值：`craftsmanship * 10 / progressDivider + 2`；同級／跨級修正與最後取整依 recipe level 分支處理。
- 基礎品質候選值：`control * 10 / qualityDivider + 35`；同樣有 recipe level、modifier 與取整順序。
- `Pliant` 的 CP 消耗為 `ceil(baseCp / 2)`，不能直接向下取整。
- `Centered` 在基礎成功率上加 25 percentage points；仍需由 action 上限與實機結果確認是否 clamp。
- 品質 action 先處理球色倍率，再處理 `Great Strides`、`Innovation`、`Inner Quiet`、potency 與最後取整；`Good` 通常為 `1.5x`，對應 Cosmic relic tool 的 `1.75x` 分支必須保留為 crafter profile 能力，而非寫死。
- 進展 action 的 `Malleable` 為 `1.5x`；`Muscle Memory` 與 `Veneration` 疊入 action multiplier；`Final Appraisal` 在越過完成線時把進展壓回 `requiredProgress - 1` 並消耗 buff。

交叉檢查來源：[CraftingAction](https://github.com/ffxiv-teamcraft/simulator/blob/master/src/model/actions/crafting-action.ts)、[QualityAction](https://github.com/ffxiv-teamcraft/simulator/blob/master/src/model/actions/quality-action.ts)、[ProgressAction](https://github.com/ffxiv-teamcraft/simulator/blob/master/src/model/actions/progress-action.ts)。新 repo 應把這些規則拆成有版本的純函式，並針對每種球色、buff 疊加與邊界取整建立表格測試；不要直接把第三方 simulator 當 oracle。

## 8. 非暴力求解架構

### 8.1 相位化 policy

先建立一個可讀、可測的 base policy。建議相位：

1. `opener`
2. `secure-progress`
3. `build-inner-quiet`
4. `maintain-resources`
5. `prepare-quality-burst`
6. `quality-finisher`
7. `complete-synthesis`
8. `recovery`

相位不是固定依序只能走一次。狀態惡化時可以進 recovery，資源恢復後再回 build／prepare。

### 8.2 候選技能 gate

每個相位與 condition 只提供少量有意義候選，例如：

- Malleable：提高 Rapid／可靠 synthesis 候選優先級；
- Centered：提高 Rapid、Hasty、Daring 等 RNG action 候選優先級；
- Pliant：優先評估昂貴回復／buff action；
- Primed：優先評估長效 buff，但仍比較是否真的需要；
- Good：Tricks、Precise Touch、品質收尾或進度救援；
- Robust／Sturdy：評估高耐久效率 action；
- Normal：Observe、低成本推進、資源維持或相位轉換。

這些不是最終規則，只是 base policy 的 feature 與候選來源。候選 gate 必須允許測試證明某些常見直覺不成立後調整。

### 8.3 安全收尾證書

維護固定大小、人工設計且已驗證的可靠收尾模板集，而不是搜尋所有收尾序列。

每次推薦前檢查：

- 目前是否已有至少一組 guaranteed／high-confidence progress finisher；
- 使用候選技能後是否仍保有該 finisher 所需 CP、耐久與 buff／one-use resource；
- 是否可能因品質技能意外完成作業；
- 是否會把完成需要的最低 durability 降到不可恢復；
- WR.01 是否已達 Silver／Gold 目標，能否安全結束；
- TR.01 是否會讓兩件聯合成功率跌破設定底線；
- WR.02 是否仍能在剩餘實際時間內完成需要的 action 數。

當 state 尚未進入可證明完成的區域時，顯示 viability estimate，不得把它說成保證。

### 8.4 Offline approximate policy improvement

Base policy 可用後，再進行固定預算的策略改進：

```text
pi_0 = versioned guide-policy-v1

repeat for a small, fixed number of rounds:
  1. Simulate pi_i and collect reachable states.
  2. Add boundary, recovery and player-mistake states deliberately.
  3. For each sampled state:
       candidates = gated legal actions
       compare candidates with paired, fixed-count rollouts
       choose action under the configured risk objective
  4. Fit/distill a compact action scorer or decision policy.
  5. Evaluate pi_(i+1) on held-out recipes, stats and condition profiles.
  6. Reject the new policy if safety or holdout performance regresses.
```

每次 rollout 只抽一條未來軌跡，不建立分支樹。若：

- `N` 是抽樣 state 數；
- `C` 是每個 state 的候選技能數；
- `K` 是每個候選固定 rollout 數；
- `H` 是最長模擬步數；

計算量是受預算控制的 `O(N * C * K * H)`，不是 `O(branching^H)`。訓練可以離線花數分鐘或更久；實戰只載入蒸餾後 policy。

Approximate policy iteration 與 action-value function approximation 是大型 state space 的合理研究基礎。[Least-Squares Policy Iteration](https://www.jmlr.org/papers/volume4/lagoudakis03a/lagoudakis03a.pdf)

### 8.5 配對模擬與 rare-event 覆蓋

候選技能比較應使用相同的預生成亂數序列（common random numbers），降低不同球色運氣造成的比較噪音。

不能只依自然頻率抽樣：

- 刻意加入連續 Normal；
- Rapid／Hasty 連敗；
- 很晚才出 Pliant；
- 關鍵 Good 出現在 buff 不合時；
- Robust 強制 Sturdy；
- CP、耐久與 progress 位於邊界；
- 玩家誤按後 resync；
- Material Miracle 即將到期。

可用 stratified／importance-weighted evaluation，確保罕見災難與罕見高分尾端都被看見。

### 8.6 Runtime 必須是直接推論

```ts
interface Recommendation {
  action: CraftActionId;
  alternatives: Array<{
    action: CraftActionId;
    tradeoff: string;
  }>;
  phase: string;
  reasons: string[];
  metrics: {
    completionProbability?: number;
    silverProbability?: number;
    goldProbability?: number;
    expectedScore?: number;
    catastrophicFailureProbability?: number;
    expectedRemainingSteps?: number;
  };
  confidence: RecommendationConfidence;
}

function recommend(
  mission: MissionState,
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  riskProfile: RiskProfile
): Recommendation;
```

Runtime 可以做合法 action mask、固定模板檢查、少量 immediate outcome expectation 與一次 compact model inference；不可臨時展開完整 future tree。

### 8.7 Teamcraft 教學可作為 `guide-policy-v1`

參考原文：[FFXIV Teamcraft Expert Crafting Guide](https://guides.ffxivteamcraft.com/guide/expert-crafting-guide)（原文標示最後更新：2026-05-10）。

這份教學不只是技巧集合。它已經具備一個人工撰寫、階層式、反應式 policy 的主要結構：

| 教學內容 | 演算法角色 | POC 用途 |
|---|---|---|
| 開場推進展、中段累積內靜、品質收尾 | hierarchical policy | phase classifier |
| 各 condition 速查表 | partial decision table | candidate action gate |
| 避免失敗、保留完成資源 | lexicographic objective | hard safety constraints |
| 固定 CP 的品質／進展收尾片段 | temporally extended option | finisher certificate template |
| 耐久、CP、Inner Quiet 與 buff 剩餘步數 | derived state features | phase／risk predicates |
| Rapid 連敗後補救 | recovery policy | recovery phase |
| 每一步的判斷清單 | reason codes | explanation 與教學 UI |

在 MDP／policy 語言中，可以把它視為：

```text
pi_guide(
  phase,
  condition,
  buffs,
  resourcePressure,
  progressGap,
  innerQuiet
) -> ranked action candidates
```

它不是完整 policy：教學常同時提供兩三個合理選項，精確數值計算、規則衝突與風險取捨仍由玩家完成。因此新 repo 應把它定位成可版本化的 `guide-policy-v1`／`pi_0`，而不是 mechanics oracle 或已證明最優的答案。

#### 不要翻成巨大 `if／else`

同一個 condition 可能同時滿足多條規則。例如 Pliant 適合半價 Manipulation，但 Muscle Memory 可能即將消失；Good 也可能在 Precise Touch、Tricks of the Trade、Intensive Synthesis 或品質收尾之間競爭。規則不應命中第一條後直接回傳唯一 action，而應產生不同種類的 decision signal：

```ts
interface GuidePolicySignal {
  ruleId: string;
  kind: 'hard-veto' | 'required-reserve' | 'candidate' | 'utility-adjustment';
  action?: CraftActionId;
  value?: number;
  reasonCode: string;
  source: string;
  confidence: 'verified' | 'guide' | 'assumed';
}
```

建議 resolver 順序：

```text
exact state
  -> legal action mask
  -> terminal／catastrophic safety veto
  -> guide-policy-v1 signals
  -> small candidate set
  -> finisher feasibility／resource reserve
  -> utility ranking or compact policy
  -> action + alternatives + reasons
```

Phase 也應由目前 state 重新推導，不要存成只能單向前進的真值。Rapid 連敗、玩家偏離建議或新的 condition 都可能讓策略暫時進入 recovery／secure-progress，再返回品質階段。

#### 收尾片段是 option，不是不可中斷的巨集

教學中的 `Innovation -> Observe -> Advanced Touch -> Great Strides -> Byregot's Blessing` 等片段，很適合轉成帶有前置條件、CP／耐久成本、預期品質與進展保留需求的 finisher template。但 UI 每一步仍要重新推薦；若中途出現 Good、Pliant 或其他高價值 condition，不應因為先前選了模板就禁止重新評估。

#### 用它縮小離線改進範圍

固定預算 rollout 不必平均花在所有 reachable states。優先評估：

- 教學同時提出多個選項的 state；
- 多條 guide rules 衝突的 state；
- CP、耐久、progress 或 buff 位於切換邊界的 state；
- compact policy 與 `guide-policy-v1` 意見不同的 state；
- 真實玩家 trace 中進入 recovery 或偏離建議的 state。

`guide-policy-v1` 同時是 POC baseline。後續 approximate policy 只有在 held-out recipes、stats、condition profiles 與 adversarial scenarios 上穩定優於它，而且沒有破壞 safety invariants，才可升為預設。

#### 仍需補上的 Auxesia EX+ 層

Teamcraft 教學主要描述單件 expert craft 的人工策略，不能直接取代：

- WR.01 的前置品／主件與 Silver／Gold mission objective；
- WR.02 的 Material Miracle 45 秒 real-time controller；
- TR.01 的兩件 joint failure risk 與 Stellar Steady Hand 分配；
- recipe-specific condition set／rate；
- 依玩家屬性精算的 progress gap、品質增量與可靠收尾；
- Duty Action、mission supplies、實際倒數與跨 craft state。

因此它最適合擔任 craft policy 的人工起點；mission controller、exact mechanics、風險目標與實證改進仍由本架構補上。

## 9. Objective 與風險模式

單純最大化 expected quality 會鼓勵不適合任務的策略。建議保留 outcome vector，不過早壓成單一 scalar。

### 9.1 WR.01

優先順序：

1. 完成最終製作；
2. 達到使用者要求的 Silver／Gold 門檻；
3. 在不破壞完成與門檻機率下提高品質；
4. 減少過長操作與不必要的昂貴資源。

### 9.2 WR.02

優先順序：

1. 在 9 分鐘內完成任務；
2. 達到累積 2000 Gold 目標；
3. 合理安排兩次 Material Miracle；
4. 控制每一步思考／輸入時間；
5. 再比較 expected score。

### 9.3 TR.01

優先順序：

1. 兩件都不失敗；
2. 累積分數達到 2000 Gold；
3. 分配 Stellar Steady Hand；
4. 降低兩件的 joint catastrophic failure probability。

### 9.4 使用者風險選項

- `stable`：嚴格保護完成與門檻成功率。
- `balanced`：允許小幅完成率交換較高 Gold 機率。
- `aggressive`：接受更多 Rapid／Hasty variance，但仍保留明確的最低完成率或 failure cap。

不要把三種模式描述為簡單的好／壞／高手模式。它們是不同效用偏好。

## 10. UI／互動規格

### 10.1 一般步驟

畫面每步應清楚區分：

- **本步使用球色**：技能施放前的 condition；
- **本步技能**：系統建議與玩家實際使用；
- **本步成敗**：只有可能失敗時才強制詢問；
- **下一球色**：技能結算後的新 condition；
- **目前預測 state**：progress、quality、durability、CP、Inner Quiet、buffs。

避免只顯示「回報球色」，否則玩家很容易把本步球色與下一步球色混淆。

### 10.2 Resync

至少每數步提醒快速核對：

- progress；
- quality；
- durability；
- CP；
- Inner Quiet；
- 主要 buffs；
- Duty Action 剩餘次數。

任何欄位可直接修正，修正後建立 `stateResynced` event，而不是改寫歷史。

### 10.3 Material Miracle fast mode

Material Miracle 模式必須：

- 完全在 browser local 執行；
- 支援鍵盤單鍵回報 condition；
- 可能失敗的技能才要求 success／failure；
- condition 按鈕位置固定，避免每步重新排序；
- recommendation p95 目標低於 50ms；
- 顯示 45 秒倒數及時鐘同步狀態；
- 不因分析圖表、動畫或網路請求阻塞下一手；
- 可以關閉 explanation 展開，保留一行最重要理由。

這個模式的瓶頸很可能不是 solver，而是玩家在遊戲與工具之間切換的時間。必須以真實錄影或現場計時驗收。

### 10.4 教學價值

每次推薦至少顯示一個可理解理由，例如：

- 「Malleable 使本步作業量提高，且目前仍保留安全收尾。」
- 「Pliant 可省下 Immaculate Mend 的大量 CP；目前耐久已低於回復門檻。」
- 「Good 優先回收 CP，因目前 Gold finisher 的 CP reserve 不足。」
- 「這一步不選 Rapid，因連敗後會失去可靠完成路線。」

替代技能應描述 trade-off，而不是只列第二名分數。

## 11. 建議新 repo 架構

POC 可先使用 TypeScript，因 runtime 不做大型搜尋。不要在 simulator 尚未正確前過早建立 WASM 雙實作。

```text
apps/
  web/
    src/components/
    src/session/
    src/views/

packages/
  domain/
    src/actions.ts
    src/conditions.ts
    src/formulas.ts
    src/state.ts
    src/transition.ts
    src/invariants.ts

  data/
    src/recipes/auxesia-wr01.ts
    src/recipes/auxesia-wr02.ts
    src/recipes/auxesia-tr01.ts
    src/conditionProfiles.ts
    src/sourceMetadata.ts

  solver/
    src/phasePolicy.ts
    src/candidateGate.ts
    src/finisherCertificates.ts
    src/actionScorer.ts
    src/recommend.ts
    src/riskObjectives.ts

  simulator/
    src/episode.ts
    src/randomStreams.ts
    src/evaluatePolicy.ts
    src/distributions.ts

  protocol/
    src/sessionEvents.ts
    src/debugExport.ts
    src/modelVersions.ts

tools/
  train-policy/
  evaluate-policy/
  import-player-trace/

tests/
  golden-traces/
  fixtures/
  statistical/
```

若離線 episode throughput 後來不足，再把 batch transition／rollout engine 移到 Rust 或單一 WASM core。TypeScript engine 繼續當 oracle。不要同時手寫兩份 mechanics 後只驗證 summary。

## 12. 從 `frozen_rabbit_tome` 必須帶走的經驗

### 12.1 Solve 與 materialization 分開

現有大地研究曾出現 core 約兩秒完成，但 wrapper 因反覆展開 policy state 而長時間不回來；提高 memo capacity 只增加記憶體，不會修好 materialization。

參考：[`collectable-solver-research-history.md`](https://github.com/emu-rabbit/frozen_rabbit_tome/blob/07a8680/.agents/roadmaps/collectable-solver-research-history.md)

新專案應分別量測：

- mechanics transition throughput；
- offline policy training；
- runtime recommendation；
- UI render／input latency；
- debug／distribution materialization。

### 12.2 玩家互動需要可區分的問題

現有收藏品 guided interaction 已會分別詢問成功、proc、收藏價值與耐久，而不是只要求玩家選一個模糊分支。

參考：[`collectablePolicyInteraction.ts`](https://github.com/emu-rabbit/frozen_rabbit_tome/blob/07a8680/src/utils/collectablePolicyInteraction.ts)

### 12.3 Policy graph 與顯示樹不是同一件事

現有收藏品已有 `visited`／`nodeLimit` 防止 policy materialization 無限制展開。

參考：[`collectableWasmPolicy.ts`](https://github.com/emu-rabbit/frozen_rabbit_tome/blob/07a8680/src/utils/collectableWasmPolicy.ts)

巧匠專案更進一步：正式 runtime 根本不 materialize 全樹，只保存 session path。

### 12.4 必須有 scenario-aware model version

至少分開：

```ts
interface ModelVersions {
  mechanics: string;
  auxesiaWr01Policy: string;
  auxesiaWr02Policy: string;
  auxesiaTr01Policy: string;
  conditionProfiles: string;
  sessionCodec: string;
}
```

只要同一輸入在新版本下可能得到不同 transition、推薦、分布或信心，就 bump 對應版本。每份分享／debug export 都帶完整版本。

## 13. 驗證策略

### 13.1 Mechanics unit tests

每個 action 至少涵蓋：

- legal／illegal；
- 成功與失敗；
- 各 relevant condition；
- CP、durability 與數值取整；
- buff apply／tick／expire；
- one-use resource；
- terminal progress／durability 邊界。

### 13.2 Invariants

- CP 不得小於 0 或超過 max CP；
- durability 不得超過 recipe max；
- Inner Quiet 必須在合法範圍；
- illegal action 不得產生 transition；
- terminal state 不得再推薦一般 action；
- probability sum 在允許誤差內為 1；
- forced condition transition 不受一般 sampling rate 影響；
- no-step action 的 step／buff tick 語意符合實測。

### 13.3 Golden player traces

最重要的 oracle 是玩家在遊戲中的逐步紀錄：

```json
{
  "recipeId": 0,
  "crafter": {},
  "initialState": {},
  "events": [
    {
      "action": "rapidSynthesis",
      "previousCondition": "centered",
      "success": true,
      "nextCondition": "normal",
      "observed": {
        "progress": 0,
        "quality": 0,
        "durability": 0,
        "cp": 0
      }
    }
  ]
}
```

實作時不要先填假數字；由 trace importer 或手動 fixture 建立。

### 13.4 小型 exhaustive oracle 的界線

可以在極小、人工縮減的 state space 使用 exhaustive checker 驗證 transition 與 policy comparison，但它只能是測試 oracle：

- 不進 production；
- 不用真實 EX+ 完整 state space；
- 不以它的成功作為正式求解器可運行證據。

### 13.5 統計 policy evaluation

至少分開：

- training recipes／stats；
- held-out stats；
- held-out condition profiles；
- adversarial scenario suite；
- player mistake／resync states。

輸出：

- completion rate 與 confidence interval；
- Silver／Gold rate 與 confidence interval；
- expected／median／lower-tail score；
- catastrophic failure rate；
- steps 與實際估計時間；
- Duty Action 使用分布；
- out-of-distribution fallback rate。

只有在 holdout 上穩定勝過 base phase policy，才能把新 policy 升成預設。

## 14. POC 實作階段與驗收門檻

### Phase 0：資料與 simulator

交付：

- Auxesia WR.01 canonical mission／recipe 資料；
- Lv.100 action model；
- condition state machine；
- deterministic replay；
- debug export；
- 至少數條真實 golden traces。

門檻：

- 所有 golden trace 每步數值一致；
- 任何 mismatch 都能定位到 action、rounding 或 buff timing；
- 尚未驗證的 condition rate 明確標示 assumption。

### Phase 1：WR.01 rule-policy assistant

交付：

- 相位 policy；
- 可版本化且可追溯來源的 `guide-policy-v1` ruleset；
- candidate gate；
- 安全收尾模板；
- 完整狀態回報 UI；
- undo／edit／resync；
- recommendation explanation。

門檻：

- 不推薦 illegal action；
- p95 recommendation latency 小於 50ms；
- OOD state 有明確 fallback；
- 玩家可完整走完實際 WR.01；
- 研究者能從 event log 重現整場。

### Phase 2：WR.01 approximate policy improvement

交付：

- reachable state sampler；
- paired rollout evaluator；
- compact policy artifact；
- `guide-policy-v1` disagreement／boundary state corpus；
- holdout／adversarial benchmark；
- stable／balanced／aggressive 三種 objective。

門檻：

- holdout Gold／completion 指標有統計支持的提升，或至少在一者提升時另一者不超過預設容忍退步；
- safety invariants 零違反；
- policy artifact 可版本化、可回退；
- inference 不依賴 server。

### Phase 3：WR.02 Material Miracle

交付：

- 9 分鐘 mission controller；
- 兩份材料與累積分數；
- Material Miracle 兩次使用與 45 秒時鐘；
- fast input mode；
- step duration／UI overhead 模型。

門檻：

- 實機切換與輸入不吞掉 Material Miracle 的主要價值；
- recommendation 在倒數期間保持本機即時；
- 時鐘 drift 可見且可重新同步；
- 未知 Miracle condition rate 不被包裝成已知精確值。

### Phase 4：TR.01 mission risk

交付：

- 兩件不得失敗的 mission objective；
- Stellar Steady Hand 分配；
- joint completion／Gold probability；
- 第一件結果影響第二件風險策略。

## 15. 尚待玩家實證的問題

以下問題單靠公開資料不應擅自推定：

1. Auxesia WR.01 主件各自然球色的實際發生率。
2. WR.01 前置 recipe 的 `19600 required for synthesis` 在遊戲中的精確操作與失敗條件。
3. 最終品質／collectability 如何映射為任務的 980／1080 分數。
4. Cosmic Tool 的 Good 1.75 倍效果是否適用所有目標配方，以及 UI 要如何辨識玩家是否裝備該工具。
5. Material Miracle 啟動瞬間是否立刻重抽目前 condition，還是從下一 step 生效。
6. Material Miracle 是否跨 craft 持續、進出製作視窗時倒數是否照常流逝。
7. 45 秒倒數以 client／server 哪個時間點為準，動畫與網路延遲是否影響可用步數。
8. Stellar Steady Hand 的三步是否會被 Observe、no-step specialist action 或失敗 action 消耗。
9. Duty Action 使用是否會增加 crafting step、影響 combo 或 tick buffs。
10. Auxesia TR.01 的「不得失敗一次」指 craft terminal failure，還是任何 action failure 也會違反條件。
11. Mission supply、Duty Action 次數與 score 在取消／失敗／重開 craft 後的精確行為。
12. Specialist／Delineation 在 Cosmic mission 中的實際可用性與玩家接受成本。

這些項目應建立 `research/questions.md` 與 `golden-traces/`，每個答案附 patch、配方、截圖或 replay，不要只寫成聊天結論。

## 16. 首批建議實測資料

新 repo 開始後，優先請玩家提供：

1. WR.01 主件的 recipe／mission 畫面與 Potential Conditions List。
2. 玩家實際 craftsmanship、control、CP、專家、食物、藥水與工具。
3. 一場成功 WR.01 的完整逐步紀錄。
4. 一場失敗或進入 recovery 的完整逐步紀錄。
5. Rapid／Hasty 在 Centered 與非 Centered 下各數次的前後數值。
6. Robust 出現後下一步 Sturdy 的紀錄。
7. Primed 對 Manipulation、Innovation、Veneration 等 duration 的紀錄。
8. WR.02 Material Miracle 啟動與結束前後的錄影／時間戳。
9. TR.01 Stellar Steady Hand 搭配 Rapid／Hasty 的紀錄。

若玩家不方便逐格手記，可以用螢幕錄影，事後人工轉錄成 event log。

## 17. 風險清單

| 風險 | 影響 | 緩解 |
|---|---|---|
| mechanics／rounding 錯誤 | state 漂移，後續推薦全部失真 | golden trace、resync、版本化 |
| Auxesia condition rate 未知 | 成功率與等待價值失真 | profile 化、敏感度分析、玩家實測 |
| 完整 policy materialization | 記憶體／時間爆炸 | runtime 只查 compact policy，保存 session path |
| approximate policy OOD | 看似合理但在陌生狀態犯錯 | coverage detector、rule fallback |
| scalar reward hack | 犧牲完成率換虛高品質 | outcome vector、硬安全約束、risk profile |
| Material Miracle UI 太慢 | 工具降低而非提升成功率 | fast mode、本機推論、鍵盤、真實計時 |
| 玩家回報錯誤 | state mismatch | event edit、undo、定期 resync |
| patch／recipe drift | 舊模型給錯建議 | patch-aware data、model versions、來源時間 |
| 黑箱難以學習 | 玩家只能照抄 | reasons、alternatives、trade-off、replay |

## 18. 不在 POC 範圍

- 讀取遊戲記憶體或封包；
- 自動按鍵、機器人或遊戲內 automation；
- 宣稱全域最佳、唯一正解或保證成功；
- 一開始支援所有歷代 expert recipe；
- 一開始支援 Auxesia Master Mission；
- 伺服器依賴的即時求解；
- 完整樹匯出與所有未走分支視覺化；
- 在 mechanics 未驗證前同時維護 TS／WASM 兩份核心。

產品應保持 advisory：玩家自行選擇是否採用推薦，並能查看與修正目前狀態。

## 19. 新 repo 的最先五個工作項目

1. 建立 `RecipeProfile`、`CrafterProfile`、`CraftState`、`MissionState` 與 `SessionEvent`。
2. 只完成 WR.01 主件所需的 exact transition engine 與 golden trace replay。
3. 建立可手動操作的完整狀態追蹤 UI，不先做 solver。
4. 實作可解釋的 WR.01 phase policy＋安全收尾模板，完成第一場實機 POC。
5. 建立固定預算的 offline policy evaluator，再決定 action scorer／distillation 技術；不要反過來先選神經網路。

## 20. 參考資料

### 官方

- [FFXIV Lv.100 Disciplines of the Hand actions](https://na.finalfantasyxiv.com/crafting_gathering_guide/culinarian/)
- [Patch 7.41 Notes：Robust](https://na.finalfantasyxiv.com/lodestone/topics/detail/0de7befbbcefe67d1af77dcbe1bae937b916b67e/)
- [Patch 7.51 Notes：Auxesia／Tool Mastery](https://na.finalfantasyxiv.com/lodestone/topics/detail/c46881a31a2c90d0965493c921b434eca09113f8)
- [Patch 7.51 known issue：Auxesia expert conditions](https://na.finalfantasyxiv.com/lodestone/news/detail/1e229f18b31a9ac87e7c5ea5a14f96f6dad408b6)
- [Cosmic Exploration official page](https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/)

### 開源／社群 mechanics 與資料

- [FFXIV Teamcraft Expert Crafting Guide](https://guides.ffxivteamcraft.com/guide/expert-crafting-guide)
- [Teamcraft simulator](https://github.com/ffxiv-teamcraft/simulator)
- [Teamcraft StepState](https://github.com/ffxiv-teamcraft/simulator/blob/master/src/model/step-state.ts)
- [Thal's Tools Expert guide](https://thiria.com/expert/guide/)
- [Auxesia mission overview](https://www.icy-veins.com/ffxiv/auxesia)
- [Expert crafting overview](https://www.icy-veins.com/ffxiv/expert-crafting)
- [Auxesia mission family data](https://ffxiv.consolegameswiki.com/wiki/Stellar_Missions/Auxesia/Tips)
- [Community expert condition probability study](https://www.reddit.com/r/ffxiv/comments/1sfzcwn/the_precise_odds_of_expert_recipe_conditions/)
- [Raphael deterministic macro solver](https://github.com/KonaeAkira/raphael-rs)

### 演算法

- [Least-Squares Policy Iteration](https://www.jmlr.org/papers/volume4/lagoudakis03a/lagoudakis03a.pdf)
- [Rollout Algorithms and Approximate Dynamic Programming](https://arxiv.org/abs/2212.07998)

### 授權與引用邊界

- Teamcraft simulator 為 MIT license；若新 repo 複製或修改其程式碼，必須保留授權與 copyright notice。
- Raphael 為 Apache-2.0 license；可研究其 simulator、Pareto pruning 與測試手法，但它面向 deterministic macro，不能把其求解正確性直接外推到 stochastic expert policy。
- Thal's Tools 與攻略站在本文件中只作為行為、UX 與資料的交叉參考；除非另行確認其 source 與 license，不應複製實作。
- FFXIV 名稱、圖示與遊戲資料仍受 Square Enix 權利與素材使用規範約束；POC 應先用文字／自製圖示，正式公開前再完成 legal／attribution checklist。

## 21. 最終定位

這個專案最有價值的成果，不是證明它比每一位高手都聰明，而是把高難度製作中的幾種認知負擔可靠地外部化：

- 記住完整 state；
- 正確計算剩餘資源；
- 評估現在是否仍保有完成路線；
- 在球色與成敗發生後快速重算；
- 清楚說明為什麼此刻推薦這一招；
- 讓玩家事後重播並修正自己的判斷。

只要 mechanics 正確、runtime 立即、失敗與不確定性誠實可見，即使 policy 永遠不可能保證 100% 或全域最佳，它仍然能實質改善宇宙探索 EX+ 的製作體驗。
