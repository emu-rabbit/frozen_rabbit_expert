# Solver Policy、Objective 與安全規範

## 核心邊界

正式 runtime 是**直接、有限成本的 recommendation inference**。它不展開完整技能序列、不建立完整 success／condition policy tree、不以 memo capacity 硬撐完整 DP，也不在每一步執行大型 MCTS。

Mechanics engine 應精確；policy 是可版本化、可評估、可 fallback 的近似推薦。

## Recommendation pipeline

```text
exact current state
  -> legal action mask
  -> terminal / catastrophic hard veto
  -> derive phase
  -> guide-policy signals
  -> small candidate set
  -> finisher feasibility / required reserve
  -> risk objective ranking or compact policy
  -> action + alternatives + reasons + confidence
```

## Phase policy

預設 phase：

1. `opener`
2. `secure-progress`
3. `build-inner-quiet`
4. `maintain-resources`
5. `prepare-quality-burst`
6. `quality-finisher`
7. `complete-synthesis`
8. `recovery`

phase 是由 current state 推導的 feature，不是只能單向遞增的 stored truth。action failure、玩家偏離、資源惡化或新 condition 都可進入 recovery／secure-progress，再回到品質 phase。

## Guide policy signals

Teamcraft Expert Crafting Guide 可作 `guide-policy-v1`／`pi_0`，但不是 mechanics oracle 或已證明最優答案。規則不翻成一條命中即 return 的巨大 `if/else`。

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

同一 condition 可以產生互相競爭的 signals。例如 Good 可能同時支持 Tricks、Precise Touch、Intensive Synthesis 或品質收尾；resolver 必須比較 state、reserve 與 objective，而非固定回傳第一條。

## Candidate gate

每個 phase／condition 只保留少量有意義候選，降低評估與解釋成本。候選來源是可測、可版本化的 default，不是永久真理：

- Malleable：progress candidates。
- Centered：RNG actions 的成功率價值。
- Pliant：昂貴 recovery／buff actions。
- Primed：長效 buff candidates。
- Good：CP recovery、Precise／Intensive、finisher opportunity。
- Robust／Sturdy：durability-efficient actions。
- Normal：low-cost progress、resource maintenance、Observe、phase transition。

legal action mask 與 safety veto 永遠先於 candidate preference。

## Finisher certificates

維護固定大小、人工設計且已用 mechanics 驗證的 progress／quality finisher templates。它們是**可中斷 option**，不是巨集：每一步仍重新推薦，出現 Good／Pliant 等高價值 condition 時可改變路線。

certificate 至少描述：

- preconditions；
- CP／durability／buff／one-use resource requirements；
- guaranteed 或 probabilistic progress；
- expected／minimum quality effect；
- action count／time estimate；
- applicable recipe／stats／condition assumptions；
- mechanics version 與 tests。

每次候選評估至少檢查：

- 使用後是否仍有一組可行 progress finisher；
- CP、durability、buff 與 one-use resource reserve 是否足夠；
- 是否可能意外完成 progress 而失去品質機會；
- WR.01 是否已達 target、能否安全結束；
- WR.02 是否仍可在剩餘 real time 完成；
- TR.01 是否讓 joint failure risk 超過底線。

尚未有 proof 的區域只能顯示 viability estimate，不稱 guaranteed。

## Mission objectives

保留 outcome vector，不過早壓成單一 scalar。

### WR.01

1. 完成最終 craft。
2. 達到使用者要求的 Silver／Gold 門檻。
3. 不破壞前兩者下提高 quality／score。
4. 減少不必要步數與昂貴資源。

### WR.02

1. 在 mission deadline 前完成。
2. 達到累積 Gold target。
3. 合理分配兩次 Material Miracle。
4. 控制每步思考／輸入時間。
5. 再比較 expected score。

### TR.01

1. 兩件都不失敗。
2. 累積分數達到 Gold。
3. 分配 Stellar Steady Hand。
4. 降低 joint catastrophic failure。

## Risk profiles

- `stable`：嚴格保護 completion 與門檻 success。
- `balanced`：允許有限完成率交換較高 Gold opportunity。
- `aggressive`：接受較多 Rapid／Hasty variance，但仍有最低 completion／failure cap。

risk profile 是效用偏好；不可用新手／高手、好／壞描述。門檻與權重要保存版本，並用 scenario evaluation 解釋差異。

## Offline policy improvement

```text
pi_0 = versioned guide-policy-v1

repeat for a fixed small number of rounds:
  simulate pi_i and collect reachable states
  add boundary, recovery, OOD and player-mistake states
  compare gated candidates with paired fixed-count rollouts
  fit or distill a compact policy / action scorer
  evaluate on held-out stats, recipes and condition profiles
  reject if safety or holdout performance regresses
```

每個 rollout 只抽一條 future trajectory；計算量由 `N states * C candidates * K rollouts * H horizon` 控制，不建立 exponential tree。

候選比較使用 common random numbers。除了自然 sampling，刻意涵蓋連續 Normal、RNG action 連敗、晚 Pliant、關鍵 Good timing、Robust→Sturdy、資源邊界、player mistake／resync 與 Miracle expiry。

## Policy promotion gate

compact policy 只有在以下全部成立時可取代 guide baseline：

- held-out／adversarial metrics 有統計支持；
- completion／Gold 改善或 trade-off 在預先定義容忍內；
- safety invariants 零違反；
- OOD fallback 可見且有效；
- artifact 可版本化、重現、回退；
- runtime latency 達標且不依賴 server。

若改進沒有穩定勝出，保留 guide-policy-v1 是有效研究結論，不為了使用更複雜模型而升級。

## Recommendation contract

```ts
interface RecommendationConfidence {
  mechanicsVersion: string;
  conditionProfileConfidence: 'verified' | 'empirical' | 'assumed';
  policyCoverage: 'in-distribution' | 'near-boundary' | 'out-of-distribution';
  evaluationSampleSize?: number;
}

interface Recommendation {
  action: CraftActionId;
  alternatives: Array<{ action: CraftActionId; tradeoff: string }>;
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
```

metrics 可以缺省；沒有可靠 probability model 時，寧可不顯示精確數字，也不產生虛假精準度。
