# 技術架構與目標邊界

## 文件狀態

`last_verified: 2026-08-25`

目前 repository 已有 432 個宇宙探索高難配方／50 個 mechanics families 的 catalog、scenario-based manual-condition UI、位於 `packages/solver` 的 TypeScript generic risk-aware runtime、Web Worker timeout／fallback 邊界，以及 simulator、offline `policy-lab`、sealed evaluation contracts 與 native batch research kernel。全部 recipe mechanics binding 目前為 mechanics-ready，recommendation 只屬 development-preview；舊五配方 guide 是 historical teacher／regression，不是 Web runtime。2026-08-25 已採納 Rust-primary 遷移方向，但完整 generic solver、closed-loop evaluator 與 Web WASM 尚未實作，不能把目標架構寫成目前能力。

## 預設 stack

延續 Frozen Rabbit 系列、並配合 local real-time policy：

- TypeScript，strict mode；負責 Web、session、protocol、catalog／data、runner orchestration 與遷移期 oracle。
- Rust；目標為 mechanics、generic policy、`PlannerContext` 與 closed-loop episode 的單一權威 compute core，供 native batch 與 WebAssembly 共用。
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
- 目標架構允許較強規劃器使用固定預算、p95 `< 1s` 的本機計算；目前 web watchdog 常數為 `3000ms`，用滿上限才終止 worker 並標示 timeout。2026-08-24 的 generic slice 中，Worker 與同步 fallback 執行同一 generic policy，前者只提供 UI 隔離；worker 啟動／執行 error 或 null result 可立即 fallback，UI 必須顯示 elapsed 與失敗類別，不得標成不同強度策略。未來若加入獨立快速 policy，再分開量測 p95 `<50ms` gate。3 秒是失效保護，不是日常延遲目標。
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

可以分階段建立，不需空建所有目錄。目前已建立 `apps/web`、`packages/domain`、`packages/data`、`packages/protocol`、`packages/solver`、`packages/simulator`、`packages/policy-lab`、`native/craft-kernel`、training／evaluation tools、tests 與 GitHub Pages workflow。`packages/data/src/cosmicExpertCatalog.ts` 與 generated snapshot 擁有 432 個 recipe identity／objective／condition binding；`packages/solver/src/recommend.ts` 仍是目前 Web generic runtime owner，v0.5.1 只保留為昨晚 historical outcome baseline。deterministic TS identity 只作 bounded migration similarity reference；Rust 現為 offline solver owner，此後不與 TS policy 同步演進。舊 guide／certificate／bounded-risk API 只供離線 teacher、歷史重播與 regression，Web 不反向依賴 research package。大規模 cross-profile dataset、Playwright、failure／recovery golden traces 與真正 frozen validation 尚未完成。

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

上圖是目前 TypeScript checkout 的 dependency。Rust／WASM cutover 後，`packages/domain` 保留 DTO、schema、fixtures 與 migration oracle；authoritative preview／transition、RNG、terminal、solver 與 replay compute 都經同一 Rust core。Web 的 action resolution、undo／resync replay 與同步 fallback 也透過 WASM adapter，不在 TypeScript 留另一份 live mechanics。

- `domain` 不依賴其他產品 package。
- `data` 提供 versioned profiles，不執行 UI／storage。
- `solver` 依賴 domain types／transition 與 data inputs，不反向被 domain import。
- `simulator` 只依賴 domain transition，policy 以 callback 注入；正式 runtime web 不 import training tools。
- `policy-lab` 可依賴 domain、simulator、solver baseline；solver／web 不得反向 import policy-lab。歷史 guide／certificate／bounded-risk helpers 由 solver 單獨擁有，policy-lab 可直接引用作 comparator，不建立只轉送 export 的影子 owner。
- `protocol` 定義 stable event／export contract，可引用 domain identifiers；避免引用 Vue types。
- `web` 組合 packages，不成為 mechanics owner。

目標 compute dependency 另固定為：

