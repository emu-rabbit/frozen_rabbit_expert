# Solver Policy、Objective 與安全規範

## 核心邊界

正式 runtime 是**本機、固定預算、可 fallback 的 recommendation planning／inference**。它不 materialize 完整技能／condition policy tree、不以 memo capacity 硬撐完整 DP，也不執行無 deadline 的 primitive-action tree search。一般強決策以 p95 `< 1s` 為體驗目標；目前 web 以 `3s` 為硬上限，逾時終止 worker 並回到快速 policy。3 秒不得被當成可長期占滿的日常預算。

Mechanics engine 應精確；policy 是可版本化、可評估、可 fallback 的近似推薦。

## Recommendation pipeline

```text
exact current state
  -> legal action mask
  -> terminal / catastrophic hard veto
  -> derive phase
  -> guide-policy signals
  -> route options / small candidate set
  -> finisher feasibility / required reserve
  -> fixed-budget paired planning or policy-value inference
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

Safety veto 只處理可證明的災難或結構性循環，不把高變異策略永久封死。2026-08-11 玩家 trace 顯示改革剩一回合可合理續上，也提出 Pliant 時即使 buff 尚餘多回合仍可能值得刷新；因此可恢復的 active buff refresh 不再 hard-veto，由 full-route outcome 判斷 opportunity cost。第一次 Observe 也保持開放；只有 `comboFrom=observe` 的再次 Observe 才套 finishing budget gate，要求 Inner Quiet 已完成、品質仍需高價值爆發、作業已有保守收尾、且 Observe 後 CP／耐久仍支付得起品質與作業 finish。active Final Appraisal 的再次施放是零工次、同狀態 deterministic loop，另作 hard veto。這些規則允許有預算的球色搜尋，不代表 Observe 會提高 Good 機率或應成為常規推薦。

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

### 配方完成條件與品質目標必須分開

`RecipeProfile.requiredQuality` 只表示 mechanics 的最低完成條件；solver 另接收 recipe／mission objective 的品質或分數目標。不得用 `quality / requiredQuality` 作通用 feature，也不得把 `quality >= requiredQuality` 直接等同「停止做品質」。

- 宇宙鈦鐵錠：最低品質與目標品質都是 18900；品質未達時完成作業就是失敗。
- 宇宙鈦鐵釘：最低品質為 0、配方品質上限為 27400；作業達 10000 即完成，品質未滿不是 craft failure。玩家遊戲內任務表另確認收藏價值 2710 是 1000 分上端，因此 policy target 是 27100，不是 mechanics 上限。`cosmic-titanium-nails-guide-integrated-v1.3.0` 採 lexicographic objective：先排除不能完成的路線，再增加高分尾端質量；exact 食藥 profile 使用獨立 high-tail route。這些 nails config 不套用錠。
- nail score 表為 1644–1917→100、1918–2465→300、2466–2710→700–1000；錠固定 80，Silver／Gold 分別 980／1080，所以一錠一釘需要釘至少 900／1000。700–1000 區間內精確映射仍待遊戲結算 evidence；未驗證前分開報 high tier、95%／97%／97.5% 任務目標與 27100，不自行假設線性，也不稱 Silver rate。
- 宇宙探索用的硬化木板：作業 4700 與必要品質 14900 都達成才算 valid completion；滿品質 count 不是可和腳手架成品共用的軟效用。
- 高空作業用的腳手架：作業 9300 完成是 hard gate，之後才比較 0–22500 品質與 HQ utility。Patch 7.4 Lodestone 玩家研究並以 Teamcraft cross-check 的曲線目前只作 provisional utility；沒有本任務遊戲內 HQ 百分比／結算 evidence 前，不得把 estimate 寫成真實 HQ rate。

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

### Current scenario runtime policies

`cosmic-titanium-guide-integrated-v1.2.0` 是目前網站使用的宇宙鈦鐵錠 policy。它不是單步分類器：先按目前狀態推導路線階段，以實際 action history 重建計數，維護 Manipulation／Waste Not 耐久循環，使用有限節點的作業與品質收尾證明。v1.2.0 另允許一手 deterministic progress prefix，但只有「前綴→滿品質 burst→保證作業收尾」完整 route 可證明時才使用；frozen 三裝備合計 valid completion `986／3072→990／3072`，paired completion `+4／-0`，0 safety regression、0 額外 specialist invocation。效果很小，不得稱大幅突破。

目前固定三個玩家面板：無 buff `5408／5140／630`、食藥 `5408／5237／749`、食藥＋專家 `5428／5257／764`，皆宇宙工具 ON；最後一組已含專家證。玩家 95 球 empirical marginal（36／14／13／13／10／9）只是 IID marginal replay，不是 exact transition model 或真實成功率。development 用於選方向；只有明示互斥 frozen corpus 可作 promotion evidence。

網站在 worker 執行 scenario 對應 policy；solver 內部有固定 node cap 與 800ms bounded-risk guard，web 再以 `3000ms` watchdog 終止並切回 `cosmic-craft-objective-lookahead-fallback-v1.5.0`。`<50ms` 只屬快速 fallback benchmark，不能用來觸發 watchdog；worker start／runtime error 或 null result 可以在 3000ms 前立即 fallback，UI 需顯示 elapsed 與 `立即失敗`，不可冒充 timeout。本輪 evaluator 的錠 empirical p95 約 `3.6ms`，釘完整 512 場 p95 `33.868ms`、p99 `65.699ms`、max `225.472ms`。另有獨立快速 fallback benchmark連跑兩次 p95 `50.260ms`／`50.361ms`，略高於 `<50ms` gate，必須保留為未通過結果。

釘 v1.3.0 保留 27100 任務目標與 completion-first safety，並把 exact 食藥 profile 路由至 progress floor `.75`／Great Strides `.70`；其他／OOD profile 使用 recipe default。observed 128 場 high `9→12`、27100 `3→6`；完整 development high `37→45`、27100 `24→27`，但 p10 `11700→11274`、minimum `5214→2794`。這是玩家要求的高分尾 trade-off，不是全面 dominance、真實 100% 或 Silver rate；後續優先以 condition-aware Byregot reserve 修低尾，不再磨全域 threshold。

**【高難＋】製作高空作業所需的腳手架** 保留兩個 recipe-specific policy。木板 v1.1.0 以必要品質 14900 作硬門檻，joint certificate frozen 三裝備 `383→387`、`666→670`、`687→690`，paired completion loss 0。成品 v1.3.0 先確保作業 9300 完成，再依 provisional 非線性 HQ utility 比較；exact 食藥 profile 保留 CP100／projected quality 75% cashout，另在至少 30 個 prior action uses 的低 CP、IQ0 Good，只有 `Precise Touch` 後仍有 deterministic finish 且整條 route 不超過 36 個實際 action uses 時才延伸品質，之後依 actual history 重建 commitment 並只走 action budget 內的 deterministic progress certificate；resync 造成 history／step 不一致時停用延伸。36 是窄 quality-extension bound，不是真正 5:30 mission clock；no-step action 也算一次玩家操作。玩家 export 提供 31 手前的晚 Good 觀測邊界；current mechanics replay 推導可由立即完成改為 `Precise Touch + Basic Synthesis×3`、品質 `18694→19547`，budget 壓到 33 時仍立即完成。後段另對 exact profile 修正 Malleable 先消耗再開 Veneration。最終 assumed development 192 對 exact 食藥 profile 是 completion `192→192`、0 safety violation、raw quality paired `2` 勝／`1` 負／`189` 和、平均品質 `+8.53`、平均 actions `-0.005`；跨配方 48 組 action-time sensitivity 在 5 秒／手＋10 秒 overhead 為 deadline `+1／-0`，4／4.5 秒無差異，但 interval 皆含 0，不能稱穩定改善或實戰成功率。曾測試在至少 36 手、品質至少 75% 時全域強制一手收尾，但 assumed development 只減少約 `0.005` 手、平均品質反而下降約 `12.8`，因此拒絕進 runtime；這也是不能把時間壓力改成全域硬步數規則的負面證據。已採用的新規則目前只有玩家 regression 與 assumed development evidence，舊 frozen-v2 已看過、不能重稱新 promotion evidence。本次木板與成品 runtime 停用 specialist actions；使用者已解除舊研究禁令，後續可以完整 specialist arm／成本比較，但未驗證結果不得因面板是專家就自動上線。

目前 paired development benchmark 使用玩家三組 exact profiles：`5408／5140／630` 無 buff、`5408／5237／749` 食物＋藥水、`5428／5257／764` 食藥＋專家，皆宇宙工具 ON；三個七球 profiles 仍是 assumption。舊 4-seed／舊 corpus screening 與發生 specialist leakage 的 Round 0 只保留歷史診斷。固定 risk-attempt cap 與固定 progress-floor 調整都曾使 completion／滿品質退步；不可把 cap 或 progress ratio 寫成跨裝備常數。

### 2026-08-12 current-runtime frozen regression scorecard

以下 scorecard 是 final checkout 對已查看過的 versioned frozen corpus 做可重現 regression，不是新的 promotion evidence 或遊戲內成功率。headline 對每個配方／裝備等權混合三個 assumed condition profiles、每 profile 256 seeds，故 `N=768`；high 是釘品質 `>=24660`（收藏價值 `>=2466`、已知 700–1000 分區），不能稱 Silver／900 分率；HQ 是完成品品質經 provisional community curve 單調轉換後的中位數，不是 Recipe 36208 遊戲內 oracle。

| Exact 裝備 | 錠 valid completion | 木板 valid completion | 釘 completion | 釘 high | 釘 `>=27100` | 腳手架 completion | 腳手架 median quality | provisional median HQ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 無 buff／宇宙工具 | 57／768（7.42%） | 376／768（48.96%） | 767／768（99.87%） | 6／768（0.78%） | 1／768（0.13%） | 768／768（100%） | 13920／22500 | 19% |
| 食物＋藥水／宇宙工具 | 248／768（32.29%） | 642／768（83.59%） | 768／768（100%） | 61／768（7.94%） | 33／768（4.30%） | 766／768（99.74%） | 19218／22500 | 81% |
| 食藥＋專家／宇宙工具 | 295／768（38.41%） | 672／768（87.50%） | 768／768（100%） | 117／768（15.23%） | 54／768（7.03%） | 768／768（100%） | 19398／22500 | 82% |

錠／釘另以玩家 95 球 empirical IID marginal 各跑 256 seeds 作補充邊界：錠 valid completion 為 `32／256`、`168／256`、`190／256`；釘 high 為 `1／256`、`27／256`、`69／256`，但後者只是把錠的 marginal transfer 到釘，不能當 nails transition probability。兩組 scorecard 全部 safety violation 為 0；reserved-final corpus 仍未開封。

無 projected-quality gate 的 CP100 cashout 已由 frozen v1 拒絕：三裝備 HQ point estimate 皆負且 interval 跨 0。通過的 v1.2.0 只路由 exact 食藥 profile；無 buff／專家 stats profile維持保守 baseline。HQ 曲線來自 Patch 7.4 Lodestone 玩家研究並以 Teamcraft cross-check，仍是 provisional community utility，不是 Recipe 36208 遊戲內 oracle。詳細完整矩陣與負面結果由 `expert-crafting-training-handoff-2026-08-11.md` 保存。

```text
pi_0 = versioned guide-policy-v1

