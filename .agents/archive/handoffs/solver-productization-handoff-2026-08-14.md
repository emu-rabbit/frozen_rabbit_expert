<!-- doc-status: archived -->

> **歷史文件。** 其中的產品化階段與 TypeScript／Rust 邊界已被目前架構取代；只在追溯舊實驗與決策時使用。

# Frozen Rabbit Expert：求解器產品化、跨裝備泛化與 Rust 加速交接

`last_verified: 2026-08-23`

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
| TS benchmark | `npm run benchmark:kernels` 會在獨立暫存 build 執行，記錄來源 revision／dirty state／bundle hash、workload identity、正確性 payload 與較誠實的 operation 定義 | 此歷史 checkpoint 當時的 `expectedResultHash` 仍是 `TO_BE_RECORDED`；2026-08-20 authoritative checkpoint 已凍結 deterministic hash，開發機數字仍不是目標裝置 SLA |
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

---

## 2026-08-20 共用架構、證據封存與 Rust whole-rollout checkpoint

本節取代 2026-08-14 收尾段落作為目前 authoritative 接手點。前面兩個 checkpoint 保留歷史脈絡，但其中「沒有 sealed corpus」、「沒有 closed-loop runner」與「Rust 只有 RNG／base gain」已經過時。

### 目前結論

跨配方方向已從「五份散落 mapping」收斂為同一套 mechanics、session、scenario resolver、研究 evaluator 與 native batch protocol；配方差異仍由資料化 recipe、objective、guide config 與 policy version 明確保留。這不是每加一個配方就重寫一個完整求解器，也不是把五個不同目標硬壓成同一條策略。

目前能證明兩件事：

1. 評估管線比 2026-08-14 更難因資料洩漏、同 ID 換內容或事後重切 split 而出現假進步。
2. 把完整固定 action rollout 一次批量交給 Rust，在本機大型離線工作量有明確速度收益，而且逐步結果可與 TS oracle 對齊。

目前仍不能證明通用策略已足夠好：repository 沒有一批可由可信 loadout calculator／game-data snapshot 重播的真正 unseen equipment population；causal candidate 也沒有穩定 closed-loop 正訊號或 promotion。

### 共用 scenario 與 model identity

- `packages/solver/src/guideScenarioPolicyRegistry.ts` 是五個 scenario 的 guide version／config resolver；web 與 causal evaluator 不再各自維護五份 switch。
- binding 同時保存 recipe／objective ID 與 `craft-scenario-model-identity-v1` hash。hash 涵蓋 mechanics version 與完整 recipe／objective enumerable 內容，canonical object key order、保留 array order。
- causal planner 在任何 baseline／episode 前重算 identity；即使 ID 一樣，只要配方數值、可用 condition、objective mode／target 或來源內容漂移，就回 `baseline-unavailable`、不執行 episode。
- exact player profile routing 也包含 crafter level；同三圍但不同 level 不會誤用 level 100 override。

### 證據與 split 防線

- corpus seal 會鎖 uint32 seed 成員，以及 domain-separated 的 `recipeProfileId × crafterGroupId × full CraftState` initial-state 成員；跨 role 的 seed／state 內容重疊會拒絕。
- population、split 與 corpus manifest 各有 canonical content hash，evaluation 必須收到事先信任的 expected hashes；只保留相同任意 manifest ID、同時換內容不再能通過。
- split 會預先固定每個 recipe×group 使用哪一份 initial-state corpus；同一裝備 group 在不同配方可有各自合法 state，不能互換來挑結果。
- candidate policy factory 只收到 runtime 可觀測且 deep-frozen 的 crafter，不會收到 held-out／reserved role、coverage label、corpus ID／hash 或 initial states。
- adversarial boundary probe 只能從 `regressionSeen`／`train` 基底衍生，不能拿 validation／held-out／reservedFinal 裝備做開發 probe。
- evaluator report 保存 detached／deep-frozen evaluation identity，以及 population／split／corpus hashes；大型 corpus lookup 使用一次驗證後的 Map index，latency aggregation 不使用可能撞到 argument limit 的 spread。