```text
versioned recipe + objective + profile + state + risk
  -> versioned compute ABI
  -> Rust mechanics + generic policy + PlannerContext + closed-loop episode
  -> native batch adapter | WASM adapter
  -> shard outcomes / Recommendation
```

Node／TypeScript runner 只負責 case planning、shard、lock／retry／resume、atomic persistence 與報告彙整；Web 只負責 session、輸入與呈現。兩者都不得逐 action 跨 native／WASM boundary，也不得另外維護一份會持續演進的 solver semantics。

## Route-consistent planning and training architecture

目前實戰路徑使用可解釋、讀取 recipe／objective／實際裝備／risk preference 的 generic recommendation；有限收尾證明與歷史 guide 只可作候選訊號或離線 comparator，不再控制 Web route。固定預算規劃可進本機 runtime；大規模 corpus 產生、訓練與 final statistical evaluation 仍只在離線工具執行。

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

- `packages/simulator`：deterministic condition／success random streams、可選 previous-condition transition weights 的 versioned condition profiles、`runEpisode` 與 `runEpisodeTrace`。各 recipe family 的 assumed profiles 都只作 sensitivity；巨匠藥另有只含 Normal／Good／Malleable 的三個 profile。玩家 trace 足夠前不得把 i.i.d. weights 當真實轉移率。
- episode result 現在明確保存 `completed`／`failed`／`policy-null`／`no-legal-action`／`illegal-action`／`action-limit`，所有未完成都保留在 denominator；limit 以決策 action 數計，不冒充遊戲 craft step。
- `packages/solver/src/policySafety.ts`：runtime 與 offline policy 共用的最低安全閘門，排除 premature completion、非有效收尾的 durability failure、active Final Appraisal 零工次循環與無 finishing budget 的 repeated Observe；可恢復的 active buff refresh 與第一次 Observe 保持候選。
- `packages/solver/src/recommend.ts`：`generic-craft-route-objective-condition-v0.6.0-migration-oracle` 的暫時 Web TS owner；v0.5.1 只保留 historical outcomes。v0.6.0 保留既有策略層次，但將 bounded finisher 改為固定 per-root node budget，並以 versioned action ordinal／sequence／ASCII state-key order 鎖定 tie-break，只作 Rust migration similarity reference。它直接讀取 recipe、完整 objective、`CrafterProfile`／`CraftState`、實際 action history 與 stable／balanced／aggressive 偏好；共用 route core 管理作業、耐久、CP、品質循環與收尾，objective layer 選擇 hard requirement／verified tier／continuous quality floor，condition layer 再處理 Good、Pliant、Malleable、Robust 等當步機會。quality target 是效用，不可覆寫 mechanics `requiredQuality`。Good condition 下會拒絕無理由被 Precise Touch 支配的一般品質技能，soft-quality recipe 也不得在仍有資源時自願零品質完工。progress-only recipe 達 voluntary floor、Inner Quiet 10、耐久不高於一次完整 durability cost，且 Good 遇到已付 Great Strides／Innovation 時，會立即使用可證明仍保留 bounded guaranteed finisher 的 deterministic quality consumer，不用 Tricks 或 refresh 放棄 setup；品質飽和才直接執行 certificate。若 bounded certificate 不存在，pre-route contingent synthesis 只可取代沒有 funded quality consumer 的 setup；已有 guaranteed certificate 時不得用它提早截斷品質，其他 contingent completion 只在共用 route 與 lookahead 都回空後作最後 fallback。hard required-quality recipe 不套用此 delivery floor。這個版本會尊重已實際成立的 Observe combo，但在 explicit cross-step continuation token 完成前不會主動建立新的 Observe option。
- `packages/solver/src/guideIntegratedPolicy.ts` 同時保存一個已證實可閉環運作、但原先從五配方 POC 長出的 route engine，以及歷史 named configs／versions；`recommend.ts` 只重用其中 recipe-ID-independent 的 route／resource／finisher engine，config 由當次 recipe、objective、crafter 與 risk 推導，不呼叫 scenario resolver。`playerProfilePolicy.ts`、`guideScenarioPolicyRegistry.ts` 與五個 named config／version 只作 historical teacher／regression；Web worker、同策略同步 fallback 與 432 catalog 不依 recipe-specific resolver 或 exact-profile router。
- `packages/solver/src/adaptivePolicyProgram.ts`／`commandBrewAdaptiveProgram.ts`：保存可序列化 route-memory interpreter 與第一個 recipe-owned research artifact。它們證明 data program／observed transition／fail-closed contract，但尚未升格為 generic Web runtime；詳細結果留在 handoff，不作目前工作優先級。
- `packages/data/src/crafterProfiles.ts`／`hqChance.ts`：集中三組玩家實際面板，以及腳手架 community-derived provisional HQ utility。HQ 曲線不屬於 mechanics oracle，必須與完成率分開報告。
- `tools/import-cosmic-expert-recipes/run.mjs`／`packages/data/src/generated/cosmicExpertRecipes.generated.ts`／`cosmicExpertCatalog.ts`：以 pinned WKS membership 與 XIVAPI snapshot 生成 432 個 Cosmic expert recipe identities，按真正影響求解的 recipe／condition／objective 欄位分成 50 個 mechanics families。`craftScenarioData.ts` 與舊 recipe modules只提供五個已知中文名稱／objective overlay，不是 live catalog 邊界。
- `packages/domain/src/transition.ts`：Good Omen 強制下一個 advancing action 後為 Good；Robust 當步像 Sturdy 減半 durability，且下一個 advancing action 後強制 Sturdy；兩種 forced transition 都不消耗 condition RNG。Primed 使當步新套用的持續 buff增加 2 steps；`randomConditions` 與 forced-reachable `availableConditions` 分開。
- `apps/web/src/scenarios.ts`：從 432-entry data catalog 組合單一 generic planner binding、presentation fallback、pilot 裝備與 development envelope。完整清單可搜尋名稱、職業與 recipe ID；所有 entries 的 catalog maturity 是 mechanics-ready，recommendation maturity 是 development-preview。
- `apps/web/src/workers/genericPlanner.worker.ts`：呼叫 generic `recommendAction` 並回傳完整 recommendation。主執行緒以 request ID 忽略舊結果；`3000ms` watchdog、worker error 或 null result 會使用同一 generic recommendation 同步備援。兩者皆為 null 時 UI 明示「無可用推薦」並開放手動合法技能／resync，不再永久顯示 spinner。

