# 技術架構與目標邊界

## 文件狀態

`last_verified: 2026-08-12`

目前 repository 已有 scenario-based manual-condition UI、正式位於 `packages/solver` 的四個 recipe-specific guide-integrated runtime、Web Worker timeout／fallback 邊界，以及 Phase 2 simulator、offline `policy-lab` 與 route-option research modules。本文件同時描述 **current implementation** 與後續 POC target；所有 scenario 都不代表已通過 cross-profile／true-condition／held-out promotion gate。

## 預設 stack

延續 Frozen Rabbit 系列、並配合 local real-time policy：

- TypeScript，strict mode。
- Vue 3 Composition API。
- Vite。
- Tailwind CSS，class-based dark mode。
- PrimeVue／PrimeIcons，只用於能提升一致性與可及性的元件；第一版 tracker 尚未引入。
- Vue I18n，架構預留 `tw`／`cn`／`en`／`ja`。
- Vitest＋Vue Test Utils。
- Playwright。
- npm workspaces 或等價的輕量 monorepo package linkage；不先導入額外 monorepo orchestrator。

dependency version 在 scaffold 當下依目前相容性決定，不把姊妹專案的版本無條件複製。

### 平台與計算預算

- `apps/web` 是目前可操作 surface，不再是永久唯一平台；desktop shell、native worker 或本機 service 都可作後續執行形態，但 recommendation 仍不得依賴遠端 server round-trip。
- 強規劃器可使用固定預算、p95 `< 1s` 的本機計算；目前 web watchdog 常數為 `3000ms`，用滿上限才終止 worker 並標示 timeout。快速 fallback 的 p95 `<50ms` 是獨立 benchmark gate，不會觸發 watchdog；worker 啟動／執行 error 或 null result 可立即 fallback，UI 必須顯示 elapsed 與失敗類別。3 秒是失效保護，不是日常延遲目標。
- model／artifact 可大於舊 compact browser 假設，但需量測載入、resident memory、更新、版本相容與 rollback，不因「可大」而無界成長。

## 目標目錄

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
    src/recipes/
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
  policy-lab/
    src/reachableStates.ts
    src/labelStates.ts
    src/compactScorer.ts
    src/consistentRolloutPlanner.ts
    src/evaluatePolicy.ts
  protocol/
    src/sessionEvents.ts
    src/debugExport.ts
    src/modelVersions.ts

tools/
  train-policy/
  evaluate-rollout-planner/
  evaluate-policy/
  import-player-trace/

tests/
  fixtures/
  golden-traces/
  statistical/
```

可以分階段建立，不需空建所有目錄。目前已建立 `apps/web`、`packages/domain`、`packages/data`、`packages/protocol`、`packages/solver`、`packages/simulator`、`packages/policy-lab`、training／evaluation tools、tests 與 GitHub Pages workflow。錠、釘、硬化木板與高空作業用腳手架四個 policy 的單一 owner 都位於 solver；共用 mechanics／session，但 recipe objective、config 與 policy version 分開。policy-lab 只 re-export 同一份 guide／certificate／bounded-risk 實作，web 不反向依賴 research package。第一版 research teacher 與 action-only scorer 均保留作負結果。大規模 cross-profile dataset、Playwright、failure／recovery golden traces 與真正 frozen validation 尚未完成。

## Dependency direction

```text
data ------> domain <------ protocol
               ^               ^
               |               |
solver ------> domain      web/session
  |             ^              |
  v             |              v
simulator ------+------> research worker -> recommendation UI
```

- `domain` 不依賴其他產品 package。
- `data` 提供 versioned profiles，不執行 UI／storage。
- `solver` 依賴 domain types／transition 與 data inputs，不反向被 domain import。
- `simulator` 只依賴 domain transition，policy 以 callback 注入；正式 runtime web 不 import training tools。
- `policy-lab` 可依賴 domain、simulator、solver baseline；solver／web 不得反向 import policy-lab。已選用的 guide-integrated runtime 已移入 solver，policy-lab 的同名 modules 只 re-export，避免研究與實戰邏輯漂移。
- `protocol` 定義 stable event／export contract，可引用 domain identifiers；避免引用 Vue types。
- `web` 組合 packages，不成為 mechanics owner。

## Route-consistent planning and training architecture

目前實戰路徑先用可解釋 guide、有限收尾證明與窄範圍風險比較；後續研究再以完整 episode／search visits 訓練 policy-value model。固定預算規劃可進本機 runtime；大規模 corpus 產生、訓練與 final statistical evaluation 仍只在離線工具執行。

```text
versioned recipe + verified mechanics + CrafterProfile population
  -> route options + policy-population episode traces
  -> reachable / boundary / recovery / mistake / live-trace states
  -> legal and meaningful root candidates
  -> candidate x continuation-policy paired full episodes
     using common condition/success random streams
  -> option/action visits + completion/stall/resource value targets
  -> train / validation / held-out split
  -> policy-value ensemble / option prior artifact
  -> full-episode baseline comparison + safety / OOD / latency gates
  -> versioned promotion or rejection
