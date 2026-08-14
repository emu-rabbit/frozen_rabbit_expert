# Frozen Rabbit Expert：求解器產品化、跨裝備泛化與 Rust 加速交接

`last_verified: 2026-08-14`

## 文件角色

本文件是 2026-08-14 使用者要求將 Frozen Rabbit Expert 從五個 exact-profile pilot 轉向產品化後的工作交接。它保存本輪已完成的 code audit、效能基準、已確認 blocker、建議研究順序、Rust 邊界，以及新視窗應如何接手。

它不是 mechanics 或 runtime 的 canonical spec。永久規則仍由 `AGENTS.md` 路由的 mission、technical architecture、solver safety、algorithm verification、data/evidence 與 roadmap owner 管理；數值與 code 行為需以目前 checkout 重新驗證。

## 使用者最新目標

1. 不再假設玩家使用三套已知裝備；求解器必須能面對未知但可支援的 `CrafterProfile`。
2. 第一階段擴充至更多宇宙探索高難度配方，之後再逐步擴大。
3. 現有成績只算可接受，仍需要結構性的 solver 改善，不應被既有架構或歷史 heuristic 限縮。
4. 離線 benchmark、training 與迭代時間已成為瓶頸；允許使用 Rust 等低階語言加速。
5. Rust 與 TypeScript 不得各自演化成兩份 mechanics truth；移回 TS／JS 或載入 artifact 後，必須以逐步 parity 證明效果一致。
6. 使用者會因成本要求隨時收尾；收到指示後應立即停止擴張、保存可重現 checkpoint。

## Checkout 與工作樹 checkpoint

開始本輪時：

- branch：`main`
- HEAD：`a0711b6 Docs: 登錄巨匠藥 v1.2.0 求解器版本`
- `main...origin/main`
- tracked worktree 原本乾淨。

本輪曾開始 objective-aware research planner 修改，但使用者要求換新視窗後，所有未完成的 solver／simulator source edits都已精準撤回。交接時不應存在 `packages/policy-lab` 或 `packages/simulator` 的半成品 diff。

目前刻意留下的候選檔案：

- `packages/data/src/productScenarioCatalog.ts`
- `packages/data/tests/productScenarioCatalog.test.ts`

它們建立 data-only 的五配方 recipe/objective catalog、唯一性／quality target validation、unknown lookup 回傳 `null`，但**尚未 export、尚未被 web／solver／protocol／scorecard 使用**。`conditionSetId` 目前只是候選 identity，還沒有對應的 canonical `ConditionSet` record。新 Agent 應先 review，再決定整合或移除；不可把檔案存在解讀成產品 registry 已完成。

本交接與 `AGENTS.md` 路由也是本輪新增文件變更。沒有 commit、push、deploy 或 runtime policy version bump。

## 已執行驗證

### 基準功能驗證

- `npm test`：35 files／211 tests 通過（建立候選 catalog 前的完整基準）。
- `npm run typecheck`：候選 catalog 存在後仍通過。
- `productScenarioCatalog.test.ts`：1 file／5 tests 通過。
- `node_modules` 已依目前 lockfile 安裝；`package-lock.json` 無 tracked diff。

完整 `npm test` 尚未在 handoff 文件加入後重跑；新視窗接手時應先重跑。

### 既有 runtime fallback benchmark

主 Agent 的單獨量測：

- 120 synthetic states；
- p50 `55.468ms`；
- p95 `79.724ms`；
- p99 `98.907ms`；
- 整個 Vitest case `6.64s`，因此撞到 harness 的 5 秒 timeout，即使 p95 小於 test 內的 100ms assertion。

另一條並行稽核量到 p50 `61.968ms`、p95 `123.516ms`、p99 `255.057ms`。兩次不是受控、隔離的 performance study，差異本身說明目前 benchmark 容易受同機負載影響。不得選較漂亮的一次宣稱 gate 通過；下一版需分開量測 warmup、單步 latency、批次 throughput、GC／CPU load 與 test harness timeout。

## 最重要的 code-level 結論

### 1. 目前沒有跨裝備 held-out