### Offline research archive
- `packages/policy-lab/src/policyPopulation.ts`：target、Pliant refresh、budgeted condition fishing、lookahead baseline、guide greedy、progress commit、quality commit、resource safe 等 sampling／continuation policies。
- `reachableStates.ts`：從完整 episode 擷取 state，按 progress、quality、durability、CP、condition、combo、buff duration 與所有 specialist 一次性資源去重，並在來源 policy 間輪替取樣。來源 policy 必須先綁定明示 objective；空白或重複的 policy／condition-profile identity 直接拒絕，不能把不同證據靜默合併。
- `labelStates.ts`：排除 illegal 與可證明的 catastrophic／loop actions，對所有其餘 root actions 與所選 continuation policy 跑 paired full episodes。每筆 label 保存 `objectiveId`，空白或重複的 policy／condition-profile identity 直接拒絕。
- `objective.ts`：接受 recipe-specific `CraftObjective`，以其正值 quality target 計算 viability；mechanics `requiredQuality=0` 的 adaptive recipe 若未提供 objective 會直接拒絕。其後依 worst-profile completion、average completion、lower-tail viable progress／quality balance、hard-stop rate、average viable balance、viable progress／quality、成功手數、剩餘 CP／耐久比較；`failed`／`policy-null`／`no-legal-action`／`illegal-action` 的 finishability 固定為 0，只有正常截斷的 `action-limit` 可保留 horizon surrogate，且只有雙方有成功 episode 才比較成功手數。`scenario-objective-completion-viability-lexicographic-v8` 明確讓同等完成／目標結果的較短路線優先於多留 CP／耐久。
- `features.ts`／`compactScorer.ts`：60 維 feature schema v5，使用 objective target 而非 mechanics `requiredQuality` 作品質尺度，明確 one-hot 九種 condition（含 Robust）、裝備離散 gain、CP／craftsmanship 邊界與所有 specialist 一次性資源；所有值須有限。compact scorer v0.9 會鎖 objective、feature、mechanics model、normalized exact crafter、recipe-specific mechanics signature、action schema 與 tensor shape，舊 artifact 必須重訓，不得靜默載入。
- `evaluatePolicy.ts`／`corpusSeal.ts`：population held-out evaluator 由 validated population／split 推導 crafter、group、role 與 recipe×group initial-state binding；seed 與 initial-state 內容、population、split、corpus manifest 分別以可信預期 hash 鎖定，uint32 seed 的成員重疊與同 ID 換內容都會拒絕。candidate factory 只收到 runtime 可觀測且 deep-frozen 的 crafter，不會看到 held-out／reserved 標籤、corpus ID 或 initial states。report 保存 detached evaluation identity、三份 manifest hash、per-crafter／worst-tail、安全與 latency。這些是防止資料洩漏與事後換樣本的 evidence contract；repository 仍沒有真正未見且可由可信 loadout calculator 重播的裝備 population，因此不能把 contract 本身稱為 promotion evidence。
- `crafterPopulation.ts` 與 domain `mechanicsSignature.ts`：完整裝備面板先正規化，再按整組 stats 分割 train／validation／held-out／reserved／OOD；recipe-specific signature 鎖 canonical mechanics version、取整後 base gains、CP、宇宙工具、specialist access 與 empirical correction。population／split content hash 會鎖 role、family 與 recipe×group corpus mapping；boundary probe 只能由 `regressionSeen`／`train` 基底衍生，不能借用 held-out／reserved 裝備。現有 versioned-calculator provenance validator仍只驗結構與宣告 hash，沒有載入外部 item／meld 資料重算；相同 signature 也只表示 mechanics 等價，不表示 policy 已有 coverage。
- `tools/train-policy`：checkpoint v6 與 compact artifact 保存 objective、feature、mechanics／signature identity；stale checkpoint／artifact 明示需要重訓。長跑不進 Vitest。
- `consistentRolloutPlanner.ts`／`continuationMpcPlanner.ts`／`tools/evaluate-rollout-planner`：可分別測 single continuation one-step improvement、每步重選 heuristic continuation、整場固定 heuristic continuation，並以 per-episode policy factory 隔離 stateful context。CLI 的 outer action limit 與 inner rollout horizon 分開，會隨剩餘 action budget 縮短；inner／outer continuation 共用 safety projection 與 explicit fallback，輸出 corpus role、assumed condition evidence、paired wins、完整 RouteScore、safety violations、stop reasons、null plans 與 latency。single／committed variants 是 negative controls；每步 MPC 有初步正向 regression signal，但仍不是正式 option controller。
- `routeOptionController.ts`／`routeOptionPlanner.ts`：研究用 `video-informed-mainline-v1` option contract，保存 7 個固定 option IDs、serializable memory、status／termination、action budget、recovery／fishing resume 與 observed-transition advance；每個 option 有少量合法、安全候選與 paired rollout adapter。它尚未在未看資料上勝過 frozen historical guide comparator，因此未接 web。
- `scenarioBeamPlanner.ts`：只保留為 optimistic existence／throughput negative control。它回答的是「某條預知抽樣結果的路線是否存在」，不是玩家當下可因果執行的成功率；不得拿來 promotion，也不得接 runtime。
- `causalRootMpcPlanner.ts`／`tools/evaluate-causal-root-mpc`：research-only 的單步 root MPC 候選與 closed-loop paired runner。environment RNG 與 planner RNG 使用獨立 namespace；baseline 與 candidate 共用 environment draws，planner 看不到外部模擬 seed。低於 2 samples 只回 safe guide baseline，輸入、完整 scenario model identity、workload、clock 與安全 invariant 都 fail closed。2026-08-20 的巨匠藥單場 development 診斷曾從 guide 的 25 手／12000 品質退化到 33 手／7869，p95 約 2.53 秒；這個負結果促成更保守的 objective-loss shield 與低樣本 gate，但尚沒有足夠 closed-loop 樣本證明候選變好，未接 web／runtime，也沒有 promotion。
- `adaptivePolicyEpisodeAdapter.ts`／`tools/evaluate-command-brew-cross-equipment`：將 simulator 的 first-action／callback 介面接到 data program 的 `decide／advance`，不傳入 seed、condition profile ID 或 evidence label。terminal／action-limit 後由 exact-once `observeFinalState` 補記最後一手，memory action count 必須與 episode trace 相同。2026-08-20 development-only 以三個 regression-seen panels、三個 plausible stochastic worlds、all-Normal／all-Malleable stress 共跑 1,344 場：全部完成、0 safety／risky failures；兩個強面板 896／896 滿品質。primary 的 adaptive program 為 `773／1152` 滿品質、`797／1152` 達 10200、`961／1152` 達 7200；對 released guide 的 raw quality 是 `120 wins／259 losses／773 ties`、平均差 `-319.07`、worst `-5433`。stress raw quality 為 `31／33／128`、平均差 `+157.45`。因此它證明共用 interpreter 與 conservative floor 可跨明示裝備範圍執行，兩個窄 Good 規則也確實改善先前候選，但無增益高尾仍退步，machine gate 繼續拒絕 default promotion。
- `tools/evaluate-command-brew-cross-equipment/riskEvaluation.ts`：development-only 的風險與復原評估 owner，版本 `command-brew-development-risk-evaluation-v2`。完整 coverage 固定綁 Command Brew development corpus、三組 regression panels、三個 plausible colored worlds、完整 128 seeds，以及兩個 catastrophe worlds 的至少 32 seeds；partial、空 stress、錯 corpus 或 frozen 重標都 fail closed。plausible worlds 逐 equipment／condition cell 檢查 7200／10200／12000、p10、平均品質與單場最差退步；catastrophe quality 只報告，不作 promotion veto。Observe 只有帶明示 fishing intent／目標 condition 的步驟才計數。外部 episode 會以 canonical Command Brew mechanics 逐步重算，但仍不證明 RNG origin 或 initial-state provenance，因此 formal promotion 永遠為 false。
- `commandBrewAggressiveOptions.ts`：把 released Command Brew guide 的實際 action history 分成 mainline、作業／品質風險、condition opportunity、fishing、burst、recovery 與 safe-finish，並保存 serializable risk counters、context／initial／last-state hash 與 audit budget。這是 profile-ID-independent 的行為分段／重播骨架，不是獨立 option FSM，也不改 guide action。完整 U development 384 場有 `355` 場至少一次風險失敗、總失敗 `1,643`、最多總下注 `17`、最長連敗 `8`，仍 `384／384` 完成；F／S 各 96 場都完成且滿品質。全部 576 場／16,209 transitions 與 released guide 的 action、outcome、state、tier 逐手一致，0 safety／budget mismatch。這證明下一版共用 program 必須保留「有計畫下注後復原」的能力，不能用全白低分 route 取代成熟行為。

