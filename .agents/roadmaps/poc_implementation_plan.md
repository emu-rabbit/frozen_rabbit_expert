# Frozen Rabbit Expert POC 實作計畫

## 文件角色

本 roadmap 管理 POC 階段、交付物、驗收 gate 與目前進度。產品／mechanics／schema 的永久規則由 mission、domain 與 spec owner 管理。

`last_verified: 2026-08-11`

## 目前狀態

| Area | Status | Verify against |
| --- | --- | --- |
| 研究交接 | complete snapshot | `cosmic-expert-crafting-solver-poc-handoff.md` |
| Agent／project 文件 | initialized | `AGENTS.md`, `.agents/**` |
| App scaffold | first vertical slice complete | npm workspace、`apps/web`、domain／data／protocol packages |
| WR.01 canonical data | not verified | game screenshot／official／versioned data record |
| 宇宙鈦鐵錠 canonical data | verified snapshot | Recipe 36282／Item 48360、RecipeLevelTable 746、XIVAPI game data revision |
| Mechanics engine | source-aligned subset＋scoped empirical correction | `packages/domain`＋Teamcraft parity fixture＋TW 7.51 上級加工有限區段 regression |
| Golden traces | limited segment collected | Recipe 36282／加工精度 5140／內靜 3＋改革／通常上級加工；完整 session traces 尚未收錄 |
| Single-recipe simulator UI | first vertical slice complete | 三圍＋宇宙工具、球色／成敗／下一球硬閘門、裝備設定 persistence、undo、resync、local replay、export；Playwright 未建立 |
| Guide/lookahead policy | first single-recipe version implemented; gate incomplete | guide soft prior＋bounded expectimax＋guide options；仍待完整 golden session 與 held-out evaluation |
| Episode／research teacher | first live POC rejected; offline lab started | deterministic simulator＋guide catalog／oracle 保留；policy-lab 已有 sampler／labels／compact scorer／promotion gate，仍待大規模 corpus 與有效 artifact |
| Deployment | undecided | config／workflow 不存在 |

## 實作順序原則

1. data identity 與 exact mechanics 先於 solver。
2. single-recipe simulator／replay 先於 recommendation。
3. readable guide policy 先於 approximate model。
4. WR.01 單件 craft 先於 WR.02／TR.01 mission complexity。
5. TypeScript single source 先於 worker／WASM optimization。
6. 每一 phase 通過 gate 才擴大 scope；未知 mechanics 不用 UI workaround 掩蓋。

## Phase 0：Data、mechanics 與 replay

### 交付

- 最小 npm workspace／Vue web scaffold。
- `RecipeProfile`、`CrafterProfile`、`CraftState`、`MissionState`、`SessionEvent`。
- Auxesia WR.01 canonical mission／recipe／condition data。
- WR.01 所需 Lv.100 actions 與 exact transition engine。
- deterministic event replay、validation、debug export。
- golden trace importer 與數條真實成功／失敗／recovery traces。
- 固定配方 simulator，由三圍計算數值、玩家逐步選球；非 100% 技能由玩家指定成敗。保留 undo／resync，此階段不給 solver recommendation。

### Gate

- 所有 golden traces 每一步數值一致。
- mismatch 可定位到 action、data、rounding、buff timing 或 transcription。
- POC runtime 不套用 condition rate；每一步的 condition 由玩家明確選擇。
- unit／invariant／typecheck／build 通過。
- event replay deterministic，invalid import 安全失敗。

## Phase 1：WR.01 guide-policy assistant

> Current partial slice：宇宙鈦鐵錠玩家 runtime 已回復 `cosmic-titanium-lookahead-fallback-v1.1.1`。它以 guide signals 作 phase soft prior 與 quality option 基準，固定預算 expectimax 比較成功／失敗、均衡未來 condition sensitivity、資源與長程 state value；保留提前完成 hard veto、progress finisher check、理由／alternatives／coverage contract 與 Blacksmith action icon。這不是 WR.01 正式 policy，Phase 1 gate 未完成。

### 交付

