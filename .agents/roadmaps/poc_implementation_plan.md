# Frozen Rabbit Expert POC 實作計畫

## 文件角色

本 roadmap 管理 POC 階段、交付物、驗收 gate 與目前進度。產品／mechanics／schema 的永久規則由 mission、domain 與 spec owner 管理。

`last_verified: 2026-08-12`

## 目前狀態

| Area | Status | Verify against |
| --- | --- | --- |
| 研究交接 | complete snapshot | `cosmic-expert-crafting-solver-poc-handoff.md` |
| 玩家影片／訓練交接 | complete snapshot | `expert-crafting-training-handoff-2026-08-11.md`；37 步 trace、round 1–13、正負結果與接手清單 |
| Agent／project 文件 | initialized | `AGENTS.md`, `.agents/**` |
| App scaffold | first vertical slice complete | npm workspace、`apps/web`、domain／data／protocol packages |
| WR.01 canonical data | not verified | game screenshot／official／versioned data record |
| 宇宙鈦鐵錠 canonical data | verified snapshot | Recipe 36282／Item 48360、RecipeLevelTable 746、XIVAPI game data revision |
| Mechanics engine | source-aligned subset＋scoped empirical correction | `packages/domain`＋Teamcraft parity fixture＋TW 7.51 上級加工有限區段 regression |
| Golden traces | first full success trace＋limited rounding segment | Recipe 36282／5408／5237／722／宇宙工具 ON 的 37 步玩家影片可見數值全步一致；buff／IQ 為 replay-derived，仍缺 failure／recovery traces |
| Single-recipe simulator UI | pilot ready | 低認知負荷主流程、球色點擊即結算並進下一手、非 100% 技能才問成敗、worker、undo、resync、reload、local replay、export；browser smoke 已通過，Playwright 未建立 |
| Guide-integrated policy | single-recipe practical pilot | `cosmic-titanium-guide-integrated-v1.0.0` 已接 web；749 CP development 31／72、完整 140／384，使用者接受先實戰，仍待真實 condition profile／frozen／cross-profile gate |
| Episode／research planner | current negative and positive evidence preserved | action-only 0／72、continuation MPC 未泛化；option／certificate／bounded-risk modules保留作下一輪研究，runtime owner 已移到 solver |
| Deployment | workflow ready, not deployed | `.github/workflows/deploy-pages.yml`；main push／manual dispatch，tests＋typecheck＋Vite build＋Pages artifact；尚未 push／啟用 Pages source |

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

> Current practical pilot：宇宙鈦鐵錠網站使用 `cosmic-titanium-guide-integrated-v1.0.0`。它以玩家指南作路線骨架，加入可序列化 decision memory、作業／品質 certificates、提早資源修復、有限風險收尾與窄幅 specialist research hook；每一步仍依實際 action history 重建並重算。開發首批 72 場為 31／72，完整 development 384 場為 140／384。使用者接受先投入實戰，但 assumed profiles 與反覆查看的 development 不能當真實成功率或正式 promotion；逾時／錯誤仍回到 `cosmic-titanium-lookahead-fallback-v1.4.0`。

### 交付

- versioned `guide-policy-v1` ruleset 與 source metadata。
- phase derivation、candidate gate、reason codes。
- progress／quality finisher certificates 與 reserve checks。
- recommendation／alternatives／confidence contract。
- 完整 step interaction、player deviation、undo／resync、OOD fallback。
- 本機 policy inference，不依賴 server。

### Gate

- 不推薦 illegal action。
- 快速 fallback 保留 p95 `< 50ms` 觀測基準；強規劃器 p95 `< 1s`，web hard timeout `3s` 且 timeout 可見、可安全 fallback，附 target platform／device／scenario。
- OOD state 明確 fallback 至安全 guide／manual mode。
- 玩家可完整走完實際 WR.01，event log 可重現。
- 每個 recommendation 有可讀 reason；alternative 有 trade-off。
- finisher tests 與 safety invariants 零違反。

## Phase 2：WR.01 approximate policy improvement