`tools/train-policy/index.ts` 使用同一個 `targetCrafter` 進行 reachable-state sampling、labeling、training 與 held-out evaluation。現有 held-out 只換 condition RNG，沒有 hold out 裝備。

`packages/policy-lab/src/types.ts` 的 state／label records 沒有 `crafterProfileId` 或 `groupId`，`ReachableStateOptions` 也只接受一套 crafter。直接擴成多裝備時，外觀相同的 `CraftState` 可能在不同裝備下被錯誤去重；同一裝備的 states 也可能洩漏到 train／validation。

`packages/policy-lab/src/compactScorer.ts` 將 artifact 綁定單一 exact `crafterProfile`，以 `JSON.stringify` 比對。這是目前正確的安全拒絕，不是泛化能力；`specialist` 缺省與 `false` 也可能產生不必要的不相等。

### 2. Feature schema 尚不能支援五配方

`packages/policy-lab/src/features.ts` 仍以 `recipe.requiredQuality` 作 denominator。釘、腳手架成品、巨匠藥的 `requiredQuality=0`，因此跨配方使用時會產生 `Infinity`／`NaN`。

同一 feature schema 只有六個 condition one-hot，沒有 `goodOmen` 與 `primed`，也沒有明確 objective mode／quality target／specialist access。它只移除了部分 raw-stat 表示 blocker，沒有完成產品化 feature contract。

下一版應由 `CraftObjective.qualityTarget` 驅動品質 ratio，並 bump feature／artifact version；不得只在 planner 內製造假的 `RecipeProfile.requiredQuality` 後繼續保存舊 artifact identity。

### 3. Planner 仍把 route target 與 mechanics completion 混在一起

`routeOptionController.ts`、`targetCrafterPolicy.ts`、`policyPopulation.ts`、`labelStates.ts` 與 `scenarioBeamPlanner.ts` 多處直接讀 `recipe.requiredQuality`。這使 research planner 基本上只對 required-quality ingot 成立。

正確方向是讓 `PlannerContext` 明示包含 `CraftObjective`：

```ts
interface PlannerContext {
  recipe: RecipeProfile
  objective: CraftObjective
  crafter: CrafterProfile
}
```

mechanics transition 永遠使用真實 recipe；route phase、feature、potential 與 evaluation 使用 objective target。若 legacy heuristic 需要 objective-aware read model，只能在 decision adapter 使用，不可把假的 required quality 傳入 mechanics transition。

### 4. 配方擴充仍有多份 registry drift

新增一個既有 mechanics family 的配方，目前約需修改 8–12 處：data exports、web scenarios、solver config/version、exact-profile router、protocol model versions、scorecard scenario/metrics、tests 與 icon asset。

高風險例子：

- `RecipeProfile.missionFamily`、`job` 與 `CraftQualityTier.id` 是封閉 union。
- `conditionProfileId` 沒有可解析 registry；simulator weighted profile 也缺 patch／family／sample metadata。
- `apps/web/src/scenarios.ts` 是第二份 catalog，`App.vue` 另有錠→釘流程假設。
- `packages/solver/src/guideIntegratedPolicy.ts` 是大型 recipe config owner；adaptive recipe 缺省 config/version 有落入 Nails 預設的風險。
- `packages/solver/src/playerProfilePolicy.ts` 再維護一份 scenario union 與 exact-profile branch。
- `tools/evaluate-solver-scorecard/index.ts` 又複製 scenario registry；未知 scenario 的 comparison tuple 會落入巨匠藥門檻，屬 silent correctness risk。
- mission 層尚無 canonical mission ID、recipe graph、份數、材料、deadline、Duty Action 或完整 `MissionState` controller。

### 5. Web 的 equipment coverage 不是可靠 OOD router

`apps/web/src/scenarios.ts` 目前以各軸 min/max bounding box 判定 `near-boundary`。這會把從未實測、甚至可能不存在的 craftsmanship／control／CP 組合標成已接近開發範圍。

更穩健的 runtime identity 是 recipe-specific mechanics signature：

```text
(floor(baseProgress), floor(baseQuality), maxCp, cosmicToolGoodBonus, specialist/access)
```