- versioned `guide-policy-v1` ruleset 與 source metadata。
- phase derivation、candidate gate、reason codes。
- progress／quality finisher certificates 與 reserve checks。
- recommendation／alternatives／confidence contract。
- 完整 step interaction、player deviation、undo／resync、OOD fallback。
- 本機 policy inference，不依賴 server。

### Gate

- 不推薦 illegal action。
- p95 recommendation `< 50ms`，附 target browser／device／scenario。
- OOD state 明確 fallback 至安全 guide／manual mode。
- 玩家可完整走完實際 WR.01，event log 可重現。
- 每個 recommendation 有可讀 reason；alternative 有 trade-off。
- finisher tests 與 safety invariants 零違反。

## Phase 2：WR.01 approximate policy improvement

> Rejected live slice：已建立 `packages/simulator`、分離 condition／success random streams、三組 assumed sensitivity profiles、guide technique catalog、8 個 scenario oracle，以及 `cosmic-titanium-rollout-teacher-v0.1.0`。但第一場玩家實戰出現 Veneration 未接 progress、Good 使用 Manipulation、提前刷新 Waste Not II／Manipulation 等明確退化；窄 scenario oracle 沒有攔住完整路線失敗。`RESEARCH_TEACHER_PROMOTED=false`，Web Worker 不再進入玩家 recommendation。下一版必須先建立 offline reachable／boundary／mistake corpus、完整 episode held-out comparison 與 compact policy；Phase 2 gate 未完成。

> Offline training slice：`packages/policy-lab` 已加入 policy-population reachable-state sampler、候選技能×continuation policy 的 paired full-episode labeler、以 completion first 的 lexicographic objective、compact softmax action scorer、held-out evaluator 與 strict promotion decision。玩家反例可正確標出 Veneration 後 Rapid Synthesis、Good 時 Precise Touch；只用兩個 labels 的 artifact 會被 held-out gate 拒絕。這只證明訓練管線可運作，不代表已有實戰模型。

> Cross-profile blocker：目前 compact feature 沒有 craftsmanship、control、max CP 絕對尺度、mechanics-derived base gain 或 cosmic tool flag；只用單一 `CrafterProfile` 訓練必然不能證明適用其他裝備。正式訓練前先完成 feature schema v2、CrafterProfile population、profile-grouped splits 與 OOD contract。詳細 invariant 由 `solver_policy_and_safety.md` 管理，package／artifact 邊界由 `technical_architecture.md` 管理。

### 交付

- reachable state sampler。
- fixed-budget paired rollout evaluator。
- boundary／recovery／mistake／guide disagreement corpus。
- compact policy／action scorer artifact。
- stable／balanced／aggressive objectives。
- held-out condition profile／stats 與 adversarial benchmark。
- artifact version、promotion／rollback mechanism。
- CrafterProfile sampling envelope、profile-grouped split、cross-profile／boundary benchmark 與 OOD router。

### Gate

- held-out completion／Gold 指標有統計支持的改善，或 trade-off 在預定容忍內。
- safety invariants 零違反。
- OOD fallback rate 與 tail failures 可見。
- inference 保持 local、達 latency target。
- 未見裝備 profile 的 per-profile／worst-tail 指標不退化；超出 stat envelope 可安全 fallback。
- 若沒有穩定改善，保留 guide-policy-v1 並記錄 negative result。

### 下一個正式深度訓練視窗接手點

開始前先確認目前分支包含 `26939f5`（離線實戰老師研究管線）；simulator、teacher、policy-lab 與 worker 是刻意保留的已提交 POC，不要重做或刪除。依下列順序推進：