> Rejected live slice：已建立 `packages/simulator`、分離 condition／success random streams、三組 assumed sensitivity profiles、guide technique catalog、8 個 scenario oracle，以及 `cosmic-titanium-rollout-teacher-v0.1.0`。但第一場玩家實戰出現 Veneration 未接 progress、Good 使用 Manipulation、提前刷新 Waste Not II／Manipulation 等明確退化；窄 scenario oracle 沒有攔住完整路線失敗。`RESEARCH_TEACHER_PROMOTED=false`，Web Worker 不再進入玩家 recommendation。下一版必須先建立 offline reachable／boundary／mistake corpus、完整 episode held-out comparison 與 compact policy；Phase 2 gate 未完成。

> Offline training slice：`packages/policy-lab` 已加入 policy-population reachable-state sampler、候選技能×continuation policy 的 paired full-episode labeler、以 completion first 的 lexicographic objective、compact softmax action scorer、held-out evaluator 與 strict promotion decision。兩個玩家反例目前都避開原先被拒絕的 Waste Not II／Manipulation，但 exact label 會隨 safety gate 與 continuation population 變動，不能把單點 label 當成完整路線正確證據；只用兩個 labels 的 artifact 也會被 held-out gate 拒絕。這只證明訓練管線可運作，不代表已有實戰模型。

> 2026-08-11 targeted training：feature schema 已升級為 34 維 v2，並建立可 checkpoint／resume 的 `npm run train:policy`。以 `5408／5237／722／宇宙工具 ON` 跑 12-label pilot（89.5 秒）與 46-label 第二輪（167.5 秒）；兩輪 compact-only candidate 在加入安全閘門前都退化為 100% failure。其後加入共用安全閘門與「phase intent first、condition opportunism second」的 research-only 目標策略；固定 72 episodes、40 steps 時 runtime baseline 完成 3、目標策略完成 4，兩者 durability／premature failure 都是 0。放寬至 50 steps 完全沒有增加完成數，顯示限制是約 40 步前已耗盡資源而非截斷。第三輪以 16 labels／50 steps 訓練 178.1 秒，compact candidate 完成 0／72，低於目標策略 4／72，依停止條件不再擴大且不得 promotion。

> 2026-08-11 player-video iteration：37 步成功影片在第 11／20 步修正為冒進加工後，可見作業／品質／耐久／CP 全步重播一致。影片否定「任何 active buff 都不得刷新」及「repeated Observe 永遠禁止」：一回合改革可合理續上；第二次 Observe 只有在完整 finishing budget 下才可入候選。相同 72 episodes／50 steps 中 runtime baseline 由舊版 3 提至 4；影片啟發目標策略維持 4，但平均品質由 12614.8 提至 12678.4。round 4 以 16 labels／240 epochs 訓練 186.6 秒，compact candidate 仍 0／72，因此停止擴大。

> 2026-08-11 expanded training：依新共識不以小資料短期未漲判死，先把 safety 縮至可證明的災難／循環，sampler 改為多策略輪替與精確 buff turns，root candidates 擴為所有合法非致命 actions，feature 擴至 47 維互動項，compact scorer 升為 64 hidden units。訓練由 64、256 擴至 512 states；每候選由 6 擴至 24 futures，單輪最長 11.0 分鐘。研究發現並修正 no-step Final Appraisal 錯誤消耗 condition／success RNG；active Final Appraisal loop 與無 finishing budget repeated Observe 另由 safety gate 排除。多 continuation、candidate-state DAgger、單一 target continuation 與一輪 artifact continuation 都跑完；最佳 compact 是單一 target continuation 的 0／72、lower-tail 31.6%，仍低於 target reference 4／72、52.0%，不得 promotion。artifact continuation 第二輪降至 29.9%，因此停止自我教學分支；另用未參與調整的新 72 條亂數序列重驗仍為 reference 4／72、compact 0／72。下一步改以可保留 continuation intent 的 option／route learning；不可只繼續堆 action-only labels。

