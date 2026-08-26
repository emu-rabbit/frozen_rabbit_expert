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
UI／session orchestration ──> apps/web
evaluation orchestration ──> tools
~~~

舊 TypeScript solver 已凍結，只能作歷史參考與遷移 evidence。新的 mechanics／solver／planner memory／episode 改善與評測都以 Rust source 為 owner。

## Runtime 輸入與輸出

~~~text
RecipeProfile + CraftObjective + CrafterProfile
+ observed CraftState + actual action history + RiskPreference
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

Rust policy 可以有意地超越 frozen TypeScript 行為；TS→Rust 只需要事前定義的 outcome migration evidence，不要求永久逐招複製。

Native binary、ABI、mechanics、solver、action schema 與 evaluation identity 不符時 fail closed。Node parent 可以負責 shards、locks、timeout、retry、resume、atomic persistence 與 report，但不能偷偷改用 TS evaluator。

## Web 採用決策

採用某個 Rust 結果時，另開 task 比較：

1. Rust 編譯成 WASM，由 TypeScript wrapper 呼叫同一 compute core。
2. 依採用行為建立新的 TypeScript Web 核心。

比較項目包括：

- 目標裝置 p50／p95／p99／max；
- WASM 載入與 JS↔WASM 邊界傳遞；
- memory、bundle 與 cache；
- 結果一致性與 debug 成本；
- 未來 Rust 改進同步到 Web 的維護成本。

決策前不宣稱 WASM 必然較快，也不先實作新的 TypeScript core。若最後採用新 TypeScript，它是新的 implementation，不是解凍舊 solver；ownership 如何轉移要在該 task 明確決定。

## 目標雙求解器

### 主要求解器

- 每步最多等待 3 秒。
- 可使用較完整的 fixed-budget planning。
- 回傳理由、替代技能、elapsed 與明確 failure category。

### 快速求解器

- 和主要求解器共用 authoritative mechanics，但有獨立、可證明 bounded 的決策流程。
- 目標裝置 p95 小於 100ms，並報 p99／max。
- 合法非終局 state 仍有合法技能時不回傳空白。
- 接近預算時由最終 selector 掃描合法技能，依安全、完工路線、品質與 risk preference 排序。
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
frozen solver ─> domain
web ────────> data + domain + protocol + frozen solver
policy-lab ─> domain + simulator + frozen historical solver
native core ─> own Rust types／protocols
tools ──────> owning packages or native binary
~~~

採用 Web 新核心時更新此圖；在此之前，目標架構不能寫成已完成 dependency。

## Persistence 與 privacy

- Local storage 只保存裝備與 risk preference。
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

- Vite／Vue Web build、Rust release build、native parity 與 evaluator 是不同驗證層。
- GitHub Pages 或其他 hosting 只部署使用者明確採用的 Web core。
- 本機 commit、build 或 Rust evaluation 不代表公開網站已更新。
- `README.md` 為使用者保護的 GitHub 門面，不作技術 owner。
