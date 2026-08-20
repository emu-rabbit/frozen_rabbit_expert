# 技術架構與目標邊界

## 文件狀態

`last_verified: 2026-08-20`

目前 repository 已有 scenario-based manual-condition UI、正式位於 `packages/solver` 的五個 recipe-specific guide-integrated runtime、Web Worker timeout／fallback 邊界，以及 Phase 2 simulator、offline `policy-lab`、sealed evaluation contracts 與 native batch research kernel。本文件同時描述 **current implementation** 與後續 POC target；所有 scenario 都不代表已通過 cross-profile／true-condition／held-out promotion gate。

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

可以分階段建立，不需空建所有目錄。目前已建立 `apps/web`、`packages/domain`、`packages/data`、`packages/protocol`、`packages/solver`、`packages/simulator`、`packages/policy-lab`、training／evaluation tools、tests 與 GitHub Pages workflow。錠、釘、硬化木板、高空作業用腳手架與宇宙探索用的巨匠藥五個 policy 的單一 owner 都位於 solver；共用 mechanics／session，但 recipe objective、config 與 policy version 分開。policy-lab 直接 import solver 的 guide／certificate／bounded-risk public API，不保留同名 forwarding modules；web 不反向依賴 research package。第一版 research teacher 與 action-only scorer 均保留作負結果。大規模 cross-profile dataset、Playwright、failure／recovery golden traces 與真正 frozen validation 尚未完成。

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
- `policy-lab` 可依賴 domain、simulator、solver baseline；solver／web 不得反向 import policy-lab。已選用的 guide-integrated runtime 與其 certificate／bounded-risk helpers 由 solver 單獨擁有；policy-lab 直接引用 solver public API，不建立只轉送 export 的影子 owner。
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