相同 signature 在該 recipe 的 transition gain 上是真正等價候選；不同 signature 只能依 population evidence 分成 in-distribution、boundary probe 或 OOD，不能靠矩形包圍盒推定。

## 建議的產品資料分層

不要建立一個包辦所有責任的巨大 scenario literal。建議分四層，再由 product binding 組合：

1. `RecipeMechanicsRecord`：canonical recipe/item/job IDs、patch、公式參數、mechanics family、condition set、completion semantics、source。
2. `ObjectiveProfile`：required quality／collectability utility／HQ utility、target、任意 tier IDs、utility model 與 evidence；未知內插保持 unknown。
3. `ConditionSet` 與 `ConditionModel` 分離：reachable／sampled／forced transitions 屬 mechanics；probability／transition weights／sample metadata 屬 evidence。
4. `MissionProfile`：canonical mission identity、recipe graph、數量、supplies、score utility、deadline、Duty Actions 與 source。

其上建立 `ProductScenarioBinding`，只保存 `recipeId + objectiveId + policyBindingId + evaluationPlanId + missionId + UI metadata`。data package 不應 import solver config；若 binding 同時引用 data 與 solver，應放在依賴兩者的上層 package／app-neutral registry，而不是破壞 dependency direction。

建議支援層級：

- T0 `catalogued`：identity、patch、source、recipe data 齊全。
- T1 `mechanics-ready`：condition set／formula／transition fixtures 可重播，只開 tracker。
- T2 `experimental-advisory`：objective、generic safe fallback、sensitivity suite與明確 OOD。
- T3 `promoted-craft-policy`：profile-grouped held-out、boundary、safety、latency、artifact parity 與 envelope gate 通過。
- T4 `mission-aware`：MissionProfile、跨件／時間／Duty Action controller與實戰 mission trace 通過。

## Crafter population 與 grouped split 建議

第一版 schema 應至少能表達：

```text
CrafterPopulationManifestV1
  populationId / patch / recipeScope
  profiles[]:
    id / groupId / normalized CrafterProfile
    provenance: empirical | loadout-derived | boundary-probe
    source / tags / mechanicsSignatureByRecipe

CrafterGroupedSplitManifestV1
  splitId / populationId / groupKeyFields
  trainGroupIds
  validationGroupIds
  heldOutInterpolationGroupIds
  heldOutBoundaryGroupIds
  reservedFinalGroupIds
  oodProbeGroupIds
  seedCorpusIdsByRole
```

硬規則：

- `specialist` 正規化成明確 boolean。
- 同一完整 `groupId` 的所有 states／condition／seeds 不得跨 equipment split。
- 現有三套 exact 玩家面板只能標 `regression-seen`，不可重新命名成 held-out。
- 新 population 必須來自版本化 loadout 計算或玩家面板；不可對 craftsmanship／control／CP 三軸獨立亂數，製造不可能裝備。
- mechanics boundary probes 可用來找 rounding 斷點，但必須標 assumption/adversarial，不冒充玩家分布。
- 第一版先證明同 recipe 的 unseen equipment；跨 recipe generalization 使用獨立 recipe split，不混成一句 universal。

## Solver 研究方向

目前最合理的順序不是再訓練 action-only MLP：

1. 先建立 objective-aware、profile-grouped evaluator。
2. 以動態 progress／quality certificate 與 headroom 取代固定 progress ratio／CP threshold。
3. planner 保存 `(optionId, actionId)`、route memory 與 distributional completion／hard-stop／quality／time value。
4. 以 common random numbers 比較完整 route；同一候選不得每一步暗換 continuation persona。
5. 只有 direct planner 在未見裝備與 recipe boundary 有穩定訊號，才蒸餾 policy-value／option-prior artifact。
6. runtime 對 artifact envelope 外一律明確 fallback；不要外插成高信心。

既有負結果仍成立：固定 risk cap、固定 progress floor、action-only labels、只增加 epochs/futures、弱 artifact 自我教學都不值得直接重走。

## Rust 工具鏈與 native 邊界

本輪已透過官方 rustup 安裝：