> 2026-08-11 route-planning reset：使用者取消 web-only／極小模型限制，並把強推薦預算放寬到約一秒。稽核發現 round 12 有 316／512 labels 沒有任何 completion 支持，90 個零完成局面因舊 `averageSteps` tie-break 被判為較佳，且 `terminal='none'` 未分類。現已加入完整 stop reason taxonomy、hard-stop viability objective、`TARGET_CRAFTER_722`／藥水 `TARGET_CRAFTER_MEDICINE_749`、`--max-cp`、development／frozen-validation／reserved-final corpus manifests，以及三種可重現的 rollout variants。749 CP reference 在兩組 regression 都是 6／72；single-continuation 與 committed variants 未勝，安全投影後的每步 continuation MPC 則為 7／72、10／72，合計 paired 7 勝 2 敗且 p95 約 160ms。development 首批 24 seeds/profile 則是 6／72 對 6／72、paired 2 勝 2 敗，完成率提升未重現；profiles 也都只是 assumption、worst profile 仍 0。因此不跑 frozen validation、不得 promotion。`video-informed-mainline-v1` option contract／controller 已落地並測試 termination、resume、factory isolation 與 budget；下一階段補 finisher certificate、每 option 多 candidates 與 stochastic value search，再訓練 distributional policy-value ensemble。不再放大舊 MLP 或替 heuristic population 調參。

> 2026-08-12 guide-integrated pilot：離線 hindsight 上限確認 72／72 routes 都存在，但固定整場 policies 的聯集只完成 7／72，證明瓶頸是跨步資源路線而非單一技能。依失敗 trace 加入進度收尾證明、品質爆發證明、提早資源保留、第二次 Manipulation 前的窄 Trained Finesse bridge，以及符合玩家「先按大招、後面賭高速／倉促收尾」意圖的 bounded-risk comparator；另完成 specialist mechanics，但 web 暫不顯示 specialist controls。整合後 749 CP 首批為 31／72（19／8／4），完整 development 為 140／384（102／28／10）；12,809 decisions p95 `0.865ms`、p99 `7.0ms`、max `417ms`。這個版本只以 practical pilot 身分接 web，未消耗 frozen validation。

> Cross-profile blocker：feature schema v2 已能區分 mechanics-derived base gain、current／max CP、craftsmanship boundary 與 cosmic tool flag，但只用單一 `CrafterProfile` 訓練仍不能證明適用其他裝備。正式 promotion 前仍需 CrafterProfile population、profile-grouped splits、cross-profile benchmark 與 OOD contract。詳細 invariant 由 `solver_policy_and_safety.md` 管理，package／artifact 邊界由 `technical_architecture.md` 管理。

### 交付

- reachable state sampler。
- fixed-budget paired rollout evaluator。
- boundary／recovery／mistake／guide disagreement corpus。
- route-consistent planner、option contract 與後續 policy-value／option-prior artifact。
- stable／balanced／aggressive objectives。
- held-out condition profile／stats 與 adversarial benchmark。
- artifact version、promotion／rollback mechanism。
- CrafterProfile sampling envelope、profile-grouped split、cross-profile／boundary benchmark 與 OOD router。

### Gate

- held-out completion／Gold 指標有統計支持的改善，或 trade-off 在預定容忍內。
- safety invariants 零違反。
- OOD fallback rate 與 tail failures 可見。
- planning／inference 保持 local；強規劃 p95 `< 1s`、web `3s` hard timeout，deadline fallback 通過。
- 未見裝備 profile 的 per-profile／worst-tail 指標不退化；超出 stat envelope 可安全 fallback。
- 若沒有穩定改善，保留 guide-policy-v1 並記錄 negative result。

### 下一個正式深度訓練視窗接手點

開始前先確認目前分支包含 `26939f5`（離線實戰老師研究管線）；simulator、teacher、policy-lab 與 worker 是刻意保留的已提交 POC，不要重做或刪除。依下列順序推進：