舊 action-only、五配方 guide、Command Brew adaptive 與 exact-profile routes 只保存資料流、正負結果與 regression evidence；它們不再描述網站目前執行的 planner。詳細數字由 historical roadmap、scorecard 與 handoff 擁有，不能從本節反向建立產品優先級。

### CrafterProfile generalization boundary

目前已完成可表達未知裝備的 finite feature schema、裝備 population／grouped-split schema、recipe-specific mechanics signature，以及會鎖 population／split／seed／initial-state 內容的 held-out evaluator；但尚未收集真正未見過且可能存在、可由可信版本化 loadout 資料重播的裝備 population，也沒有 cross-profile paired benchmark 或 runtime OOD router，故**仍未建立跨裝備泛化證據**。現有三組 exact 玩家面板只能標 `regression-seen`，不能重新命名為 held-out。

目前 v5 feature schema 已包含：

- 由 authoritative mechanics 計算的 base progress／recipe progress ratio；
- base quality／objective quality target ratio；
- current CP 與 max CP 的絕對尺度及比例；
- craftsmanship 相對 recommended craftsmanship 的位置；
- cosmic tool Good bonus；
- specialist identity 與 CraftState 中所有一次性 specialist 資源；
- objective mode、target 與 mechanics required quality 的分離表示。