- `packages/simulator`：deterministic condition／success random streams、可選 previous-condition transition weights 的 versioned condition profiles、`runEpisode` 與 `runEpisodeTrace`。各 recipe family 的 assumed profiles 都只作 sensitivity；巨匠藥另有只含 Normal／Good／Malleable 的三個 profile。玩家 trace 足夠前不得把 i.i.d. weights 當真實轉移率。
- episode result 現在明確保存 `completed`／`failed`／`policy-null`／`no-legal-action`／`illegal-action`／`action-limit`，所有未完成都保留在 denominator；limit 以決策 action 數計，不冒充遊戲 craft step。
- `packages/solver/src/policySafety.ts`：runtime 與 offline policy 共用的最低安全閘門，排除 premature completion、非有效收尾的 durability failure、active Final Appraisal 零工次循環與無 finishing budget 的 repeated Observe；可恢復的 active buff refresh 與第一次 Observe 保持候選。
- `packages/solver/src/guideIntegratedPolicy.ts`：五個 recipe-specific runtime 的 owner。它們共用 actual-history memory、certificate 與 safety primitives；objective、progress reserve、品質路線與 specialist finisher 由 scenario config 分開。巨匠藥 v1.2.0 以滿品質 12000 為 objective，`requiredQuality=0` 仍只保留 mechanics 語意；bounded quality certificate 與 all-Normal 可證 route 只在仍有安全完工路線時延後收尾，Good／Malleable 局部替換也須逐步重證完整後綴，10800 guardrail 只是 provisional 800 分 proxy。v1.2.0 的 `allowSpecialistActions`／`useSpecialistFinisher` 都關閉；v1.1.0 與 checkpoint `827cf73` 的 v1.0.0 只作歷史基準。腳手架兩個目前上線 policy 也不推薦 specialist actions；這是各 recipe 的 validation 選擇，不是全產品永久規則。
- `packages/solver/src/playerProfilePolicy.ts`：exact-profile policy override 的共用 owner。網站 worker 與 evaluator 必須走同一 resolver；附近數值與 OOD profile 不可默認繼承只在精確面板驗證過的 threshold。
- `packages/solver/src/guideScenarioPolicyRegistry.ts`：五個 scenario 的 guide version／config 唯一 resolver。web、evaluation 與 causal planner 不再各自複製五份 mapping；binding 同時鎖 recipe／objective ID 與 `craft-scenario-model-identity-v1` 的完整內容 hash。即使 ID 沒變，只要 mechanics version、recipe 或 objective 內容漂移，研究 planner 也會在執行任何 episode 前 fail closed。
- `packages/solver/src/adaptivePolicyProgram.ts`：`craft-adaptive-policy-program-v1` 的唯一 runtime owner。它把策略表示成可序列化、可 hash 的節點、guard、ordered decisions 與 observed-only memory；每步只讀完整可觀測 state、crafter stats、objective 與 mechanics preview，選第一個 legal／safe action。`decide` 不改 memory，`advance` 只有在整筆 observed transition 通過 mechanics 與 state-continuity 驗證後才原子提交；context、program 與最後 observed state 都有內容 hash。這是跨配方共用的「策略語言／解讀器」，不是一份抹平配方差異的共同 rotation。
- `packages/solver/src/commandBrewAdaptiveProgram.ts`：第一個 recipe-owned data program，版本 `command-brew-conservative-adaptive-program-v0.1.0`。入口不看 equipment/profile ID，只接受 exact fresh state，並依 actual stats／preview 分流：(a) 明示強能力 envelope `craftsmanship 5350–5500／control 5215–5350／CP 748–780` 走 26 手 quality-first route；(b) 已證無增益面板 `5408／5140／630` 走 deterministic conservative route；其他輸入第一手前 fail closed。無增益支線另有兩個 route-consistent Good `Precise Touch` 規則；它們只在綁定的 route node、state envelope、action-use 與完整 preview safety 都成立時取代原品質技能，不是任意 Good 的全域反應。低於 12000 的完工只允許由三個明示 safe-finish decisions opt in。6839 deterministic floor 只在已知 100 分區，故該支線現為 recovery／negative control，不是可 promotion 的成功策略；下一版必須以 condition fishing、可恢復風險及 `>=10200` 命中為主。artifact 仍是 research-only，未取代 web 的巨匠藥 v1.2.0。
- `packages/data/src/crafterProfiles.ts`／`hqChance.ts`：集中三組玩家實際面板，以及腳手架 community-derived provisional HQ utility。HQ 曲線不屬於 mechanics oracle，必須與完成率分開報告。
- `packages/data/src/craftScenarioData.ts`：五個目前支援配方的 data-only owner，只綁 `scenarioId`、`RecipeProfile` 與 `CraftObjective`。solver config、evidence tier、UI 名稱與圖片仍由各自 package 擁有；data 不反向 import solver／web。`apps/web/src/scenarios.ts` 必須由這份 catalog 組合 recipe/objective，並以 drift guard 保護五組 identity。
- `packages/data/src/recipes/elevatingPlatforms.ts`：Recipe 36205／Item 48263 木板以 14900 必要品質驅動；Recipe 36208／Item 48311 成品以 22500 HQ 品質上限驅動，但品質未滿仍 completed。兩者可用 conditions 明確為 Normal／Good／Good Omen／Sturdy／Pliant／Malleable／Primed。
- `packages/data/src/recipes/surveyCraftsmansCommandBrew.ts`：只登錄 **【高難】製作工匠所需的複方藥** 第三件 Recipe 36582／Item 48570；作業 10000、耐久 55、品質上限 12000、`requiredQuality=0`，可用 conditions 為 Normal／Good／Malleable。`CraftObjective.qualityTarget=12000` 與暫定 10800 evaluator guardrail 都不回寫 mechanics 完成條件；前兩件與三件 mission controller 尚未支援。
- `packages/domain/src/transition.ts`：Good Omen 在下一個 advancing action 後強制 condition 為 Good；Primed 使當步新套用的持續 buff 增加 2 steps。recipe 可用 condition set 由 data 注入，不再假設全配方六種球。
- `apps/web/src/scenarios.ts`：UI／worker 的配方註冊表；一個 scenario 明確綁定 `RecipeProfile`、`CraftObjective`、planner kind／version／config、item icon、pilot 裝備與 development equipment envelope。新增配方不得再把 identity 或目標常數散落在 `App.vue`、session composable 或 worker。巨匠藥 envelope 只包含 development 中穩定滿品質的食藥非專家與食藥＋專家 stats exact profiles；無 buff 即使完成率高，也因滿品質只有 `145／384` 而標 OOD，不得標 `near-boundary`。envelope 內仍只能標 `near-boundary`，因尚無 frozen validation。setup／製作中只常駐目前配方的 compact control；完整清單由可搜尋、內部可捲動、具焦點管理與 dialog semantics 的 mobile bottom sheet 承載，避免 scenario 增加時擠壓主流程。選擇不同或目前 scenario 都建立全新的 initial state／Normal start events，清除 pending history，不能把「切換 identity」與「重新開始」拆成不一致路徑。
- `apps/web/src/workers/guidePlanner.worker.ts`：request 只傳 `scenarioId` 與 session state；worker 由 registry 解出 recipe／objective／planner。主執行緒以 request ID 忽略舊結果，`3000ms` watchdog 會 terminate worker 並呼叫 `cosmic-craft-objective-lookahead-fallback-v1.5.0`。worker error／null result 可立即 fallback；兩條路徑的 elapsed／reason 分開保存。undo 與玩家偏離由目前記憶體中的 event history 重建；page reload 不恢復 session。
- `packages/policy-lab/src/policyPopulation.ts`：target、Pliant refresh、budgeted condition fishing、lookahead baseline、guide greedy、progress commit、quality commit、resource safe 等 sampling／continuation policies。
- `reachableStates.ts`：從完整 episode 擷取 state，按 progress、quality、durability、CP、condition、combo、buff duration 與所有 specialist 一次性資源去重，並在來源 policy 間輪替取樣。來源 policy 必須先綁定明示 objective；空白或重複的 policy／condition-profile identity 直接拒絕，不能把不同證據靜默合併。
- `labelStates.ts`：排除 illegal 與可證明的 catastrophic／loop actions，對所有其餘 root actions 與所選 continuation policy 跑 paired full episodes。每筆 label 保存 `objectiveId`，空白或重複的 policy／condition-profile identity 直接拒絕。
- `objective.ts`：接受 recipe-specific `CraftObjective`，以其正值 quality target 計算 viability；mechanics `requiredQuality=0` 的 adaptive recipe 若未提供 objective 會直接拒絕。其後依 worst-profile completion、average completion、lower-tail viable progress／quality balance、hard-stop rate、average viable balance、viable progress／quality、成功手數、剩餘 CP／耐久比較；`failed`／`policy-null`／`no-legal-action`／`illegal-action` 的 finishability 固定為 0，只有正常截斷的 `action-limit` 可保留 horizon surrogate，且只有雙方有成功 episode 才比較成功手數。`scenario-objective-completion-viability-lexicographic-v8` 明確讓同等完成／目標結果的較短路線優先於多留 CP／耐久。
- `features.ts`／`compactScorer.ts`：59 維 feature schema v4，使用 objective target 而非 mechanics `requiredQuality` 作品質尺度，涵蓋八種 condition、裝備離散 gain、CP／craftsmanship 邊界與所有 specialist 一次性資源；所有值須有限。compact scorer v0.8 會鎖 objective、feature、mechanics model、normalized exact crafter、recipe-specific mechanics signature、action schema 與 tensor shape，舊 artifact 必須重訓，不得靜默載入。
- `evaluatePolicy.ts`／`corpusSeal.ts`：population held-out evaluator 由 validated population／split 推導 crafter、group、role 與 recipe×group initial-state binding；seed 與 initial-state 內容、population、split、corpus manifest 分別以可信預期 hash 鎖定，uint32 seed 的成員重疊與同 ID 換內容都會拒絕。candidate factory 只收到 runtime 可觀測且 deep-frozen 的 crafter，不會看到 held-out／reserved 標籤、corpus ID 或 initial states。report 保存 detached evaluation identity、三份 manifest hash、per-crafter／worst-tail、安全與 latency。這些是防止資料洩漏與事後換樣本的 evidence contract；repository 仍沒有真正未見且可由可信 loadout calculator 重播的裝備 population，因此不能把 contract 本身稱為 promotion evidence。
- `crafterPopulation.ts` 與 domain `mechanicsSignature.ts`：完整裝備面板先正規化，再按整組 stats 分割 train／validation／held-out／reserved／OOD；recipe-specific signature 鎖 canonical mechanics version、取整後 base gains、CP、宇宙工具、specialist access 與 empirical correction。population／split content hash 會鎖 role、family 與 recipe×group corpus mapping；boundary probe 只能由 `regressionSeen`／`train` 基底衍生，不能借用 held-out／reserved 裝備。現有 versioned-calculator provenance validator仍只驗結構與宣告 hash，沒有載入外部 item／meld 資料重算；相同 signature 也只表示 mechanics 等價，不表示 policy 已有 coverage。
- `tools/train-policy`：checkpoint v6 與 compact artifact 保存 objective、feature、mechanics／signature identity；stale checkpoint／artifact 明示需要重訓。長跑不進 Vitest。
- `consistentRolloutPlanner.ts`／`continuationMpcPlanner.ts`／`tools/evaluate-rollout-planner`：可分別測 single continuation one-step improvement、每步重選 heuristic continuation、整場固定 heuristic continuation，並以 per-episode policy factory 隔離 stateful context。CLI 的 outer action limit 與 inner rollout horizon 分開，會隨剩餘 action budget 縮短；inner／outer continuation 共用 safety projection 與 explicit fallback，輸出 corpus role、assumed condition evidence、paired wins、完整 RouteScore、safety violations、stop reasons、null plans 與 latency。single／committed variants 是 negative controls；每步 MPC 有初步正向 regression signal，但仍不是正式 option controller。
- `routeOptionController.ts`／`routeOptionPlanner.ts`：研究用 `video-informed-mainline-v1` option contract，保存 7 個固定 option IDs、serializable memory、status／termination、action budget、recovery／fishing resume 與 observed-transition advance；每個 option 有少量合法、安全候選與 paired rollout adapter。它尚未在未看資料上勝過 guide-integrated runtime，因此未接 web。
- `scenarioBeamPlanner.ts`：只保留為 optimistic existence／throughput negative control。它回答的是「某條預知抽樣結果的路線是否存在」，不是玩家當下可因果執行的成功率；不得拿來 promotion，也不得接 runtime。
- `causalRootMpcPlanner.ts`／`tools/evaluate-causal-root-mpc`：research-only 的單步 root MPC 候選與 closed-loop paired runner。environment RNG 與 planner RNG 使用獨立 namespace；baseline 與 candidate 共用 environment draws，planner 看不到外部模擬 seed。低於 2 samples 只回 safe guide baseline，輸入、完整 scenario model identity、workload、clock 與安全 invariant 都 fail closed。2026-08-20 的巨匠藥單場 development 診斷曾從 guide 的 25 手／12000 品質退化到 33 手／7869，p95 約 2.53 秒；這個負結果促成更保守的 objective-loss shield 與低樣本 gate，但尚沒有足夠 closed-loop 樣本證明候選變好，未接 web／runtime，也沒有 promotion。
- `adaptivePolicyEpisodeAdapter.ts`／`tools/evaluate-command-brew-cross-equipment`：將 simulator 的 first-action／callback 介面接到 data program 的 `decide／advance`，不傳入 seed、condition profile ID 或 evidence label。terminal／action-limit 後由 exact-once `observeFinalState` 補記最後一手，memory action count 必須與 episode trace 相同。2026-08-20 development-only 以三個 regression-seen panels、三個 plausible stochastic worlds、all-Normal／all-Malleable stress 共跑 1,344 場：全部完成、0 safety／risky failures；兩個強面板 896／896 滿品質。primary 的 adaptive program 為 `773／1152` 滿品質、`797／1152` 達 10200、`961／1152` 達 7200；對 released guide 的 raw quality 是 `120 wins／259 losses／773 ties`、平均差 `-319.07`、worst `-5433`。stress raw quality 為 `31／33／128`、平均差 `+157.45`。因此它證明共用 interpreter 與 conservative floor 可跨明示裝備範圍執行，兩個窄 Good 規則也確實改善先前候選，但無增益高尾仍退步，machine gate 繼續拒絕 default promotion。
- `tools/evaluate-command-brew-cross-equipment/riskEvaluation.ts`：development-only 的風險與復原評估 owner，版本 `command-brew-development-risk-evaluation-v2`。完整 coverage 固定綁 Command Brew development corpus、三組 regression panels、三個 plausible colored worlds、完整 128 seeds，以及兩個 catastrophe worlds 的至少 32 seeds；partial、空 stress、錯 corpus 或 frozen 重標都 fail closed。plausible worlds 逐 equipment／condition cell 檢查 7200／10200／12000、p10、平均品質與單場最差退步；catastrophe quality 只報告，不作 promotion veto。Observe 只有帶明示 fishing intent／目標 condition 的步驟才計數。外部 episode 會以 canonical Command Brew mechanics 逐步重算，但仍不證明 RNG origin 或 initial-state provenance，因此 formal promotion 永遠為 false。
- `commandBrewAggressiveOptions.ts`：把 released Command Brew guide 的實際 action history 分成 mainline、作業／品質風險、condition opportunity、fishing、burst、recovery 與 safe-finish，並保存 serializable risk counters、context／initial／last-state hash 與 audit budget。這是 profile-ID-independent 的行為分段／重播骨架，不是獨立 option FSM，也不改 guide action。完整 U development 384 場有 `355` 場至少一次風險失敗、總失敗 `1,643`、最多總下注 `17`、最長連敗 `8`，仍 `384／384` 完成；F／S 各 96 場都完成且滿品質。全部 576 場／16,209 transitions 與 released guide 的 action、outcome、state、tier 逐手一致，0 safety／budget mismatch。這證明下一版共用 program 必須保留「有計畫下注後復原」的能力，不能用全白低分 route 取代成熟行為。