這些是 evidence integrity contract，不是資料來源真實性的充分證明。目前 `versioned-calculator` provenance 仍只驗結構與宣告 hash，repository 沒有載入完整 item／meld／food／medicine artifact 重算 `CrafterProfile`；因此現有 synthetic fixture 只能測 gate，不能稱真正 unseen loadout evidence。

正式 `sealed-population-promotion-decision-v2` 只接受本次 evaluator 產生、不可由 JSON clone／手刻物件冒充的 live result，並要求 release-owned population／split／corpus／evaluation-setup 四個 expected hashes。現階段它仍固定回拒絕：report 宣告的 policy artifact hash 還沒有證明就是實際執行的 bytes，reserved-final 也尚未評估。這是有意的 fail-closed 邊界；development comparison 可以繼續協助選方向，但不能被改名成正式 promotion。

### Causal closed-loop 負結果與安全收斂

`tools/evaluate-causal-root-mpc` 現在會在相同 scenario／crafter／condition／environment seed 下，逐場配對 guide baseline 與每步重規劃的 causal candidate；另給 planner 獨立 seed namespace，避免研究 policy 看到 outer environment hidden seed。report 會列 completion／objective／quality／actions 的 paired win-loss-tie、planner selection／偏離、安全／null／fallback、latency 與 stop reasons。

第一個完整 development case（巨匠藥、食藥非專家、Normal-heavy、seed `1129422391`）是明確負訊號：guide 25 手、品質 12000；舊 causal candidate 33 手、品質 7869，objective hit 從 1 變 0，33 次決策偏離 baseline 19 次，p95 約 2530.9ms。根因包括低樣本幸運的 risky action、用手數 tie-break 離開穩定滿品質路線，以及每步重規劃沒有遵守前一輪評估假設的 guide continuation。

目前 planner／runner已加上：

- samples `<2` 只回 safe baseline；低樣本先排除 risky roots。
- paired objective-loss／completion shield、quality regression stop、worst-condition gate。
- baseline action 先做 legality／safety 驗證；不安全時回 null，不把已知壞 action 當 fallback。
- scenario full-content identity、seed uint32、獨立 planner RNG、workload上限、system／injected clock標記。

這些修正會避免重現已知退化，卻不等於 candidate 已經變強。尚未用足夠的 per-condition paired sample、真正 unseen equipment 或 reserved-final 證明改善；`RESEARCH_TEACHER_PROMOTED=false` 與 runtime 未接線仍正確。

### Rust transition 與 whole-rollout parity

`native/craft-kernel` 現在是 dependency-free、禁止 unsafe 的 offline native kernel，已包含 35 actions 的 legality／cost／gain／buff／combo／specialist resource／terminal transition、deterministic success／condition RNG，以及兩個長駐 batch protocol：

- `native-transition-batch-v1`：53 direct cases，涵蓋五配方、三面板、八種 conditions、八個 buff 欄位、success／failure、specialist／no-step、terminal 與 RNG cursor，並逐一直接施放 `ACTION_IDS` 的 35／35 actions。TS／Rust comparable SHA-256 同為 `13d1792fe41e90f4e2763d1963b88d983f0f6a2816be2812a1a7ae76f8ca52c1`。
- `native-rollout-batch-v1`：112 欄輸入會一次帶入 recipe、crafter、完整 state、seed／cursor、max steps、8×8 condition transition weights 與固定 action sequence；35 欄輸出含 terminal、stop reason、實際 actions、final state／cursor 與完整逐步 trace。illegal action fail closed，不套用 transition。
- `native-root-plan-matrix-v1`：同一 recipe／crafter／state 下，一次傳入多個 root candidates、paired seeds 與一條 shared fixed continuation；Rust 內部展開 candidate × seed 並回 raw outcome／trace，TS 保留 objective score、safety shield 與 tie-break。protocol echo scenario／model／plan／candidate／sample identities，拒絕重複、遺漏與內容 hash 漂移。