目前採 recipe-specific artifact，不用一個未驗證的 recipe family embedding 冒充跨配方泛化。

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

runtime 只讀取已 promotion 的 immutable artifact；training package 與 dataset 不進 client bundle。artifact 缺失、版本不符、profile OOD 或安全檢查失敗時，明確 fallback 到 versioned generic policy；舊五配方 guide 不是 live fallback。

## Runtime data flow

下圖是已採納的 target flow；目前 Web 仍直接呼叫 TypeScript `recommendAction`／`applyObservedOutcome`，要到 generic Rust core 與 WASM adapter 通過 migration gate 後才 cut over。

```text
SessionEvent[]
  -> TypeScript session / MissionState reducer
  -> Rust-WASM event replay / transition -> CraftState
  -> scenario registry -> recipe + objective + planner config
  -> generic compute adapter -> same Rust core (native / WASM target)
  -> Recommendation
  -> player action and observed outcome
  -> append events
```

- `craftStarted` 後由 session layer 自動 append `conditionSelected(normal)`，所以所有新 craft 第一手固定 Normal；舊的 untouched v0.6／v0.7 start 也明確 migration 成此事件序列。之後 runtime 仍由 `conditionSelected` 記錄玩家指定的本步球色；沒有本步球色時 recommendation／action 皆鎖定。
- `selectScenario` 對不同與目前 scenario 使用相同 restart contract：以目前 `CrafterProfile` 建立 step 1、零作業／品質、滿耐久／CP、Normal 的 initial state，只保留新的 start events，並由 UI 清除 pending feedback／關閉次要面板。此行為由 session-level 測試保護，不以 CSS 常數鏡像測試取代實際體驗。
- 主推薦不另設「我已施放」：必定成功技能可直接點 `nextCondition`，同一操作依目前 recommendation 依序 append `craftActionUsed`／`craftActionResolved`、套用 `applyObservedOutcome` 並啟動下一次 recommendation；若該 outcome 已確定進入 terminal，則直接結算且不詢問不存在的 next condition。非 100% 技能先取得 outcome 才決定結算或開放球色。玩家若改用其他技能，從次要 action panel 明示實際 action 後進入原本的 unresolved 流程。
- 每次結算輸入成功後，session mutation boundary 鎖住下一次結算球色 `750ms`；同一畫面與下一輪剛出現的按鈕都 disabled，第二次事件也會被 session 拒絕。restart／scenario switch／undo／resync 會清除鎖定，timer 在 scope dispose 清理。這是防連點的輸入安全，不改 event codec。
- `noStep && !rerollsCondition` 的 action 只允許「球色不變，繼續」，resolved event 強制保存 current condition；`rerollsCondition=true` 才接收使用者回報的新 condition。
- `enumerateActionOutcomes` 供 simulator／evaluation 使用；cutover 後由 compute adapter 進同一 Rust core。
- event replay 是 debug、undo、resync、import 與 model migration 的共同基礎；cutover 後 CraftState replay 由 Rust-WASM 執行，TypeScript 只編排與驗證 events。