舊 action-only 路徑只證明資料流與結構性負結果；目前網站已接入錠 v1.2.0、釘 v1.3.0、木板 v1.1.0、腳手架 v1.3.0、巨匠藥 v1.2.0。三組 exact 玩家面板為 `5408／5140／630`、`5408／5237／749`、`5428／5257／764`，皆宇宙工具 ON；最後一組已含專家證。巨匠藥 v1.2.0 只在固定 quality-first route 的完整剩餘路線仍可 100% 證明時，以 Good `Precise Touch` 取代局部品質技能，或以 Good `Intensive Synthesis`／Malleable 作業技能取代局部作業技能；品質提早滿時直接跳到已證明的作業 phase。exact 食藥非專家 frozen primary `768／768`、stress `128／128` 均完成且滿品質，paired 手數 `78` 較短／`0` 較長／`690` 相同；這些 IID sensitivity 不是實戰率，reserved-final 未使用。

### CrafterProfile generalization boundary

目前已完成可表達未知裝備的 finite feature schema、裝備 population／grouped-split schema、recipe-specific mechanics signature，以及會鎖 population／split／seed／initial-state 內容的 held-out evaluator；但尚未收集真正未見過且可能存在、可由可信版本化 loadout 資料重播的裝備 population，也沒有 cross-profile paired benchmark 或 runtime OOD router，故**仍未建立跨裝備泛化證據**。現有三組 exact 玩家面板只能標 `regression-seen`，不能重新命名為 held-out。