10 個 whole-rollout cases 覆蓋五配方與三組 regression panels，逐步比較 success、next condition、完整 state、explanation、兩條 RNG cursor、terminal 與 stop reason；其中一案使用 deterministic 非 IID transition rows 鎖 previous-condition row selection，另一案鎖 no-step actions 仍按 action count消耗 maxSteps。TS／Rust comparable SHA-256 同為：

`a7587b7a981742bbfeaca809a0f2a8d2e6c960126cb07c6ee39a13ebb82f6ccb`

最終 release 100k repetitions：

| Workload | TypeScript | Rust timed core | Rust 含 process boundary |
| --- | ---: | ---: | ---: |
| 1,000,000 whole rollouts／2,900,000 transitions | 20,792.87ms | 1,216.29ms | 1,238.54ms |
| 相對 TS | 1.00x | 17.10x | 16.79x |

兩側 binary exposed-field FNV-1a32 都是 `ad543305`。這個結果支持使用者原本的架構理由：離線迭代與大型 benchmark 應一次把大批工作留在 Rust 內完成，不能每一步啟動 process 或跨 boundary。它只證明 fixed-action whole rollout；adaptive guide、causal MPC、beam／search score、planner tie-break、packed ABI／WASM 與 web runtime尚未 native 化。

root-plan matrix 的 10 個 requests 覆蓋五配方、三面板、每配方兩組 condition profile、三個 root candidates 與四個 paired seeds；full-trace comparable SHA-256 同為：

`f7aceda68bf896c5e7672d1b0147c13b72c92a137677e71d1c0d8a01ebe76759`

兩次獨立 release 重跑 1,000,080 candidate×seed episodes／5,800,464 transitions：TS 26,469.18～32,294.78ms，Rust timed core 2,340.52～2,479.59ms（11.31～13.02x），含 process startup／input 2,354.14～2,493.69ms（11.24～12.95x）；兩側 binary FNV-1a32 都是 `283b6575`。這把 native 最小工作單位從「照固定清單跑完」推進到「同一未來路線下批量比較第一步」，但 shared continuation 仍是固定 action tape，不是目前會依每步結果更新 memory 的 adaptive guide，更不是完整 MPC／generic search。

final review 後另補兩層 fail-closed：TS encode／oracle 在執行前以實際 recipe＋objective 重算 scenario identity，沿用舊 hash 的內容突變會拒絕；一般 batch 除 per-request 上限外，整批限制 2,000,000 episodes、100,000,000 projected transitions、240 MiB projected output，benchmark 限 10,000,000 episodes／100,000,000 projected transitions。TS／Rust 使用同一保守 projection，Rust binary 再檢查實際 bytes且不輸出 partial outcomes。`.github/workflows/native-parity.yml` 也把 rustfmt、Cargo all-target tests、release build、bridge typecheck、fixed kernel/root parity 與 adaptive-program parity 納入 PR／main CI。

### 有限真實資料原則與第一個跨裝備 data program

使用者已明確說明：單一玩家無法合理蒐集足以辨識自然 condition transition matrix 的抽球量，也無法在有前置成本與倒數限制的任務中刻意命中大量指定品質來反推精確 score curve。這不是忽略真實資料，而是把資料取得成本納入產品設計。自 2026-08-20 起，大量玩家 trace、精準 transition probability、完整 Teamcraft loadout database 與未知 score 區間都改為持續校準來源，不再是開始單一 recipe 穩定化的永久 blocker。