repeat for a fixed small number of rounds:
  simulate pi_i and collect reachable states
  add boundary, recovery, OOD and player-mistake states
  compare gated candidates with paired fixed-count rollouts
  fit a route-aware policy/value model or option prior when planner data is strong enough
  evaluate on held-out stats, recipes and condition profiles
  reject if safety or holdout performance regresses
```

每個 rollout 只抽一條 future trajectory；計算量由 `N states * C candidates * K rollouts * H horizon` 控制，不建立 exponential tree。

`cosmic-titanium-rollout-teacher-v0.1.0` 的第一場玩家實戰已證明窄 scenario oracle 不足：greedy continuation 讓逐步 replan 浪費 Veneration、Good opportunity 與未結束的 Waste Not II／Manipulation。此版本 `RESEARCH_TEACHER_PROMOTED=false`，不得進入玩家 runtime。下一版需先把 reachable／boundary／mistake states 與完整 episode route commitment 批次化、建立 held-out evaluation，再蒸餾 compact artifact。

`packages/policy-lab` 是替代路徑：多個 continuation policies 先提出候選路線，在相同 condition／success streams 下完成 episode。舊 objective 只把 terminal failure 當失敗，並在零完成時偏好較短 episode，實際會獎勵更快卡死；目前 evaluator 已加入 `policy-null`／`no-legal-action`／`illegal-action`／`action-limit` taxonomy，只有成功路線才比較步數。compact scorer 的 training accuracy 不構成 promotion，必須另外通過未參與訓練的完整 episode corpus。

2026-08-11 後續依「有意義的訓練不因小樣本未進展即判死」擴到 512 states、每候選 3 profiles × 8 futures，並以 64 hidden-unit compact scorer、candidate-state DAgger、單一固定後續與一輪 artifact policy iteration 驗證。過程發現 simulator 曾讓 no-step Final Appraisal 消耗未來 condition／success RNG，造成不存在於遊戲的抽球優勢；修正後 Final Appraisal labels 由 55／512 降至 10／512。多後續與自我策略迭代仍無法完成 72 場；單一 video-informed continuation 的最佳 compact lower-tail balance 為 31.6%，低於 reference 的 52.0% 與 4／72。training accuracy 約 93% 仍不能轉成完整 episode，證據指向 action-only labels 遺失 continuation intent；下一步應研究 option／route learning，不再只堆同型單步 labels。

新的第一個 research baseline 是 `consistent-continuation-rollout-planner-v0.1.0`：每一步比較所有合法非災難 root actions，但所有候選都接回同一個明示 continuation，以完整 episode paired rollouts 直接做 one-step policy improvement；不再先蒸餾成 action-only class。修正 stall objective 後，single-continuation one-step improvement 與整場 fixed continuation 都未在 749 CP regression 勝過 6／72 reference，只保留作 negative controls。每步重選 `(continuationId, actionId)` 的 MPC 在兩組已看過 regression 分別得到 7／72 與 10／72，對照皆為 6／72，且零 safety violation、p95 約 160ms；但 development corpus 的首批 24 seeds/profile 是 6／72 對 6／72、paired 2 勝 2 敗，未重現完成率提升。worst-profile completion 仍為 0、raw unfinished quality 下降、continuations 尚不是真正 options，因此只是值得延續的 research signal，不得 promotion。

第一版 `video-informed-mainline-v1` route contract 已在 `routeOptionController.ts` 落地。主線 options 依序為 `progress-window`、`inner-quiet-build`、`quality-cycle`、`quality-burst`、`safe-finish`；`resource-recovery` 與 `bounded-condition-fishing` 是帶 `resumeOptionId` 的可返回 suboptions。`PlannerContext` 與 mechanics `CraftState` 分離，controller 保存可序列化 option memory、action budget、observed transition count 與 resume target；每個 episode 由 factory 建立隔離 memory。active option 仍可利用 Good／Pliant／Centered 等 condition interrupt，但只有 option completed、needs-recovery、infeasible 或明示 route boundary 才能換 option，不能用 Monte Carlo 微小分差每步換人格。目前每個 option 暫時只暴露 target policy 的一個 mainline candidate，尚未接 MPC、finisher certificate 或 runtime。

第一版 planner 比較 `(optionId, actionId)`，每個 option 只提出 1–3 個 mainline／condition-interrupt candidates。所有候選使用 common random numbers，先給同樣少量 futures，再以 successive halving 把約一秒預算集中到前幾名；rollout 內沿用同一 route controller 與獨立 memory copy。實際 action outcome 回報後才更新 route memory，再在同一 active option 內重規劃。只有建立可信的 option-level search visits 後，才訓練 completion／stall／resource quantiles 的 distributional value ensemble 與 option prior；不再以單一 argmax action label 當 teacher truth。

候選比較使用 common random numbers。除了自然 sampling，刻意涵蓋連續 Normal、RNG action 連敗、晚 Pliant、關鍵 Good timing、Robust→Sturdy、資源邊界、player mistake／resync 與 Miracle expiry。

### 裝備泛化與 OOD

policy artifact 的適用範圍必須包含 `CrafterProfile`，不能只綁 recipe。不同 craftsmanship／control 會改變離散取整後的 action gain，不同 max CP 會改變 combo、buff window、repair 與 finisher 的可行性，宇宙工具也會改變 Good 品質價值。

- train／validation／held-out 以完整裝備 profile 分組，禁止同一 profile 洩漏到不同 split；
- label 與 evaluation 覆蓋最低可行、常見、邊界與高配 profile，不只使用開發者當前面板；
- 報告 overall 之外的 per-profile、worst-profile 與 worst-decile completion／failure；平均改善不可抵銷某群玩家的 catastrophic regression；
- artifact 宣告 recipe、stat envelope、tool flag coverage 與 OOD rule；超出範圍時 fallback，不聲稱 universal；
- 若單一 conditional policy 無法穩定涵蓋離散 gain／CP boundary，允許使用多個 versioned stat-bucket artifacts，但必須有 deterministic router 與 boundary tests。

## Policy promotion gate

planner／policy artifact 只有在以下全部成立時可取代 guide baseline：

- held-out／adversarial metrics 有統計支持；
- completion／Gold 改善或 trade-off 在預先定義容忍內；
- safety invariants 零違反；
- OOD fallback 可見且有效；
- artifact 可版本化、重現、回退；
- runtime latency 達標且不依賴 server。
- 未見 `CrafterProfile` 的 held-out／boundary 評估不退化，且 artifact 對裝備範圍與 OOD 行為有明確 contract。

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
