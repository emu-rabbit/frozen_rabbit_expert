# 技術架構與目標邊界

## 文件狀態

`last_verified: 2026-08-11`

目前 repository 已有 Phase 0 application scaffold、固定配方的 manual-condition UI、Phase 1 單配方 guide／lookahead baseline，以及 Phase 2 第一段 episode simulator、被實戰拒絕的 paired-rollout research teacher 與 offline `policy-lab` POC。本文件同時描述 **current implementation** 與後續 POC target；尚未建立的批次訓練 CLI、dataset artifact 與正式 policy artifact 仍只是 target baseline。

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
    src/evaluatePolicy.ts
  protocol/
    src/sessionEvents.ts
    src/debugExport.ts
    src/modelVersions.ts

tools/
  train-policy/
  evaluate-policy/
  import-player-trace/

tests/
  fixtures/
  golden-traces/
  statistical/
```

可以分階段建立，不需空建所有目錄。目前已建立 `apps/web`、`packages/domain`、`packages/data`、`packages/protocol`、`packages/solver`、`packages/simulator`、`packages/policy-lab` 與 tests，並有一筆 TW 7.51 有限區段的 empirical regression。第一版 `cosmic-titanium-rollout-teacher-v0.1.0` 使用單一 greedy continuation，玩家實戰顯示跨步 buff／condition 決策退化，已停止 promotion。policy-lab 改用 policy population 產生完整 episode labels，並提供 compact scorer 與 held-out gate，但尚無通過 artifact。runtime 使用 `cosmic-titanium-lookahead-fallback-v1.1.1`；大規模 offline dataset、Playwright 與完整正式 golden traces 尚未建立。

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
- `simulator` 只依賴 domain transition，policy 以 callback 注入；目前 research-teacher POC 由 solver 組合 simulator 與 guide rollout policy。compact artifact promotion 後，正式 runtime web 不 import training tools。
- `policy-lab` 可依賴 domain、simulator、solver baseline；solver／web 不得反向 import policy-lab。訓練 artifact 只有通過 held-out promotion gate 後，才以獨立 versioned data 進入 runtime。
- `protocol` 定義 stable event／export contract，可引用 domain identifiers；避免引用 Vue types。
- `web` 組合 packages，不成為 mechanics owner。

## Offline practical-teacher training architecture

正式訓練採「離線完整 episode 搜尋／標註，線上 compact inference」兩層架構；不能把每一步的大量 rollout 搬進玩家 runtime。

```text
versioned recipe + verified mechanics + CrafterProfile population
  -> policy-population episode traces
  -> reachable / boundary / recovery / mistake / live-trace states
  -> legal and meaningful root candidates
  -> candidate x continuation-policy paired full episodes
     using common condition/success random streams
  -> completion-first route labels + alternatives
  -> train / validation / held-out split
  -> compact action scorer artifact
  -> full-episode baseline comparison + safety / OOD / latency gates
  -> versioned promotion or rejection
