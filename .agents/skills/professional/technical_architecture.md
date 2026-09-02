# 技術架構與計算所有權

## 文件角色

本檔定義 package、runtime 與語言所有權。會漂移的目前版本與待決事項只放在 [current_state.md](../../current_state.md)。

## 目前 ownership

~~~text
canonical data ──> packages/data
mechanics DTO／legacy fixtures ──> packages/domain
session protocol／replay contract ──> packages/protocol
frozen Web compute ──> packages/solver
current solver evolution ──> native/craft-kernel
selected Web compute boundary ──> native/craft-kernel-web ──> native/craft-kernel
UI／session orchestration ──> apps/web
evaluation orchestration ──> tools
~~~

舊 TypeScript solver 已凍結，只能作歷史參考與遷移 evidence。新的 mechanics／solver／planner memory／episode 改善與評測都以 Rust source 為 owner。

## Runtime 輸入與輸出

~~~text
RecipeProfile + CraftObjective + CrafterProfile
+ observed CraftState + actual action history
  -> legal actions／mechanics preview
  -> main or fast solver
  -> action + reasons + alternatives + elapsed／failure metadata
~~~

Web 不傳送玩家 state 到 server。Session controller 記錄實際事件，undo／resync 由 event path 重建。

## Rust 核心

`native/craft-kernel` 擁有目前演進中的：

- action／condition／transition／terminal mechanics；
- planner context 與 route intent；
- 主要求解與快速求解策略；
- whole-episode closed-loop compute；
- native evaluation protocols 與 deterministic work budget。
- recipe `qualityMax` 唯一品質上限、預設策略的完整品質 utility、protected floor 與 HQ 機率 utility。

Rust policy 可以有意地超越 frozen TypeScript 行為；TS→Rust 只需要事前定義的 outcome migration evidence，不要求永久逐招複製。

目前新架構核心位於 `native/craft-kernel/src/generic_solver/portfolio/`：types 定義候選與路線、producers 提出能力方案、scoring 建立分支及續作證據、selection 統一比較效果與不確定性成本，module 入口組合資料流。既有 Rust 能力透過 adapter 重用。Episode observer 取得同一次決策的唯讀診斷，實際 action／outcome 仍由 episode controller 推進。

Native binary、ABI、mechanics、solver、action schema 與 evaluation identity 不符時 fail closed。Node parent 可以負責 shards、locks、timeout、retry、resume、atomic persistence 與 report，但不能偷偷改用 TS evaluator。

## Web 採用決策

2026-08-30 選定 Rust→WASM：策略與 mechanics owner 保持 `native/craft-kernel`，`native/craft-kernel-web` 只擁有 versioned ABI、bounded buffer 與 session bridge。TypeScript wrapper 負責 DTO encoding、Worker lifecycle、deadline 與 UI mapping，不擁有策略。

決策依據不是預設 WASM 較快，而是實測 same-session corpus 0 action／context mismatch、Node-WASM 成本低於 main 3 秒 gate、raw artifact／memory 可控，並避免平行維護約 8,597 行現行 generic solver／portfolio 的 TypeScript 複本。完整數字與證據界線見 [Rust→WASM decision](../../../reports/web-runtime/rust-wasm-core-decision-20260830.md)。

`apps/web` 已在正式 UI 骨架切換到 persistent browser Worker，build 由 `tools/build-web-wasm/run.mjs` 產生並交給 Vite 打包的 WASM artifact；3 秒 watchdog 逾時會終止 Worker 並 fail closed。固定 Web fixture 已直接載入 production artifact、核對 ABI／v1.12 identity 並取得非空 action。target-device browser／mobile latency 仍待量測，不能把 Node-WASM 或單一 contract test 寫成產品效能 gate 已通過。若後續實機出現 boundary blocker，先定位 load、transfer、cache、memory 或 compute，再決定是否重開語言選擇。

## 目標雙求解器

### 主要求解器

- 每步最多等待 3 秒。
- 可使用較完整的 fixed-budget planning。
- 回傳理由、替代技能、elapsed 與明確 failure category。

### 快速求解器

- 和主要求解器共用 authoritative mechanics，但有獨立、可證明 bounded 的決策流程。
- 目標裝置 p95 小於 100ms，並報 p99／max。
- 合法非終局 state 仍有合法技能時不回傳空白。
- 接近預算時由最終 selector 掃描合法技能，依安全、完工路線與預設品質策略排序。
- 不使用 recipe-ID branch 或舊五配方 guide。

~~~text
main <= 3s
  -> result
  -> timeout／failure -> fast solver
player uses main／fast／manual legal action
  -> observed outcome
  -> next step retries main
~~~

快速求解器不是永久降級模式。兩個 solver 都必須接受玩家實際 history。

## Package dependency

~~~text
data ───────> domain
protocol ───> domain
simulator ──> domain
frozen solver ─> domain（歷史研究與 regression evidence）
web ────────> data + domain + protocol + craft-kernel-web WASM
policy-lab ─> domain + simulator + frozen historical solver
native core ─> own Rust types／protocols
tools ──────> owning packages or native binary
~~~

Web 已移除 frozen solver runtime dependency。依使用者 2026-08-30 決定，主 v1.12 先獨立接入並在 timeout／Worker／WASM failure 時明確 fail closed；尚未完成的 Rust fast solver 後續才加入正式後備，不以舊 TypeScript 或臨時 heuristic 代替。

## Persistence 與 privacy

- Local storage 只保存裝備、語言、明暗模式與首訪語言設定完成狀態。
- 進行中的配方、events、state 與 UI state 只存在記憶體；reload 後重新設定。
- Debug export 由玩家主動下載，包含重播所需 identity，不等同自動持久化。
- Storage failure 不影響 mechanics truth；UI 明示後仍可使用當次記憶體 session。
- 不讀遊戲記憶體或封包，不自動操作遊戲。

## Data 與 session 邊界

- Catalog identity 和 objective binding 由 data package 擁有。
- `CraftState` 只保存客觀單件製作狀態。
- Planner intent 保存於獨立 context。
- 跨件 MissionState 不在目前產品 contract；歷史型別或研究不得反向要求 runtime 預留欄位。
- `conditionSelected`、`craftActionUsed`、`craftActionResolved` 與 `stateResynced` 是可重播 interaction 的核心。

## Build 與 deployment

- Vite／Vue Web build、Rust release build、WASM release build、native↔WASM session parity 與 evaluator 是不同驗證層。
- GitHub Pages 或其他 hosting 只部署使用者明確採用的 Web core。
- 本機 commit、build 或 Rust evaluation 不代表公開網站已更新。
- `README.md` 為使用者保護的 GitHub 門面，不作技術 owner。