- `rustc 1.97.1 (8bab26f4f 2026-07-14)`
- `cargo 1.97.1 (c980f4866 2026-06-30)`
- host：`x86_64-pc-windows-msvc`
- path：`C:\Users\alanc\.cargo\bin`

命令會顯示 `could not canonicalize path C:\Users\alanc` warning；新 sandbox 視窗需先確認可讀寫 toolchain path、`link.exe`／MSVC linker，再建立 crate。不要因找不到 PATH 就重複安裝。

以下是本文件前半段 code audit 當下的狀態：當時**沒有**留下 Rust crate、native binary、WASM、TS wrapper 或 parity fixture。文末「收尾 checkpoint」記錄了其後新增的窄版 parity crate；它仍不是完整 Rust solver。

Profiler 稽核指出 hot path 主要是：

- depth-2 lookahead 對全 actions 反覆 legality／safety／condition branch／transition；
- `runEpisode` preview 一次，`applyObservedOutcome` 內再 preview；policy 又可能先 `legalActions` 掃全 action；
- finisher BFS、JSON/string state key、cache 與排序；
- scenario beam 對每個 node/action 重做相同工作。

因此 native 最小有意義單位必須是**整批 rollout/search kernel**：一次傳入 packed recipes、crafters、states、seeds、condition profiles 與 budget，在 Rust 內完成 RNG、transition、beam/rollout 與 aggregate，只回 root scores／search visits／少量選定 trace。逐 transition 跨 JS↔WASM，或每一步 callback 回 TS policy，預期會讓 boundary overhead 吃掉收益。

TS 保留 oracle。Parity 至少逐項鎖住：

- unsigned 32-bit RNG、`Math.imul` wrapping 與 draw consumption；
- `Math.fround`、floor／ceil／clamp 與 multiplier ordering；
- preview legality、CP／durability cost、success rate、progress／quality gain；
- 每一步完整 `CraftState`；
- success／failure、Good Omen、Primed、Pliant、Sturdy、Malleable、Centered；
- no-step／reroll、buff tick／consume、combo、one-use actions；
- terminal／stop reason；
- planner score與 deterministic tie-break。

summary 相同但中間 state 不同仍是 parity failure。先做 native CLI／offline batch；未通過完整 shared fixtures 前不得接 web runtime。

## 新視窗最短接手順序（原始稽核建議，已由文末收尾 checkpoint 取代）

1. 讀 `AGENTS.md` 與本交接，再依路由讀 common entry、technical architecture、solver safety、algorithm verification、data/evidence、roadmap及 2026-08-11 training handoff。
2. 執行：

   ```powershell
   git -c safe.directory=C:/Users/alanc/Documents/GitHub/frozen_rabbit_expert status --short --branch
   git -c safe.directory=C:/Users/alanc/Documents/GitHub/frozen_rabbit_expert diff --check
   npm test
   npm run typecheck
   ```

3. Review `productScenarioCatalog.ts` 與其 test；決定是否作 data catalog canonical owner。整合前先補 export，但不要讓 data import solver。
4. 第一個正式 implementation slice：Crafter population／grouped split validator＋五配方 finite objective-aware feature test。
5. 第二個 slice：`evaluatePolicyHeldOut` 接收 `CraftObjective` 與多 crafter groups，輸出 per-profile、worst-profile、worst-decile、stop reasons、safety、latency與 OOD。
6. 第三個 slice：讓 scenario beam／option context 使用 objective；先跑小型 development smoke，只有正訊號才擴大。
7. Profile 受控的 TS batch；確認 transition/search 是主瓶頸後，再建立 `native/craft-kernel`。
8. Rust 與 TS shared parity 全綠後才跑大 population benchmark；runtime 接線與 artifact promotion最後處理。
9. reserved-final corpora 不得用於上述方向選擇。

## 交付邊界（原始稽核當下）

- 本輪沒有證明新的 solver 效果、跨裝備 coverage 或跨配方 promotion。
- scenario catalog 候選只通過自己的 5 tests與 typecheck，未接任何 consumer。
- Rust 只有工具鏈，沒有 kernel 或 parity 成果。
- benchmark 數字是本機開發診斷，不是目標裝置證據。
- 未執行 commit、push 或 deploy。