1. 先重跑 `npm run typecheck`、`npm test`、`npm run test:policy-lab`、`npm run benchmark:solver`；Vite build 依本機 `AGENTS.md` 使用需要的 sandbox permission。
2. 已完成：feature schema v2 能辨識 mechanics-derived base progress／quality、current／max CP、craftsmanship boundary 與 cosmic tool bonus；artifact version 已 bump，並有「不同裝備不再得到相同 vector」的測試。
3. 定義第一版 `CrafterProfile` sampling envelope。不要任意獨立亂數組合不可能存在的裝備；至少保留最低可行、常見、中高、上界與 CP／取整邊界，來源與假設另行記錄。
4. 部分完成：`tools/train-policy` 保存 recipe／target profile／condition profile／policy population／seed／budget／source state class，並能由 checkpoint／artifact resume；仍需 mechanics／objective version、正式 split manifest 與 source trace grouping。
5. corpus 至少分成 natural reachable、guide disagreement、buff／combo window、condition opportunity、resource boundary、player mistake／recovery、live trace。現有 512-state action-only 實驗已證明多 continuation intent 混合會退化；先讓 direct planner 保存 `(optionId, actionId)` 與 route value，再產生 training targets。
6. split 以完整 CrafterProfile 與來源 trace 分組；先凍結 held-out manifest，再訓練，禁止依 held-out 結果反覆人工調 label。
7. 比較 `cosmic-titanium-lookahead-fallback-v1.4.0`、749 CP video-informed reference、consistent rollout planner、後續 option MPC 與 policy-value artifact。報告 overall、paired wins、per-profile、worst profile、worst decile、condition sensitivity、stop-reason taxonomy、safety violations、OOD fallback 與 runtime latency。
8. 只有 promotion gate 全部通過才新增 runtime artifact／loader 並讓 UI 使用；否則保留 fallback，將 negative result 與下一個 hypothesis 寫回本 roadmap。

目前可重現的 validation snapshot（2026-08-12，本機 Node／Vitest＋in-app browser smoke，不代表所有裝置）：

- `npm run typecheck`：通過；
- `npm test`：19 files／133 tests 通過；
- `evaluate:rollout-planner --planner guide-integrated --corpus planner-development-384-v1 --max-cp 749 --seed-count 24`：31／72，profiles 19／8／4，零 safety violation，paired 對舊 baseline +26／-1；2,387 states latency p95 `1.053ms`、p99 `8.127ms`、max `451.640ms`；
- GitHub Pages base `/frozen_rabbit_expert/` 的 Vite production build 通過，另產生 `guidePlanner.worker` chunk；
- browser smoke 通過開場、替代技能、RNG success／failure gate、next-condition 單擊結算、下一手、reload memory rebuild、undo、terminal、desktop／mobile 與 light／dark；
- 已建立 GitHub Pages workflow，但尚未 push／實際部署；development 全部 128 seeds/profile 已被查看，不得當 promotion final。

## 下一個配方擴充：宇宙鈦鐵釘

資料庫／社群資料目前對應 Recipe `36283`、Item `48361`、RecipeLevelTable `746`，作業 10000、耐久 55、品質上限 27400、`requiredQuality=0`。它與宇宙鈦鐵錠使用相同裝備與 recipe level，但 objective 完全不同：作業滿即完成，品質未滿不是 craft failure；完成後品質越高，任務分數越高。這些 identity／數值在實作前仍要綁定 source metadata，並以遊戲內配方與結算畫面再次確認。

### 必須保留的能力

- 同一 TypeScript mechanics、action legality、buff／CP／耐久結算與同 recipe level 的基礎 gain。
- 玩家逐步回報、worker、3 秒 timeout fallback、actual-history memory rebuild、undo／reload／resync。
- condition opportunism、Manipulation／Waste Not 耐久循環與 progress finisher search。

### 不能直接沿用的規則

- 禁止把 `requiredQuality=0` 當品質已達標，或計算 `quality / requiredQuality`。
- 錠專用的 progress／quality 百分比、CP floor、Manipulation 次數與 Byregot 時機全部重新評估；31／72 不能換算成釘的成績。
- 品質 certificate 改由外部 `CraftObjective.qualityTarget` 驅動；mechanics 的 `minimumQuality` 與想追求的 score／quality target 分離。
- policy 先證明剩餘 CP／耐久可完成 progress，再用剩餘空間追品質；若繼續加工明顯危及完工，就接受目前品質並收尾。

### 實作順序

1. 新增 Recipe 36283 profile 與 `CraftObjective`，先補「品質未滿仍 completed」及除零 regression；Recipe 36282 行為不得改變。
2. 泛化 progress／quality certificates，加入「做完此品質技能後仍有作業收尾」檢查。
3. 建立 nails-specific route 與 fresh development／frozen／reserved corpora；不要重用已反覆查看的錠 seeds 作 promotion。
4. 評估 completion、真 failure、最終品質分布、已驗證 score tiers、Silver／Gold 與滿品質率；未完成品品質不得算分。
5. 取得至少一條釘完整玩家 trace及不同品質的結算圖，再校準 score mapping；最後才串接 mission controller 的錠 80 分、材料、倒數與 Material Miracle。

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