目前 v4 feature schema 已包含：

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
- `selectScenario` 對不同與目前 scenario 使用相同 restart contract：以目前 `CrafterProfile` 建立 step 1、零作業／品質、滿耐久／CP、Normal 的 initial state，只保留新的 start events，並由 UI 清除 pending feedback／關閉次要面板。此行為由 session-level 測試保護，不以 CSS 常數鏡像測試取代實際體驗。
- 主推薦不另設「我已施放」：必定成功技能可直接點 `nextCondition`，同一操作依目前 recommendation 依序 append `craftActionUsed`／`craftActionResolved`、套用 `applyObservedOutcome` 並啟動下一次 recommendation；若該 outcome 已確定進入 terminal，則直接結算且不詢問不存在的 next condition。非 100% 技能先取得 outcome 才決定結算或開放球色。玩家若改用其他技能，從次要 action panel 明示實際 action 後進入原本的 unresolved 流程。
- 每次結算輸入成功後，session mutation boundary 鎖住下一次結算球色 `750ms`；同一畫面與下一輪剛出現的按鈕都 disabled，第二次事件也會被 session 拒絕。restart／scenario switch／undo／resync 會清除鎖定，timer 在 scope dispose 清理。這是防連點的輸入安全，不改 event codec。
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

### Native／WASM boundary