新視窗應從上述 evidence gate 繼續，不要把這份 handoff 的設計建議改寫成已完成 runtime truth。

---

## 2026-08-14 收尾 checkpoint（接續實作後的 authoritative 狀態）

本節取代前面的「原始稽核建議」作為下一個 Agent 的接手點；前文仍保留，因為它解釋了為什麼選擇目前這條路。

### 先講結論

這一輪沒有把某個新策略直接塞進網站，也沒有宣稱已經解決任意裝備。真正完成的是把研究管線從「只在三套熟悉裝備和部分配方上看起來能跑」，推進到「能明確知道自己正在解哪個配方目標、哪套裝備、哪些測試資料，以及何時必須拒絕沿用舊結果」。

這個順序很重要。三套玩家面板無法告訴我們所有未知裝備可做到什麼；如果先追分數，很容易把剛好適合三個點的門檻誤寫成通則。現在先補好的，是讓後續實驗不會因目標混淆、樣本洩漏、亂數錯位或 artifact 誤載而產生假進步。新的 causal root MPC 只是研究候選，尚未有 closed-loop 效果數字，沒有 promotion，也沒有接入 runtime。

### 已落地的能力

| 區域 | 現在能做到什麼 | 仍不能代表什麼 |
| --- | --- | --- |
| 五配方登錄 | `packages/data/src/craftScenarioData.ts` 成為 scenarioId／recipe／objective 的 data-only owner；web 由它組合 UI 與 planner，測試會抓兩邊漂移 | 不把 UI metadata、policy evidence 或 solver config 塞進 data；新增配方仍須取得正確 mechanics／objective evidence |
| 配方目標 | domain 的 `assertCraftObjective` 統一驗證配方歸屬、模式與品質目標；mechanics 完成條件與「想達到的品質」不再混用 | quality tier／任務分數資料尚未全部做成完整 validator；未知分數公式仍是 unknown |
| 未知裝備表示 | 裝備先正規化；recipe-specific signature 依目前 mechanics version、取整後作業／品質基礎值、CP、宇宙工具、專家資格與已知修正分組 | signature 相同只表示轉移計算等價，不表示策略在該裝備上已有實證 |
| 訓練特徵與 artifact | feature v4 對五配方都產生 59 個有限數值，包含八種 condition、明示 objective 與所有 specialist 一次性資源；compact artifact 鎖 schema、objective、mechanics、exact crafter、signature 與 tensor 形狀 | 現有 model 沒有因此自動變強；舊 artifact 必須重訓，不能當成已泛化 |
| 裝備資料切分 | population／grouped split 會阻止同一完整裝備跨 train、validation、held-out、reserved、OOD；現有三套裝備明確只能標 `regression-seen` | repository 尚未有一批真正 loadout-derived、未見過、可代表玩家裝備分布的 profiles |
| held-out 評估 | evaluator 從 manifest 推導裝備、group 與 role，要求完整涵蓋 interpolation／boundary（及存在時的 OOD）groups，回報每套裝備、最差裝備／尾端、安全與 latency | corpus ID 尚未綁定 seeds／initial states 的內容 hash；相同 ID 下仍可能被換樣本，所以還不是 sealed promotion evidence |
| episode 亂數 | `drawSimulatedActionOutcome` 統一 success／condition draw consumption；Good Omen 強制 Good 時不偷吃 condition draw，一般 no-step 不讀兩條 stream，Careful Observation 只讀 condition | assumed condition weights 仍不是自然 transition model或實戰成功率 |
| 舊 scenario beam | objective、state key、specialist state 與亂數 cursor 已修正，counter 也改成如實命名 | 它會利用每條抽樣路線的未來資訊，只能說「好路存在」，不能說玩家當下有一個可執行的高成功策略；保留作 negative control／throughput smoke |
| 新 causal root MPC | `packages/policy-lab/src/causalRootMpcPlanner.ts` 每次只比較現在要按的技能；候選最多 8 個，之後全部回到同一個 scenario guide；baseline 與候選用相同亂數，候選若失去任何 baseline-only completion 或最差 profile completion 下降就退回 baseline；budget／輸入／例外也 fail closed | 目前只有五配方結構、paired RNG、Good Omen／no-step 與 budget smoke；沒有 closed-loop 對照結果、held-out 結果或 runtime promotion |
| TS benchmark | `npm run benchmark:kernels` 會在獨立暫存 build 執行，記錄來源 revision／dirty state／bundle hash、workload identity、正確性 payload 與較誠實的 operation 定義 | `expectedResultHash` 仍是 `TO_BE_RECORDED`，所以目前是 timing smoke，不是 correctness gate；開發機數字不是目標裝置 SLA |
| Rust checkpoint | `native/craft-kernel` 無第三方 dependency、禁止 unsafe；TS 與 Rust 讀同一批 TSV，逐 bit 對齊 RNG raw-u32 與 base progress／quality f32 結果 | condition、完整 transition/state、buff、terminal、planner score、search、ABI 與 runtime 都還沒有；沒有產品加速，不能稱 Rust solver parity 已完成 |