評估改採多個 versioned plausible condition worlds、deterministic stress sequences、明示 equipment envelope 與成對相同亂數。只能宣稱 evaluated model envelope 內的 robustness，不輸出實戰成功率。玩家 trace 由正常遊玩自然累積，用來抓 mechanics mismatch、未建模狀態與 recovery case；未來 Teamcraft／官方／社群 artifact 到位時建立新版本，保留舊 evidence 並整批 replay。

第一個可攜策略層已落在 `packages/solver/src/adaptivePolicyProgram.ts`：`craft-adaptive-policy-program-v1` 是 data-only、content-addressed 的 node／guard／ordered-decision program。它只讀 runtime 可觀測 state、crafter、recipe／objective 與 action preview；`decide` 不提交 memory，`advance` 會完整重算 observed mechanics transition、驗 state continuity 後才原子提交。memory 綁 program、normalized context 與最後 state hash，stale restore／跨 crafter memory／非法 transition 都會拒絕。`packages/policy-lab/src/adaptivePolicyEpisodeAdapter.ts` 只負責 simulator first-action callback 的接線，terminal／action-limit 最後一手由 exact-once `observeFinalState` 補記。

首個 recipe artifact 是巨匠藥 `command-brew-conservative-adaptive-program-v0.1.0`：

- 入口必須是 exact fresh state；specialist／non-specialist 的 Careful Observation、Heart and Soul、Quick Innovation 可用次數也分別鎖定。
- 強能力 envelope 只接受 level 100、宇宙工具、craftsmanship `5350–5500`、control `5215–5350`、CP `748–780`，再用 Reflect／Delicate Synthesis preview 重驗，走 26 手 quality-first route。整數掃描 `677,688` 個 bounded cells 全滿品質完成；下界同時成立時 all-Normal／all-Good／all-Malleable 也滿品質。
- 保守支線暫時只接受已實測 exact 無增益 `5408／5140／630`，走 deterministic floor route；其他面板第一手前 `program:capability-routing-failed`，應回 released guide，而不是先做一半再失敗。
- 低於 objective 的完工只允許三個 `safe-finish` decisions 明示 opt in；Malleable 可能提早推進時會以 Final Appraisal／preview guard 保護品質階段。

完整 Command Brew development comparison 沒有使用 reserved-final：

| Slice | Episodes | Completed | 12000 | >=10200 | >=7200 | Safety |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Primary：3 panels × 3 plausible worlds × 128 seeds | 1,152 | 1,152 | 773 | 797 | 961 | 0 |
| Stress：3 panels × all-Normal／all-Malleable × 32 seeds | 192 | 192 | 128 | 128 | 128 | 0 |

兩個強面板合計 896／896 滿品質；無增益合計 448／448 完成，primary 為 384／384 完成、滿品質 `5`、`>=10200` 為 `29`、`>=7200` 為 `193`，minimum `6567`、p10 `6839`、average `7817.91`；stress 64／64 都為 `6839`。與 released guide 成對比較，全部 primary raw quality 是 `120 wins／259 losses／773 ties`、平均差 `-319.07`、worst delta `-5433`；`>=7200` 為 `+30／-104`、`>=10200` 為 `+1／-131`、滿品質 `+0／-140`。stress raw quality 是 `31／33／128`、平均差 `+157.45`。因此 machine decision 固定為 `formalPromotionEligible=false`、`developmentExpansionEligible=false`：這版成功證明共用 interpreter 與跨裝備 conservative floor，不是可取代現行 web policy 的全面升級。

保守支線後續加入兩個窄、route-consistent 的 Good `Precise Touch` 規則。第二個規則針對 `quality-basic-touch-2`：exact prefix expansion 找到 1,024 個符合節點的 Good 機會，逐一比較皆為品質提升、`0` completion／quality-floor／safety loss；另跑 16 seeds × 3 development worlds，觸發 8 場、`+8／-0`。它們讓完整 primary 由初版的滿品質／10200／7200 `768／780／953` 提升到 `773／797／961`，但仍不足以補回 released guide 的高尾，因此只留在 research artifact，沒有藉局部正結果繞過總體 gate。