- deterministic TS benchmark 已顯示整體 rollout／search 比單一 transition 更值得搬移；仍須在目標裝置重測，不能用開發機 smoke 直接決定 runtime。
- 移植 batch transition／rollout hot path，不另寫一套 UI-facing mechanics；一次送整批工作，在 native 內反覆運算，只回 aggregate 與少量 trace，避免逐步跨 process／WASM。
- TypeScript 保留 oracle；shared fixtures 逐步比對 preview、outcome、24 個 state 欄位、explanation、兩條 RNG cursor、terminal 與 stop reason。`native-transition-batch-v1` 現有 53 個 direct cases，逐一覆蓋 `ACTION_IDS` 的 35／35 actions；comparable SHA-256 為 `13d1792fe41e90f4e2763d1963b88d983f0f6a2816be2812a1a7ae76f8ca52c1`。這證明已列入 fixture 的單步規則與欄位一致，不取代玩家 trace／來源驗證。
- `native/craft-kernel` 已實作 dependency-free、禁止 unsafe 的 35-action transition、condition sampling、buff／specialist resources、terminal 與 fixed-action whole-rollout batch。10 個整段案例涵蓋五配方與三組 regression panels，另鎖 previous-condition 非 IID row selection與 no-step action budget；Rust／TS 的完整 comparable SHA-256 同為 `a7587b7a981742bbfeaca809a0f2a8d2e6c960126cb07c6ee39a13ebb82f6ccb`。2026-08-20 本機 release large batch 為 1,000,000 whole rollouts／2,900,000 transitions：TS 20,792.87ms，Rust timed core 1,216.29ms（17.10x），含 process startup／input／summary output 1,238.54ms（16.79x）；binary FNV-1a32 兩側同為 `ad543305`。
- `native-root-plan-matrix-v1` 再把工作單位推進到同一 state 下的多個 root candidates × paired seeds；每個 root 後接同一條 fixed continuation，由 Rust 在單一 process 內展開，TS 保留 objective、safety shield 與 tie-break。10 個 requests 的 full-trace SHA-256 為 `f7aceda68bf896c5e7672d1b0147c13b72c92a137677e71d1c0d8a01ebe76759`。兩次獨立重跑 1,000,080 candidate×seed episodes／5,800,464 transitions：TS 26,469.18～32,294.78ms，Rust core 2,340.52～2,479.59ms（11.31～13.02x），含 process startup／input 2,354.14～2,493.69ms（11.24～12.95x）；binary FNV-1a32 兩側同為 `283b6575`。
- root-plan TS encoder 會從實際 recipe＋objective 重算 scenario content hash，不接受 caller 自報的舊 hash；一般 batch 在執行前限制整批最多 2,000,000 episodes、100,000,000 projected transitions、240 MiB projected output，benchmark 限 10,000,000 episodes／100,000,000 projected transitions。Rust binary 另核對實際 output bytes，超限整批 fail closed、不輸出 partial outcomes。
- `native-adaptive-policy-matrix-v1` 是 root-plan 的 sibling protocol：Rust 讀取同一份 prepared `craft-adaptive-policy-program-v1` 資料，通用解讀 guard、preview、safety、settle、resume、flags 與 counters，每一步依實際 outcome 再決定下一手；Rust code 不含 Command Brew route 或 equipment/profile ID。最新巨匠藥 artifact 在 18 個 cases／386 個 transitions 中，兩條 Good `Precise Touch` 分支都有被走到，TS／Rust 逐手 action、node、decision、memory、完整 state 與 RNG cursor deep-equal；program hash 為 `sha256:8c2b70203b778545941e63f93e4a373ba6835b0fb91ec81d7c5ca4a910b9c087`，trace SHA-256 為 `86ff9a76979b0104d06827d4bc08f6f2c53dd035c97f5c72399b6cfc7d7cf87d`，structured FNV32 `7a048c19`、raw FNV64 `067a02f54de3ff2c`。此 checkpoint 證明共用 adaptive program 可由兩個引擎一致解讀，不代表策略已 promotion，也沒有用小樣本 timing 宣稱速度收益。
- 上述數字證明整批 fixed continuation 候選比較值得 native 化；它不代表 adaptive guide、MPC、beam、generic search、planner score／tie-break、runtime ABI 或 web runtime 已完成。`benchmark:kernels` 的 deterministic correctness payload 已鎖為 `38fcc67740c85d3339b2f298b657ae5891db9288e935b31d79854b4904c708b1`；開發機速度仍不是目標裝置 SLA。

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
  scenarioPolicies: Readonly<Record<string, string>>;
  conditionProfiles: string;
  sessionCodec: string;
}
```

分享、debug export、policy artifact 與 golden trace replay result 都帶 versions。app package version 不取代 model versions。

## Hosting 與 CI

- 產品應可 static build 且 local-first，方便部署到 static hosting。
- 目前部署是 GitHub Pages；`.github/workflows/deploy-pages.yml` 在 `main` push／manual dispatch 時執行 `npm ci`、unit tests、typecheck＋Vite build，以 `/<repository-name>/` 作 base path，再上傳 `apps/web/dist` 並部署 Pages artifact。
- `.github/workflows/native-parity.yml` 在 pull request、`main` push 與 manual dispatch 安裝 Rust／Node，執行 rustfmt、all-target Cargo tests、release build、TS parity bridge typecheck、fixed kernel/root parity 與 adaptive-program parity；Rust 無法編譯、native binary 缺失或任一 SHA／FNV／count 漂移時 CI 失敗。
- 公開頁面為 `https://emu-rabbit.github.io/frozen_rabbit_expert/`；是否包含目前五配方與 compact control／recipe dialog 必須以 live smoke 驗證，不能由本機 checkout 或 commit 狀態推定。
- Playwright 與 statistical／benchmark 可依 phase 分開執行；正式 release 仍需 browser smoke、rollback 與 asset/license checklist。