### 為什麼不用目前的 beam 直接當通用求解器

五個配方的初始狀態各有約 23–25 個安全 root actions，而原本 beam width 只有 8。這代表至少 15–17 個 root 只看一手，沒有公平比較後續路線；把 width 從 4、8、16 改到 32 時，推薦技能會大幅改變。更根本的問題是，它在每條抽樣路線中知道後面的 success／condition，最後挑出「事後看來最好」的路，玩家實際操作時沒有這些未來資訊。

新的 causal root MPC 改成一個比較保守但可解釋的問題：在完全相同的未來亂數下，現在按候選技能、之後回到同一 guide，是否比現在直接照 guide 更好？completion shield 讓研究候選不能用犧牲某些原本可完成的場次換取漂亮平均值。這個設計較接近產品決策，但設計正確不等於效果已證明；因此本輪停在 research-only。

### 本輪也修掉的證據污染點

- reachable-state sampler 現在真的把 declared objective 綁進來源 policy；之前雖然 sample 寫了 objectiveId，legacy policy 仍可能看到 `requiredQuality=0`，讓釘或巨匠藥的 trajectory 被錯標。
- reachable／label pipeline 拒絕空白或重複的 policy／condition-profile ID，避免 `Map` 靜默覆寫後還回報虛假的 episode 數。
- route-option rollout 會先確認 condition profile 不會產生該 recipe 不支援的球色。
- held-out evaluator 拒絕 terminal initial state，避免 final state 已完成、EpisodeResult 卻人工標成 `terminal: none`。
- mechanics signature 現在包含 canonical mechanics model version；公式改版後，舊 population manifest 不會因數字剛好相同而被誤認為新模型證據。

### 明確未完成／不可宣稱的項目

1. **沒有新 solver promotion。** 網站仍使用原本五個 versioned guide／certificate／bounded-risk policies。
2. **沒有未知裝備成功率。** 現有三套面板參與過大量調整，只能做 regression；尚未建立真實可行 loadout 的 train／validation／unseen groups。
3. **沒有 causal MPC 效果表。** `tools/evaluate-causal-root-mpc/scenarios.ts` 只先鎖五配方 baseline config、三組 assumed condition families、development-only 標籤與 paired seed contract；依使用者收尾指示，沒有建立 runner 或跑大樣本。
4. **沒有 sealed corpus。** split manifest 目前保存 corpus ID，但沒有保存 seed list與 initial-state corpus 的 canonical content hash；下一輪一定要先補這個，才可把結果叫 held-out promotion evidence。
5. **沒有完整 objective registry proof。** objective target 已驗證，quality tiers 的 ID／順序／上下界／來源仍需補 validator。
6. **沒有完整 Rust parity 或速度收益。** crate 只是最低層算術與 RNG checkpoint；不要先做逐 transition FFI，也不要把 1,500 行 guide policy直接翻成 Rust。
7. **benchmark correctness hash 尚未凍結。** 在目前工作樹完全穩定後才記錄 `expectedResultHash`，而且至少連跑兩次確認一致；此前 `matchesExpected=false` 是已知狀態，不應為了全綠隨便填值。
8. **使用者在收尾後另行要求 commit。** 實作與本文件的最終 commit hash 以 `git log` 為準；本輪沒有 push、tag、PR 或 deploy，不能由本機 commit 推定公開頁面已更新。