native 已新增 sibling protocol `native-adaptive-policy-matrix-v1`。Rust 讀取同一份 prepared program 資料，通用解讀 guards、preview、safety、settle／resume、flags 與 counters，每一步依真實 outcome 更新 memory 後再選下一手；Rust source 不含 Command Brew route 或 equipment/profile ID。最新 `command-brew-conservative-adaptive-program-v0.1.0` 在 18 cases／386 transitions 中，兩個 Good 規則都實際命中，TS／Rust 的 action、node、decision、before／after memory、完整 CraftState 與 RNG cursor 逐手 deep-equal。program hash 是 `sha256:8c2b70203b778545941e63f93e4a373ba6835b0fb91ec81d7c5ca4a910b9c087`，trace SHA-256 `86ff9a76979b0104d06827d4bc08f6f2c53dd035c97f5c72399b6cfc7d7cf87d`，structured FNV32 `7a048c19`，raw FNV64 `067a02f54de3ff2c`。本次只把 timing 當診斷，不從 18-case 小樣本宣稱 adaptive speedup；此層也仍不是 MPC／generic search 或 web runtime。

下一個策略品質問題很清楚：兩個無損 Good 局部替換已證明 data program 可以安全成長，但保守主路線本身仍丟失無增益面板的高尾；guide extraction 則證明成熟策略必須保留高頻風險與 recovery。下一輪需先把 extracted option labels 編成可自行執行的 data-only options，再在同一 program／memory contract 內找可證完整後綴；不可只繼續堆局部替換，也不能回到每步因小分差切換人格的 causal root thrashing。

使用者隨後校正了目標：高難配方本來就被設計成必須依賴 condition，玩家成功影片中的 Observe／Daring／Hasty 等行為也證明「永遠選確定技能」不是可用策略。巨匠藥 6839 品質只屬已知 600–719 收藏價值的 100 分區，不能因完成穩定就稱成功。從此 all-Normal／長白球只作 catastrophic completion、資源與 recovery stress；primary selection 改看 plausible colored worlds 的 `>=10200`、滿品質、完成與失敗後復原。`riskyActionFailures=0` 不再是目標；風險必須有 budget、觀測後分支與安全收尾。保守支線只保留為 recovery／negative control，下一個候選要把 bounded condition fishing（包括有 finishing budget 的 Observe）與成功／失敗兩條後綴表達成 data program。

### Guide 進取／復原能力保存 checkpoint

在繼續改寫策略前，先新增 `command-brew-guide-extracted-risk-options-v0.1.0`，把 released guide 的每一手依可觀測狀態與 actual history 分成 mainline、作業／品質風險、condition opportunity、condition fishing、quality burst、resource recovery 與 safe finish。

這個 controller 不讀 equipment/profile ID、condition-profile ID 或 seed；checkpoint 綁 scenario model、normalized crafter context、精確 initial state 與 last observed state。玩家若合法偏離推薦，memory 會記 actual action 並以真實 history 重新規劃；after-state 若不是 canonical mechanics 能由聲稱 action／success 產生，整筆拒絕。risk budget 只作 audit boundary，超界不會偷偷改掉 protected guide action。

完整 audit 指令：

```powershell
node tools/research-command-brew-aggressive-options/audit.mjs
```

| 面板 | Episodes | Transitions | 完成 | `>=10200` | 滿品質 | Elapsed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| U `5408／5140／630` | 384 | 11,371 | 384 | 159 | 145 | 178,758.95ms |
| F `5408／5237／749` | 96 | 2,420 | 96 | 96 | 96 | 8,427.41ms |
| S `5428／5257／764` | 96 | 2,418 | 96 | 96 | 96 | 8,491.98ms |

