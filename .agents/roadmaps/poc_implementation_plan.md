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
| Single-recipe simulator UI | first vertical slice complete | 三圍＋宇宙工具、玩家選球／成敗、裝備設定 persistence、undo、resync、local replay、export；Playwright 未建立 |
| Guide policy | not started | `packages/solver`＋evaluation |
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

### 交付

- reachable state sampler。
- fixed-budget paired rollout evaluator。
- boundary／recovery／mistake／guide disagreement corpus。
- compact policy／action scorer artifact。
- stable／balanced／aggressive objectives。
- held-out condition profile／stats 與 adversarial benchmark。
- artifact version、promotion／rollback mechanism。

### Gate

- held-out completion／Gold 指標有統計支持的改善，或 trade-off 在預定容忍內。
- safety invariants 零違反。
- OOD fallback rate 與 tail failures 可見。
- inference 保持 local、達 latency target。
- 若沒有穩定改善，保留 guide-policy-v1 並記錄 negative result。

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