```

### Current implemented slice

- `packages/simulator`：deterministic condition／success random streams、可選 previous-condition transition weights 的 versioned condition profiles、`runEpisode` 與 `runEpisodeTrace`。目前三個 POC profiles 仍只有 assumed marginal weights；在玩家 trace 足夠前不得把 i.i.d. sensitivity 當真實轉移率。
- episode result 現在明確保存 `completed`／`failed`／`policy-null`／`no-legal-action`／`illegal-action`／`action-limit`，所有未完成都保留在 denominator；limit 以決策 action 數計，不冒充遊戲 craft step。
- `packages/solver/src/policySafety.ts`：runtime 與 offline policy 共用的最低安全閘門，排除 premature completion、非有效收尾的 durability failure、active Final Appraisal 零工次循環與無 finishing budget 的 repeated Observe；可恢復的 active buff refresh 與第一次 Observe 保持候選。
- `packages/solver/src/guideIntegratedPolicy.ts`：錠、釘、硬化木板與高空作業用腳手架的 runtime owner。四者共用 actual-history memory、certificate 與 safety primitives；objective、progress reserve、品質路線與 specialist finisher 由 scenario config 分開。腳手架兩個目前上線 policy 不推薦 specialist actions；這是本輪 validation 選擇，不是永久產品限制。
- `packages/solver/src/playerProfilePolicy.ts`：exact-profile policy override 的共用 owner。網站 worker 與 evaluator 必須走同一 resolver；附近數值與 OOD profile 不可默認繼承只在精確面板驗證過的 threshold。
- `packages/data/src/crafterProfiles.ts`／`hqChance.ts`：集中三組玩家實際面板，以及腳手架 community-derived provisional HQ utility。HQ 曲線不屬於 mechanics oracle，必須與完成率分開報告。
- `packages/data/src/recipes/elevatingPlatforms.ts`：Recipe 36205／Item 48263 木板以 14900 必要品質驅動；Recipe 36208／Item 48311 成品以 22500 HQ 品質上限驅動，但品質未滿仍 completed。兩者可用 conditions 明確為 Normal／Good／Good Omen／Sturdy／Pliant／Malleable／Primed。
- `packages/domain/src/transition.ts`：Good Omen 在下一個 advancing action 後強制 condition 為 Good；Primed 使當步新套用的持續 buff 增加 2 steps。recipe 可用 condition set 由 data 注入，不再假設全配方六種球。
- `apps/web/src/scenarios.ts`：UI／worker 的配方註冊表；一個 scenario 明確綁定 `RecipeProfile`、`CraftObjective`、planner kind／version／config、item icon、pilot 裝備與 development equipment envelope。新增配方不得再把 identity 或目標常數散落在 `App.vue`、session composable 或 worker。exact／envelope 內 profile 只能標 `near-boundary`，因尚無 frozen validation；不相容或越界則標 OOD。
- `apps/web/src/workers/guidePlanner.worker.ts`：request 只傳 `scenarioId` 與 session state；worker 由 registry 解出 recipe／objective／planner。主執行緒以 request ID 忽略舊結果，`3000ms` watchdog 會 terminate worker 並呼叫 `cosmic-craft-objective-lookahead-fallback-v1.5.0`。worker error／null result 可立即 fallback；兩條路徑的 elapsed／reason 分開保存。undo、reload 與玩家偏離都由 event history 重建。
- `packages/policy-lab/src/policyPopulation.ts`：target、Pliant refresh、budgeted condition fishing、lookahead baseline、guide greedy、progress commit、quality commit、resource safe 等 sampling／continuation policies。
- `reachableStates.ts`：從完整 episode 擷取 state，按 progress、quality、durability、CP、condition、combo 與精確主要 buff duration 去重，並在來源 policy 間輪替取樣。
- `labelStates.ts`：排除 illegal 與可證明的 catastrophic／loop actions，對所有其餘 root actions 與所選 continuation policy 跑 paired full episodes。
- `objective.ts`：接受 recipe-specific `CraftObjective`，以其正值 quality target 計算 viability；mechanics `requiredQuality=0` 的 adaptive recipe 若未提供 objective 會直接拒絕。其後依 worst-profile completion、average completion、lower-tail viable progress／quality balance、hard-stop rate、average viable balance、成功後 CP／durability 比較；`failed`／`policy-null`／`no-legal-action`／`illegal-action` 的 finishability 固定為 0，只有正常截斷的 `action-limit` 可保留 horizon surrogate，且只有雙方有成功 episode 才比較成功步數。
- `features.ts`／`compactScorer.ts`：47 維 feature schema（含 mechanics-derived base gain、CP 絕對尺度、craftsmanship boundary、cosmic tool flag 與 condition／buff／phase interactions）及 64 hidden-unit deterministic action classifier POC。
- `evaluatePolicy.ts`：完整 episode held-out evaluator 與 strict promotion decision。
- `tools/train-policy`：固定目標裝備的可重現 batch runner，保存 manifest／checkpoint／artifact／report；checkpoint 必須完整匹配 objective、recipe、CrafterProfile、seed、condition profiles、policy population 與 horizon，拒絕混接不同實驗 labels。artifact 也保存 exact recipe／CrafterProfile／objective／feature schema，profile 不符即拒絕推論；長跑不進 Vitest。
- `consistentRolloutPlanner.ts`／`continuationMpcPlanner.ts`／`tools/evaluate-rollout-planner`：可分別測 single continuation one-step improvement、每步重選 heuristic continuation、整場固定 heuristic continuation，並以 per-episode policy factory 隔離 stateful context。CLI 的 outer action limit 與 inner rollout horizon 分開，會隨剩餘 action budget 縮短；inner／outer continuation 共用 safety projection 與 explicit fallback，輸出 corpus role、assumed condition evidence、paired wins、完整 RouteScore、safety violations、stop reasons、null plans 與 latency。single／committed variants 是 negative controls；每步 MPC 有初步正向 regression signal，但仍不是正式 option controller。
- `routeOptionController.ts`／`routeOptionPlanner.ts`：研究用 `video-informed-mainline-v1` option contract，保存 7 個固定 option IDs、serializable memory、status／termination、action budget、recovery／fishing resume 與 observed-transition advance；每個 option 有少量合法、安全候選與 paired rollout adapter。它尚未在未看資料上勝過 guide-integrated runtime，因此未接 web。

舊 action-only 路徑只證明資料流與結構性負結果；目前網站已接入錠 v1.2.0、釘 v1.3.0、木板 v1.1.0、腳手架 v1.2.0。三組 exact 玩家面板為 `5408／5140／630`、`5408／5237／749`、`5428／5257／764`，皆宇宙工具 ON；最後一組已含專家證。玩家 95 球 empirical marginal 與 assumed condition profiles 仍是 IID sensitivity，不是真實 transition oracle。2026-08-12 已查看的 frozen corpus只能保留為本輪 promotion／後續 regression 證據；reserved-final 尚未使用，不得因名稱含 frozen 就把假設模型數字稱為玩家實戰成功率。

### CrafterProfile generalization boundary

目前 feature schema 已能區分 mechanics-derived base progress／quality、current／max CP、craftsmanship boundary、`cosmicToolGoodBonus` 與主要 condition／buff interactions，測試也保護不同裝備不再得到相同 vector；但這只移除表示能力 blocker，**尚未建立跨裝備泛化證據**。目前 labels 仍只來自單一目標 `CrafterProfile`，在完成 profile-grouped split、cross-profile benchmark 與 OOD router 前，不得把模型描述成適用所有玩家。

正式 feature schema 至少應加入：

- 由 authoritative mechanics 計算的 base progress／recipe progress ratio；
- base quality／required quality ratio；
- current CP 與 max CP 的絕對尺度及比例；
- craftsmanship 相對 recommended craftsmanship 的位置；
- cosmic tool Good bonus；
- 若 promotion scope 擴到多 recipe，再加入 recipe／family identity 或改用 recipe-specific artifact。

優先使用 mechanics-derived gain features，而不是只餵 raw craftsmanship／control，因為 FFXIV 取整會形成離散 decision boundary。若單一 conditional model 在裝備邊界的 tail performance 不穩定，可比較按 `(baseProgress, baseQuality, maxCp, toolBonus)` equivalence class／bucket 的小型 artifacts；不要預設一個 universal model 一定比較好。

dataset split 必須以完整 `CrafterProfile` 分組，不能把同一裝備產生的 state 隨機散到 train 與 held-out。訓練集需覆蓋最低可行、常見、中高、上界與 CP 邊界；held-out 保留未見過的內插、邊界與極端 profile。promotion 同時檢查 overall、每個 profile、worst profile／worst decile；profile 超出 artifact 宣告的 stat envelope 時顯示 OOD 並 fallback，不外插成高信心建議。

### Artifact contract target

正式 artifact 至少保存：

- artifact／feature schema／mechanics／recipe／condition-profile／objective versions；
- recipe scope、CrafterProfile training envelope 與 OOD rules；
- dataset manifest、split seed、training seed、policy population IDs 與 label budget；
- weights／biases、option schema 或其他 planner／model parameters；
- baseline 與 candidate 的 overall、per-profile、worst-tail、safety、OOD、latency 結果；
- promotion decision、拒絕理由與可回退的前一版本。

runtime 只讀取已 promotion 的 immutable artifact；training package 與 dataset 不進 client bundle。artifact 缺失、版本不符、profile OOD 或安全檢查失敗時，明確 fallback 到 versioned guide／lookahead policy。

## Runtime data flow

```text
SessionEvent[]
  -> replay/reducer
  -> MissionState + CraftState
  -> scenario registry -> recipe + objective + planner config
  -> recommend(...)
  -> Recommendation
  -> player action and observed outcome
  -> append events