576 場／16,209 transitions 的推薦 action、實際 success／failure、完整 state 與最終 tier 全部和 released guide 相同；mismatch、safety violation、current／projected budget exceedance 都是 0。U 面板 384 場中有 355 場至少一次風險技能失敗，總失敗 1,643 次：Rapid `2455／1352 failures`、Hasty `571／232`、Daring `151／59`。單場最多總下注 17、作業下注 12、品質下注 8，最長總／作業／品質連敗為 8／8／5；失敗後最低曾到 CP 0、耐久 5，仍全部完成。這證明現行穩定性來自「下注失敗後仍會救」，不是來自拒絕冒險。

| Option | U | F | S |
| --- | ---: | ---: | ---: |
| mainline | 2,948 | 1,221 | 1,221 |
| progress risk | 2,455 | 0 | 0 |
| quality risk | 722 | 0 | 0 |
| condition opportunity | 1,408 | 27 | 27 |
| condition fishing | 0 | 0 | 0 |
| quality burst | 1,110 | 474 | 474 |
| recovery | 2,328 | 96 | 96 |
| safe finish | 400 | 602 | 600 |

這仍只是「替成熟司機的行為貼標籤並能無損重播」，不是已能自行駕駛的獨立 option FSM。下一輪應在此 memory／option contract 內逐段編成 data-only program，再讓 Rust 批量比較 option parameters；不能把這份 parity checkpoint 誤稱新 solver release。

### 風險評估 checkpoint

`command-brew-development-risk-evaluation-v2` 把 reasonable-world quality 與 catastrophe recovery 分開：

- 完整 coverage 必須是 Command Brew development corpus、三組 regression panels、三個 plausible worlds、完整 128 seeds，以及 all-Normal／all-Malleable 至少 32 seeds；partial、空 stress、錯 corpus 或 frozen 重標都 fail closed。
- plausible slice 逐 equipment／world cell 報 completion、7200／10200／12000、p10、平均品質及 paired worst downside；明示 downside budget 才能進一步擴張。
- catastrophe slice 的品質只報告，不為了守低價 floor 否決候選；completion regression、hard stop、safety、未復原風險仍會否決。
- Observe 只有 candidate 明示該步 fishing intent 與目標 condition 才計數；普通 Observe 不會被事後改稱賭球成功。
- 外部 episode 逐手以 canonical Command Brew mechanics 重算，但尚未證明 RNG origin 或第一個 state 的可信來源，所以 `formalPromotionEligible` 永遠是 false。

完整 128／32 CLI 已確認 coverage validated；現有 conservative route 與 adaptive program 仍因品質退步而 `developmentExpansionEligible=false`。單點 Hasty→Daring research 雖把小樣本 `>=10200` 從 2 提到 6、平均 `+134.6`，但 p10 `6839→6735` 且仍遠低於 released guide，也保留為負證據，不升級。

### 接手順序

1. 35／35 direct action parity 與 fixed-continuation root matrix 已完成；後續 mechanics version 變更仍要同步 bump protocol／fixture identity，並逐步加入完整已知 guide routes。
2. adaptive policy program 的 TS／Rust逐步契約已完成；下一個 native slice 應批量比較完整 route option／candidate × world，TS 繼續擁有 objective score、paired shield 與 final tie-break。不要逐 step callback TS guide，也不要把五份 guide直接翻成五份 Rust。
3. 建立可信 loadout producer：版本化 game-data／item／meld／food／medicine snapshot＋可重播 calculator output；先凍結 population／split expected hashes，再做單一 recipe unseen evaluation。
4. 讓 policy artifact loader 從實際 bytes 算 identity並建立 executable，閉合「宣告 hash」與「真正執行內容」；在此之前正式 promotion保持拒絕。
5. causal development 只有在每個 condition profile 有足夠 paired樣本、沒有 completion／quality tail退步且 latency達標時才擴大；否則保留 guide baseline與 negative result。
6. reserved-final 仍只在候選、artifact、loadout population與 gate完全凍結後使用一次；本 checkpoint 未讀取 reserved-final。
7. adaptive native search與真正 unseen equipment都通過後，才討論 runtime wrapper；web仍不得反向 import policy-lab或依賴遠端 server。