## Execution boundaries

### Main thread

- state input、recommendation render、keyboard interaction；目前仍有 TypeScript 同策略同步 fallback。
- 目標 Web Worker 與主執行緒 fallback 都呼叫同一份 Rust→WASM compute core，不建立第二套 TypeScript solver。主 UI 不阻塞，主要體驗目標 p95 `< 1s`，web 在 3 秒硬上限終止 worker 並明示 fallback，不做 network request。

### Worker／native planner／offline tool

- 日間 bounded matrix、batch closed-loop rollout、large statistical evaluation、policy fitting／distillation、heavy debug distribution。
- research-teacher Web Worker code 保留作研究工具，但 `RESEARCH_TEACHER_PROMOTED=false` 時不得由玩家 runtime 啟動。第一版已因實戰退化停用。
- promotion 後的 runtime 可執行 bounded option MPC 或 policy-value inference；完整 corpus／訓練仍不得搬進玩家 session。

### Native／WASM boundary

- 2026-08-25 profiler 已證明完整 TypeScript overnight 的主要成本在 generic recommendation，且熱點是 route safety／certificate search，而非 episode 外層或報告格式；量測數值與解讀由 `algorithm_verification.md` 擁有。這已滿足新增 native layer 所需的 profiler 證據，但不構成 generic Rust 加速倍數證明。
- 最小有效 native 邊界是完整 generic closed-loop：在同一 Rust process 內反覆執行 `recommend -> RNG -> transition -> PlannerContext update -> terminal`，一次收整批 cases、只回 compact outcomes 與必要 traces。只搬 transition、逐 action IPC 或沿用 fixed continuation 都不算完成遷移。
- 正常 action selection 使用 canonical action ordering／tie-break 與固定 node／evaluation work budget；wall-clock 只作外層 abort／watchdog，不能使 CPU 速度、worker 數或熱降頻改變同一 case 的選招語義。
- v0.5.1 只作 historical outcome baseline；`generic-craft-route-objective-condition-v0.6.0-migration-oracle` 已以固定 work budget 與 canonical tie-break 移除 wall-clock／locale 漂移，只作一次性 migration reference。TS→Rust policy cutover 採 bounded behavioral similarity，不把逐行／逐招 exact port 當長期成本中心；mechanics／codec／RNG／terminal 仍 exact。Rust 已成為 offline solver 與策略 owner，Web 接入時持續 gate 轉為同一 Rust core 的 native↔WASM／TS wrapper exact parity。
- 日間 statistical iteration 與 overnight 使用同一 Rust solver；效能量測與長跑強制 release build。`native-generic-episode-batch-v2` 承載完整 closed loop；Node parent 只負責 catalog matrix、shard／lock／timeout／retry／resume／atomic persistence 與 report validation。native manifest 綁 execution engine、ABI、mechanics identity、兩個 Rust solver identity、binary handshake／SHA-256／content-address snapshot 與 evaluator bundle；缺失或不符時 fail closed，Rust crash／timeout 不得 fallback 到 TypeScript 長跑。正式 unattended run 另需 worker-calibration evidence；目前 CLI 只允許明示 `--native-preview`。
- live `native-transition-batch-v2`、`native-rollout-batch-v2` 與 `native-root-plan-matrix-v2` 使用完整 9×9 condition matrix，逐步比對 preview、outcome、state、explanation、兩條 RNG cursor、terminal 與 stop reason。54 個 transition cases 含 Robust fixture；10 個 rollout cases 與 12,000 個 root operations 已實跑 TS／Rust exact parity。這只證明 fixture 內規則一致，不取代 generic solver 遷移 gate、玩家 trace 或來源驗證。
- `native/craft-kernel` 已實作 dependency-free、禁止 unsafe 的 35-action transition、condition sampling、buff／specialist resources、terminal、fixed-action whole-rollout 與 root-candidate matrix。Robust 的 durability 減半、forced Sturdy 與不消耗 condition RNG 已納入 live v2 ABI。
- root-plan TS encoder 會從實際 recipe＋objective 重算 scenario content hash，不接受 caller 自報的舊 hash；一般 batch 在執行前限制整批最多 2,000,000 episodes、100,000,000 projected transitions、240 MiB projected output，benchmark 限 10,000,000 episodes／100,000,000 projected transitions。Rust binary 另核對實際 output bytes，超限整批 fail closed、不輸出 partial outcomes。
- 歷史 `native-adaptive-policy-matrix-v1` 保留八 condition wire；Rust 轉為九格 internal matrix，遇到 Robust initial state 明確 fail closed。它只服務 historical adaptive artifact parity，不是 432-entry generic runtime ABI。
- Rust generic solver 目前保存 v0.6～v0.18 的可選版本與 research probes；正式下一輪候選是 `generic-craft-opportunity-reserve-v0.18.0`，baseline 是 `generic-craft-capability-portfolio-mpc-v0.15.0`。v0.18 把 condition interrupt、progress reserve、quality／recovery／cashout／finish 串成一個可恢復跨步策略結構。Web 仍暫用 TS migration reference，尚未接 WASM；後續嚴正對齊的方向是 Rust native→同 core WASM／TS wrapper，不是讓 TS 與 Rust 兩套 policy 繼續各自演進。