```

### Current implemented slice

- `packages/simulator`：deterministic condition／success random streams、weighted assumed condition profiles、`runEpisode` 與 `runEpisodeTrace`。
- `packages/policy-lab/src/policyPopulation.ts`：lookahead baseline、guide greedy、progress commit、quality commit、resource safe 五種 continuation policies。
- `reachableStates.ts`：從完整 episode 擷取 state，按 progress、quality、durability、CP、condition、combo 與主要 buff bucket 去重。
- `labelStates.ts`：排除 illegal、提前完成與明顯無效 buff refresh，對候選 action 與多個 continuation policy 跑 paired full episodes。
- `objective.ts`：以 worst-profile completion、average completion、failure、lower-tail progress／quality balance、成功後 CP／durability、steps 依序做 lexicographic comparison。
- `features.ts`／`compactScorer.ts`：28 維 state feature 與 deterministic softmax action classifier POC。
- `evaluatePolicy.ts`：完整 episode held-out evaluator 與 strict promotion decision。

目前這一層只證明資料流可以運作。兩筆玩家反例可得到 Rapid Synthesis／Precise Touch labels，但兩例 artifact 在 held-out evaluation 被拒絕；repository **沒有**可供 runtime 使用的 trained artifact，也沒有落地 dataset file、batch trainer CLI、cross-profile benchmark 或 artifact loader。

### CrafterProfile generalization boundary

現有 28 維 POC feature **不足以跨裝備泛化**。它只有 `state.cp / crafter.maxCp`，沒有 craftsmanship、control、max CP 絕對值、由 mechanics 算出的 base progress／base quality，或 `cosmicToolGoodBonus`。因此兩個裝備差異很大的玩家在相同 normalized state 下可能得到完全相同 feature vector，雖然技能實際收益與可行收尾線不同。在修正 feature schema 並建立 cross-profile evidence 前，不得把模型描述成適用所有玩家。

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
- weights／biases或其他 compact parameters；
- baseline 與 candidate 的 overall、per-profile、worst-tail、safety、OOD、latency 結果；
- promotion decision、拒絕理由與可回退的前一版本。

runtime 只讀取已 promotion 的 immutable artifact；training package 與 dataset 不進 client bundle。artifact 缺失、版本不符、profile OOD 或安全檢查失敗時，明確 fallback 到 versioned guide／lookahead policy。

## Runtime data flow

```text
SessionEvent[]
  -> replay/reducer
  -> MissionState + CraftState
  -> recommend(...)
  -> Recommendation
  -> player action and observed outcome
  -> append events
```

- runtime 由 `conditionSelected` 記錄玩家指定的本步球色；沒有本步球色時 recommendation／action 皆鎖定。
- `craftActionUsed` 後進入 unresolved 狀態；必定成功技能只自動填入成功，其餘由玩家回報 outcome，且所有技能都必須一併回報 `nextCondition` 才能 append `craftActionResolved`、套用 `applyObservedOutcome` 並解除下一步鎖定。
- `enumerateActionOutcomes` 供 simulator／evaluation 使用。
- event replay 是 debug、undo、resync、import 與 model migration 的共同基礎。

## Execution boundaries

### Main thread

- state input、recommendation render、keyboard interaction、short rule／model inference。
- recommendation 不做 network request，不等待大樣本 simulation。

### Worker／offline tool

- batch rollout、large statistical evaluation、policy fitting／distillation、heavy debug distribution。
- research-teacher Web Worker code 保留作研究工具，但 `RESEARCH_TEACHER_PROMOTED=false` 時不得由玩家 runtime 啟動。第一版已因實戰退化停用。
- promotion 後的 runtime policy artifact 仍需直接本機推論，且不得把逐步大量 rollout 當成 compact model 的永久替代。

### Future WASM boundary

- 只有 TypeScript episode throughput 不足且 profiler 指向 transition／rollout core 時才考慮 Rust／WASM。
- 移植 batch transition／rollout hot path，不另寫一套 UI-facing mechanics。
- TypeScript 保留 oracle；需要逐步 parity、shared fixtures 與 model version bump。

## Persistence and privacy

- 預設 local-first；session、settings、policy artifact 與少量 replay 可保存在 browser storage。
- 完整 debug export 由使用者明確下載，不自動上傳。
- export 應支援移除角色名、時間或其他不必要識別資料；golden trace 只保存驗證 mechanics 所需欄位。
- 未來若加入 telemetry／cloud sync，需獨立取得使用者授權、定義資料邊界與更新文件。

## Model versions

最低建議：

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

分享、debug export、policy artifact 與 golden trace replay result 都帶 versions。app package version 不取代 model versions。

## Hosting 與 CI

- 產品應可 static build 且 local-first，方便部署到 static hosting。
- hosting provider、base path、analytics、release branch 與 deploy workflow 尚未決定；不得因姊妹專案使用某服務就寫成既定架構。
- scaffold 時至少建立 typecheck、unit test、build；Playwright 與 statistical／benchmark 可依 phase 分開執行。