1. 先重跑 `npm run typecheck`、`npm test`、`npm run test:policy-lab`、`npm run benchmark:solver`；Vite build 依本機 `AGENTS.md` 使用需要的 sandbox permission。
2. 將 feature schema 升級為能辨識 mechanics-derived base progress／quality、current／max CP、craftsmanship boundary 與 cosmic tool bonus；變更 schema 必須 bump artifact version 並加「不同裝備不再得到相同 vector」的測試。
3. 定義第一版 `CrafterProfile` sampling envelope。不要任意獨立亂數組合不可能存在的裝備；至少保留最低可行、常見、中高、上界與 CP／取整邊界，來源與假設另行記錄。
4. 建立 batch dataset manifest 與可重現 CLI：保存 recipe／mechanics／condition profile／policy population／seed／budget／source state class，並能 resume；大量 rollout 不進 Vitest unit suite。
5. corpus 至少分成 natural reachable、guide disagreement、buff／combo window、condition opportunity、resource boundary、player mistake／recovery、live trace。先跑 compact pilot，再依 throughput 告知使用者大規模訓練時間。
6. split 以完整 CrafterProfile 與來源 trace 分組；先凍結 held-out manifest，再訓練，禁止依 held-out 結果反覆人工調 label。
7. 比較 `cosmic-titanium-lookahead-fallback-v1.1.1`、被拒絕的 teacher 與新 compact artifact。報告 overall、per-profile、worst profile、worst decile、condition sensitivity、failure taxonomy、safety violations、OOD fallback 與 runtime latency。
8. 只有 promotion gate 全部通過才新增 runtime artifact／loader 並讓 UI 使用；否則保留 fallback，將 negative result 與下一個 hypothesis 寫回本 roadmap。

目前可重現的 validation snapshot（2026-08-11，本機 Node／Vitest，不代表 browser 全裝置）：

- `npm run typecheck`：通過；
- `npm test`：7 files／40 tests 通過；
- `npm run test:policy-lab`：2 tests 通過，兩個 live regression labels 為 Rapid Synthesis／Precise Touch，小型 overfit artifact 被拒絕；
- `npm run benchmark:solver`：120 states，p50 `36.735ms`、p95 `44.878ms`、p99 `48.546ms`，performance suite 已與一般 unit tests 隔離；
- `npm run build`：Vite production build 通過；
- 尚未建立正式 dataset、batch training CLI、cross-profile held-out corpus 或可 promotion artifact。

## Phase 3：WR.02 Material Miracle

### 進入前條件

- `open_questions.md` 中 Miracle activation、duration、condition transition、cross-craft 與 clock semantics 已有足夠遊戲內 evidence，或每個假設明確 profile 化。

### 交付

- 9 分鐘 mission controller。
- supplies、accumulated score、兩次 Material Miracle。
- 45 秒 local clock、sync／drift／resync。
- keyboard／touch fast mode。
- step duration 與 UI overhead model。
- Miracle-specific condition profile sensitivity。

### Gate

- recommendation 倒數期間仍 local、p95 達標。
- 真實切換／輸入不吞掉 Duty Action 的主要價值。
- clock drift 可見且可修正。
- 未知 condition rate 不顯示為 official exact probability。
- background analysis、animation、network 不阻塞下一手。

## Phase 4：TR.01 mission risk

### 進入前條件

- 「不得失敗」定義與 Stellar Steady Hand 的 step／no-step／failure semantics 已有遊戲內 evidence。

### 交付

- two-craft mission objective。
- joint completion／Gold probability。
- Stellar Steady Hand resource allocation。
- 第一件 outcome 對第二件 risk target 的更新。
- mission-level replay／evaluation。

### Gate

- joint risk 計算可重現並有 adversarial tests。
- 任一 craft 結束後的 MissionState 正確。
- risk profile 不用單件 expected quality 取代 mission success。

## 最先五個工作項目

1. 取得 WR.01 canonical IDs、遊戲畫面、player stats 與至少一條完整 trace。
2. ~~建立最小 workspace、domain／data／protocol packages 與 single-recipe web simulator。~~ 第一版已以宇宙鈦鐵錠 canonical profile 完成。
3. 以 golden trace 驗證並收斂 WR.01 主件需要的 actions、condition state machine 與 replay。
4. 用 golden trace 修正 mechanics，通過 Phase 0 gate。
5. 才建立 guide-policy-v1、finisher certificates 與第一場 recommendation POC。

不要先選 neural network、MCTS、WASM 或大型 policy format，再反向尋找它能解決的問題。

## Milestone 更新規則

- 只有實際交付與 gate evidence 完成後才把 status 改成 complete。
- blocked 項目需連到 `research/open_questions.md` 或具體 issue／fixture。
- phase 狀態是 snapshot；每次 milestone 更新 `last_verified` 並檢查 source／test owners。
- roadmap 不重複 mechanics 或 product contract；規則變更同步 canonical owner。
