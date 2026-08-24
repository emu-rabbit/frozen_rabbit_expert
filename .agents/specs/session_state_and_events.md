# Craft／Mission State 與 Session Event Contract

## 目的

本規格定義 POC 的概念型別與事件流程。正式實作時可調整 field naming，但不得破壞 Craft／Mission 分離、完整觀測、event replay、resync 與 versioned export 的核心 contract。

## Profiles

```ts
interface RecipeProfile {
  recipeId: number;
  recipeFamilyId: string;
  missionFamily: string;
  job: CraftingJob;
  recipeLevel: number;
  progressRequired: number;
  qualityMax: number;
  durabilityMax: number;
  requiredCraftsmanship?: number;
  availableConditions: readonly MaterialCondition[];
  qualityOutcome: 'required-quality' | 'collectability' | 'hq-chance';
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

食物／藥水 UI input 在進 mechanics 前正規化為實際 stats；原始選項仍保存，方便重現與檢查 item／HQ identity。

## CraftState

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

這是起始模型，不代表每個 field 的 timing 已驗證。實作前逐項對照 domain open questions、official tooltip 與 golden trace。

## MissionState

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

wall-clock timestamps 使用 injected clock，保存絕對時間與必要的 sync metadata。不要只保存 UI 顯示的 remaining seconds。

## Session events

```ts
type SessionEvent =
  | { type: 'missionStarted'; at: number }
  | { type: 'craftStarted'; recipeId: number; at: number }
  | {
      type: 'dutyActionActivated';
      action: 'materialMiracle' | 'stellarSteadyHand';
      at: number;
    }
  | {
      type: 'craftActionUsed';
      action: CraftActionId;
      previousCondition: MaterialCondition;
      at: number;
    }
  | {
      type: 'craftActionResolved';
      success: boolean;
      nextCondition: MaterialCondition;
      observed?: ObservedCraftSnapshot;
      at: number;
    }
  | {
      type: 'stateResynced';
      patch: Partial<CraftState>;
      reason: string;
      at: number;
    }
  | {
      type: 'craftEnded';
      result: 'completed' | 'failed';
      score: number;
      at: number;
    };
```

正式 codec 應加入 schema version、event ID／ordering 與 validation。若允許 edit previous event，使用 immutable replacement／superseded marker 或重建 event list；不可讓同一 export 的 event meaning 依 UI state 改變。

## Mechanics API

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
  state: CraftState,
): CraftActionId[];

function enumerateActionOutcomes(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
  conditionProfile: ConditionProfile,
): TransitionOutcome[];

function applyObservedOutcome(
  recipe: RecipeProfile,
  crafter: CrafterProfile,
  state: CraftState,
  action: CraftActionId,
  observed: {
    success: boolean;
    nextCondition: MaterialCondition;
  },
): CraftState;
```

`enumerateActionOutcomes` 用於 simulation／training；實戰使用 `applyObservedOutcome`。兩者必須共享 transition semantics，不維護兩套公式。

## Event reducer rules

- 新 craft 的最小開場事件序列是 `craftStarted`、`conditionSelected(normal)`；FFXIV 第一手固定 Normal，所以 UI 不得詢問開場球色。讀取只有 `craftStarted` 的舊 untouched session 時亦明確補成這個序列。
- `craftActionUsed` 必須對應當時 legal action；玩家輸入非法或 state mismatch 時先要求 resync，不安靜套用。
- `craftActionResolved` 與前一個 unresolved action 配對；不允許跳過 required success/failure。
- next condition 是結算後 condition；forced transition 優先於 generic profile sampling。
- 若 resolved outcome 已進入 completed／failed terminal，遊戲不會產生 next condition，session UI 不得要求玩家回報球色；現行 v0.10 codec 為維持 replay 欄位相容，resolved event 以本步 condition 作 placeholder，不代表玩家觀測到下一球。
- observed snapshot 若和 predicted state 不同，保留 mismatch，等待明確 resync／trace review。
- terminal craft 只接受 craft end／session control events，不再產生一般 recommendation。
- replay 在相同 model versions、profiles 與 event list 下 deterministic。

## Debug／share export

```ts
interface ExpertSessionExport {
  manifest: {
    schema: string;
    scenarioId: string;
    scenario: RecipeProfile['missionFamily'];
    createdAt: string;
    modelVersions: ModelVersions;
  };
  recipe: RecipeProfile;
  objective: CraftObjective;
  crafter: CrafterProfile;
  riskPreference: 'stable' | 'balanced' | 'aggressive';
  support: SessionSupportSnapshot;
  initialState: CraftState;
  events: SessionEvent[];
  notes: string[];
}
```

目前 export session codec 為 `expert-session-v0.10.0`，保存 `scenarioId`、完整 recipe／objective、實際裝備、risk preference 與當次 support／coverage snapshot；manifest 另保存 catalog、mechanics、planner 與 codec versions。web app 不會從 browser storage 恢復進行中的 session。

- 完整 export 用於重現、bug report、policy evaluation 與 golden trace intake。
- 進行中的 event path 只保存在記憶體；需要保留時由使用者主動下載完整 export。
- export 前顯示內容並提供 anonymization；不自動上傳。
- 匯入時驗證 schema、canonical IDs、model versions、range 與 event order，不直接信任 JSON。