## Persistence and privacy

- web app 只把使用者裝備數值保存在 localStorage；進行中的 craft、scenario、event path 與 UI state 只存在記憶體，重新整理一律從預設 scenario 的設定畫面開始。載入時會刪除舊版 session storage keys，避免既有資料恢復或干擾新版本。
- session event path 仍支援使用者主動下載 debug export，但不在 browser storage 自動保存。
- 完整 debug export 由使用者明確下載，不自動上傳。
- export 應支援移除角色名、時間或其他不必要識別資料；golden trace 只保存驗證 mechanics 所需欄位。
- 未來若加入 telemetry／cloud sync，需獨立取得使用者授權、定義資料邊界與更新文件。

## Model versions

最低建議：

```ts
interface ModelVersions {
  mechanics: string;
  plannerPolicy: string;
  recipeCatalog: string;
  conditionProfiles: string;
  sessionCodec: string;
}
```

分享、debug export、policy artifact 與 golden trace replay result 都帶 versions。app package version 不取代 model versions。

## Hosting 與 CI

- 產品應可 static build 且 local-first，方便部署到 static hosting。
- 目前部署是 GitHub Pages；`.github/workflows/deploy-pages.yml` 在 `main` push／manual dispatch 時執行 `npm ci`、unit tests、typecheck＋Vite build，以 `/<repository-name>/` 作 base path，再上傳 `apps/web/dist` 並部署 Pages artifact。
- `.github/workflows/native-parity.yml` 在 pull request、`main` push 與 manual dispatch 安裝 Rust／Node，執行 rustfmt、all-target Cargo tests、release build、TS parity bridge typecheck、fixed kernel/root parity 與 adaptive-program parity；Rust 無法編譯、native binary 缺失或任一 SHA／FNV／count 漂移時 CI 失敗。
- generic migration 落地後，同一 workflow 增加 deterministic generic decision／closed-loop parity、release binary identity 與 native↔WASM exact parity；不能以既有 fixed kernel/root parity 代替。
- 公開頁面為 `https://emu-rabbit.github.io/frozen_rabbit_expert/`；是否包含目前 432-entry catalog、generic planner、risk preference 與 recipe dialog 必須以 live smoke 驗證，不能由本機 checkout 或 commit 狀態推定。
- Playwright 與 statistical／benchmark 可依 phase 分開執行；正式 release 仍需 browser smoke、rollback 與 asset/license checklist。
