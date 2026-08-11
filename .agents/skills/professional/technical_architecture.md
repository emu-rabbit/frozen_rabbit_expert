# 技術架構與目標邊界

## 文件狀態

`last_verified: 2026-08-11`

目前 repository 已有 Phase 0 application scaffold、固定配方的 manual-condition simulator，以及 Phase 1 第一版單配方 guide-prior＋lookahead recommendation。本文件同時描述 **current implementation** 與後續 POC target；尚未存在的 simulator batch／tooling 目錄仍只是 target baseline。

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

可以分階段建立，不需空建所有目錄。目前已建立 `apps/web`、`packages/domain`、`packages/data`、`packages/protocol`、`packages/solver` 與 tests，並有一筆 TW 7.51 有限區段的 empirical regression。solver 目前是 `cosmic-titanium-lookahead-policy-v1.1.0`：Teamcraft `guide-policy-v1` 提供 phase soft prior 與可中斷 quality options，固定預算 expectimax 對合法技能、成功／失敗及均衡未來 condition sensitivity 做 receding-horizon 比較；獨立 batch simulator、offline policy improvement tools、Playwright 與完整正式 golden traces 尚未建立。

## Dependency direction

```text
data ------> domain <------ protocol
               ^               ^
               |               |
solver ------> domain      web/session
   ^           ^               |
   |           |               v
simulator -----+----------> recommendation UI
```

- `domain` 不依賴其他產品 package。
- `data` 提供 versioned profiles，不執行 UI／storage。
- `solver` 依賴 domain types／transition 與 data inputs，不反向被 domain import。
- `simulator` 可使用 solver policy 與 domain transition，runtime web 不 import training tools。
- `protocol` 定義 stable event／export contract，可引用 domain identifiers；避免引用 Vue types。
- `web` 組合 packages，不成為 mechanics owner。

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
- 是否使用 Web Worker 由量測決定；即使採 worker，runtime policy artifact 仍需直接本機推論。

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