### 2026-08-20 驗證

- TypeScript：`npm test -- --reporter=dot` 58 files／394 tests；`npm run typecheck` 通過，且 causal、native parity 與 Command Brew research tools 都納入 typecheck。
- Rust：`cargo fmt --check`、`cargo test --locked --all-targets` 54 tests、`cargo build --locked --release` 全部通過。
- parity／performance：35-action transition、10-case rollout、10-request root matrix 與 18-case adaptive program 的 SHA／FNV／operation／transition counts全部相符；兩個 `npm run test:native-*parity` gate 都會在 native binary 缺失或 identity／SHA／FNV／count mismatch 時失敗。
- kernel benchmark：deterministic correctness payload 已鎖為 `38fcc67740c85d3339b2f298b657ae5891db9288e935b31d79854b4904c708b1`，重跑 `matchesExpected=true`。
- `git diff --check` 無 whitespace error；Windows working-copy 僅有 LF→CRLF warning。
- `npm run build` 已完成 typecheck 與 Vite production build（97 modules）；公開 GitHub Pages live版本仍未驗證。收尾依意圖建立本機 commits，沒有 push、tag、PR 或 deploy。

### 2026-08-23 過度設計收斂與第一個窄幅正候選

本輪先把尚未服務完整司機的 v2 counter／observed-update、六手品質風險切片與 native probe 整套撤回；連同 20 個 Vitest 與 5 個 Rust tests 一起移除，避免留下無實際使用者路徑的框架與測試。另刪除未被消費的 specialist benchmark profile／重複 legality test，以及只要求每個 option 至少兩個不同 action、卻沒有驗 legality／safety／outcome 的內部形狀測試。保留的 `--candidate` 與 `--diagnostics` research flags 直接縮短單一候選篩選並解釋低分群，屬於有實際研究回饋的工具。

在不新增策略框架後，直接掃描既有巨匠藥 recipe config。`progressFloorBeforeQuality .70` 是唯一通過完整 development 對照的值，因此鎖為 `survey-craftsmans-command-brew-guide-integrated-v1.3.0-candidate.1`；v1.2.0 config／version 明確保留為 evaluator reference 與舊 extracted-option artifact 的歷史來源。這個數值只屬 Recipe 36582，不進其他配方的共用 default。

| 面板 | Episodes | 完成 | `>=10200` | 滿品質 | 其他結果 |
| --- | ---: | ---: | ---: | ---: | --- |
| U `5408／5140／630` | 384 | `384→384` | `159→164` | `145→149` | p10 `4138→4328`；平均品質 `+74.64`；平均手數 `+0.193` |
| F `5408／5237／749` | 384 | `384→384` | `384→384` | `384→384` | 每場 raw quality 與 tier 持平 |
| S `5428／5257／764` | 384 | `384→384` | `384→384` | `384→384` | 每場 raw quality 與 tier 持平 |

primary paired 合計 high `+6／-1`、滿品質 `+5／-1`、raw quality `+24／-4`；completion 與 safety 都無退步。catastrophe stress 的 completion、10200／12000 tier 與 safety 持平，但 U raw quality `+4／-8`、平均 `-75.5`、worst `-1994`。因此判定是「較弱裝備小幅偏高分、兩個強面板不變、極端品質有代價」的 development candidate，不是全面 dominance。reserved-final 未讀取，scorecard release registry 仍只登錄 v1.2.0，formal promotion 為 false。

最終驗證：`npm test -- --reporter=dot` 為 57 files／392 tests；`npm run typecheck` 與 `npm run build` 通過，Vite 轉換 97 modules；Rust all-target 維持 54 tests。沒有 commit、push、tag、PR、deploy 或 reserved-final access。