### 下一個 Agent 的實作順序

1. **先重驗工作樹，不先調策略。** 讀 `AGENTS.md`、本節與 canonical owner；執行 status、diff-check、full tests、typecheck、build、native parity。若任何失敗，先分類為 code、fixture、sandbox 或 concurrent-edit 問題。
2. **封住 corpus 內容。** 為 seed corpus 與 initial-state corpus 建 canonical manifest／content hash；evaluator 必須重算並比對。這一步完成前不使用「promotion-ready」字樣。
3. **建立真的裝備 population。** 從版本化 loadout calculator 或玩家面板產生可能存在的完整裝備組合，不可獨立亂數拼 craftsmanship／control／CP。先在單一 recipe 內切 train、validation、held-out interpolation、held-out boundary、reserved-final、OOD。
4. **只跑 development causal 對照。** 使用 `CAUSAL_ROOT_MPC_DEVELOPMENT_SCENARIOS`，五配方 × 三套 regression-seen profiles × assumed condition profiles，以同 seed 比 guide baseline 與 causal root MPC closed-loop；報 completion、objective hit、品質尾端／平均、手數、安全、planner null 與 latency。此階段不讀 reserved-final。
5. **設定停止規則。** 若任一配方出現 baseline-only completion loss、最差 profile 退步、p95 超過強規劃 `<1s` 目標，或改善只在少數已看 seed，停止擴大並記 negative result。只有多個 development slices 都有穩定正訊號，才凍結候選版本。
6. **再跑真正 unseen equipment。** 完整 per-profile／worst-profile／worst-decile 與 OOD fallback 都通過後，才考慮 frozen validation；reserved-final 仍只在最後且只用一次。
7. **最後才做 Rust batch kernel。** 先把 TS 的完整 transition trace、Good Omen／no-step、specialist resources、terminal 與 planner tie-break 都加進 shared fixtures；Rust 一次接收整批 recipes／crafters／states／seeds／budget，在 native 內完成 rollout／search，只回 root aggregate 與少量 trace。TS 逐步 oracle 全綠且有實測端到端速度收益後，才考慮 wrapper／runtime。
8. **runtime promotion 是最後一步。** causal planner 或 distilled artifact若沒有完整 evidence envelope、版本與 fallback，保持在 policy-lab；web／solver 不反向 import training package。

### 關鍵檔案索引

- 配方與 objective owner：`packages/data/src/craftScenarioData.ts`、`packages/domain/src/objective.ts`
- 裝備與分割：`packages/domain/src/mechanicsSignature.ts`、`packages/policy-lab/src/crafterPopulation.ts`
- feature／artifact：`packages/policy-lab/src/features.ts`、`packages/policy-lab/src/compactScorer.ts`
- 評估：`packages/policy-lab/src/evaluatePolicy.ts`
- 亂數語意：`packages/simulator/src/drawActionOutcome.ts`
- optimistic negative control：`packages/policy-lab/src/scenarioBeamPlanner.ts`
- causal research candidate：`packages/policy-lab/src/causalRootMpcPlanner.ts`
- 未執行的 development contract：`tools/evaluate-causal-root-mpc/scenarios.ts`
- TS timing smoke：`tools/benchmark-kernels/`
- native parity checkpoint：`native/craft-kernel/`、`tests/fixtures/native-parity/v1/`、`tests/nativeParity.test.ts`

### 收尾驗證

本節最後一次更新時已確認：`npm test` 為 43 files／264 tests 全綠；`npm run build` 完成 typecheck 與 Vite production build；Rust `cargo test --offline --manifest-path native/craft-kernel/Cargo.toml` 為 3 parity tests 全綠；focused objective／population／RNG／causal-planner tests與 `git diff --check` 也通過。這些只證明 checkout 可建置與契約未破壞，不是新 solver 效果。若下一個 Agent看到後續修改，必須重跑，不能只引用這段文字。