```

- `craftStarted` 後由 session layer 自動 append `conditionSelected(normal)`，所以所有新 craft 第一手固定 Normal；舊的 untouched v0.6／v0.7 start 也明確 migration 成此事件序列。之後 runtime 仍由 `conditionSelected` 記錄玩家指定的本步球色；沒有本步球色時 recommendation／action 皆鎖定。
- 主推薦不另設「我已施放」：必定成功技能可直接點 `nextCondition`，同一操作依目前 recommendation 依序 append `craftActionUsed`／`craftActionResolved`、套用 `applyObservedOutcome` 並啟動下一次 recommendation；若該 outcome 已確定進入 terminal，則直接結算且不詢問不存在的 next condition。非 100% 技能先取得 outcome 才決定結算或開放球色。玩家若改用其他技能，從次要 action panel 明示實際 action 後進入原本的 unresolved 流程。
- `noStep && !rerollsCondition` 的 action 只允許「球色不變，繼續」，resolved event 強制保存 current condition；`rerollsCondition=true` 才接收使用者回報的新 condition。
- `enumerateActionOutcomes` 供 simulator／evaluation 使用。
- event replay 是 debug、undo、resync、import 與 model migration 的共同基礎。

## Execution boundaries

### Main thread

- state input、recommendation render、keyboard interaction、快速 fallback。
- 強規劃器在 worker／native boundary 執行；主 UI 不阻塞，主要體驗目標 p95 `< 1s`，web 在 3 秒硬上限終止 worker 並回退，不做 network request。

### Worker／native planner／offline tool

- batch rollout、large statistical evaluation、policy fitting／distillation、heavy debug distribution。
- research-teacher Web Worker code 保留作研究工具，但 `RESEARCH_TEACHER_PROMOTED=false` 時不得由玩家 runtime 啟動。第一版已因實戰退化停用。
- promotion 後的 runtime 可執行 bounded option MPC 或 policy-value inference；完整 corpus／訓練仍不得搬進玩家 session。

### Future WASM boundary

- 只有 TypeScript episode throughput 不足且 profiler 指向 transition／rollout core 時才考慮 Rust／WASM。
- 移植 batch transition／rollout hot path，不另寫一套 UI-facing mechanics。
- TypeScript 保留 oracle；需要逐步 parity、shared fixtures 與 model version bump。

## Persistence and privacy

- 預設 local-first；session、settings、policy artifact 與少量 replay 可保存在目前平台的本機 storage。
- 完整 debug export 由使用者明確下載，不自動上傳。
- export 應支援移除角色名、時間或其他不必要識別資料；golden trace 只保存驗證 mechanics 所需欄位。
- 未來若加入 telemetry／cloud sync，需獨立取得使用者授權、定義資料邊界與更新文件。

## Model versions

最低建議：

```ts
interface ModelVersions {
  mechanics: string;
  scenarioPolicies: Readonly<Record<string, string>>;
  conditionProfiles: string;
  sessionCodec: string;
}
```

分享、debug export、policy artifact 與 golden trace replay result 都帶 versions。app package version 不取代 model versions。

## Hosting 與 CI

- 產品應可 static build 且 local-first，方便部署到 static hosting。
- 目前部署是 GitHub Pages；`.github/workflows/deploy-pages.yml` 在 `main` push／manual dispatch 時執行 `npm ci`、unit tests、typecheck＋Vite build，以 `/<repository-name>/` 作 base path，再上傳 `apps/web/dist` 並部署 Pages artifact。
- 公開頁面為 `https://emu-rabbit.github.io/frozen_rabbit_expert/`；工作樹中的腳手架與 UI 改動在 commit／push 前不會出現在公開版。
- Playwright 與 statistical／benchmark 可依 phase 分開執行；正式 release 仍需 browser smoke、rollback 與 asset/license checklist。