### 2026-08-23 Command Brew final 與 120 面板能力地圖

使用者明確允許把最後考卷作參考後，鎖定的 `.70` candidate.1 對 v1.2.0 一次執行完整 Command Brew reserved primary：三個 regression-seen 面板 × 三個 assumed plausible worlds × 512 seeds，兩個 arms 各 4608 場；catastrophe 另以每格 64 seeds 跑 384 場。primary 兩版都完成 `4606／4608`，相同兩場 U／Normal-heavy 在多次 Rapid 失敗後耗盡 CP／耐久並回 policy-null；web 對 null 會立即切 quick fallback，但 guide 評估仍必須把它們算未完成。paired `>=10200 +5／-5`、滿品質 `+10／-4`、raw quality `+63／-35／=4510`、平均差 `+9.06`；F／S 逐場持平。catastrophe 的 completion／10200／12000 tier 全持平，raw quality `+3／-9`、平均 `-3.60`。

同時把 evaluator 接到 recipe-local synthetic screening grid，不新增共用策略框架或 package data：craftsmanship `5200／5300／5408／5500` × control `4900／5000／5140／5237／5350` × CP `580／600／630／680／749／780`，固定 level 100、宇宙工具 ON、非專家，共 120 組。candidate.1 對 v1.2.0 的單 seed paired 粗篩雖都是 `600／600` 完成、0 safety，primary 卻為 high `139／142`、full `131／134`、平均品質 `7989／8195`；這與「更通裝備」主目標相反，已足以拒絕 `.70`，runtime／protocol 回到 v1.2.0／`.65`。reserved corpus 從此只作 disclosed regression；CLI 需要明示 acknowledgement，禁止調參、縮題、換裝備或抽 sample trace，且輸出不再揭露 seed 生成欄位。

現行 v1.2.0 再以同 120 組面板跑三個 plausible worlds × 4 seeds 與兩個 catastrophe worlds × 4 seeds，共 2400 場：全部完成、0 safety。plausible high `534／1440`、full `515／1440`、p10 `4304`、平均 `8336.32`，primary／stress p95 decision latency `33.03／35.48ms`；120 組都至少一場進 10200 與滿品質，但只有最強的 8 組每場都滿品質。最弱 `5200／4900／580` 另以 32 seeds/profile 加考：96 plausible＋64 catastrophe 全部完成、0 safety，plausible high `18／96`、full `15／96`、p10 `2926`，catastrophe high/full `0／64`、p10 `2167`。這張圖只證明同一個讀實際 stats／state 的策略可跨明示 mechanics grid 收尾；弱端最低品質很低，不能把「會做完」改寫成穩定高分，也不能把獨立拼出的面板冒充真實 loadout population／OOD promotion。

另用 16 development seeds 對 U 面板做最小方向排除：10800→10200 guardrail 與 reference 逐場完全相同；`freeQualityCpFloor 100→84` 造成 high／full 各 `-1`、平均品質 `-72.25`；「每次 Rapid 失敗後都須保有保證完成路線」雖未降低 completion，卻使平均品質 `-1134.06`。後兩者與該 runtime 實驗都已撤回；不為了兩個極端 fallback activation 留死參數、第二套司機或新增測試。研究 CLI 只保留 120 面板 screening、歷史 v1.2 paired reference 與已揭露 final 的 fail-closed 邊界。

收尾驗證：`npm test -- --reporter=dot` 為 57 files／392 tests，`npm run typecheck` 與 `npm run build` 通過，Vite 轉換 97 modules；reserved-final 未帶明示 regression acknowledgement 時會立即拒絕。Rust／native code 本輪未變更，沿用本 checkpoint 已通過的 54 tests，不為文件與 TypeScript research CLI 重跑；`git diff --check` 無 whitespace error。沒有 commit、push、tag、PR 或 deploy。
