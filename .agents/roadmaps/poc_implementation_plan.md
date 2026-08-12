# Frozen Rabbit Expert POC 實作計畫

## 文件角色

本 roadmap 管理 POC 階段、交付物、驗收 gate 與目前進度。產品／mechanics／schema 的永久規則由 mission、domain 與 spec owner 管理。

`last_verified: 2026-08-12`

## 目前狀態

| Area | Status | Verify against |
| --- | --- | --- |
| 研究交接 | complete snapshot | `cosmic-expert-crafting-solver-poc-handoff.md` |
| 玩家影片／solver 研究交接 | complete snapshot | `expert-crafting-training-handoff-2026-08-11.md`；錠 37 步 trace、round 1–13、釘 v1.1.0 ablation、正負結果與接手清單 |
| Agent／project 文件 | initialized | `AGENTS.md`, `.agents/**` |
| App scaffold | first vertical slice complete | npm workspace、`apps/web`、domain／data／protocol packages |
| WR.01 canonical data | not verified | game screenshot／official／versioned data record |
| 宇宙鈦鐵錠 canonical data | verified snapshot | Recipe 36282／Item 48360、RecipeLevelTable 746、XIVAPI game data revision |
| 宇宙鈦鐵釘 canonical data | verified snapshot | Recipe 36283／Item 48361、RecipeLevelTable 746、作業 10000、耐久 55、品質上限 27400、必要品質 0 |
| 宇宙探索用的巨匠藥 canonical data | verified recipe snapshot＋provisional score proxy | 複方藥任務只支援第三件；Recipe 36582／Item 48570、RecipeLevelTable 726、作業 10000、耐久 55、品質上限 12000、必要品質 0；10800 只是暫定 800 分 proxy |
| Mechanics engine | source-aligned subset＋scoped empirical correction | `packages/domain`＋Teamcraft parity fixture＋TW 7.51 上級加工有限區段 regression |
| Golden traces | first full success trace＋limited rounding segment | Recipe 36282／5408／5237／722／宇宙工具 ON 的 37 步玩家影片可見數值全步一致；buff／IQ 為 replay-derived，仍缺 failure／recovery traces |
| Scenario-based simulator UI | five-recipe pilot ready | scenario registry、目前配方 compact control、可搜尋／可捲動 accessible recipe bottom sheet／dialog、點目前／其他配方皆完整重置、低認知負荷主流程、worker、undo、resync、reload、local replay、export；Playwright 未建立 |
| Guide-integrated policies | five recipe-specific policies embedded | 錠 v1.2.0、釘 v1.3.0、木板 v1.1.0、腳手架 v1.3.0、巨匠藥 v1.1.0 已接 web；巨匠藥關閉 specialist actions，食藥兩 exact profiles 通過 assumed development，無 buff 不在滿品質 envelope；frozen／reserved 未執行 |
| Episode／research planner | current negative and positive evidence preserved | action-only 0／72、continuation MPC 未泛化；option／certificate／bounded-risk modules保留作下一輪研究，runtime owner 已移到 solver |
| 預設測試套件 | value audit complete | checkpoint `827cf73` 由 209 淨減為 193 tests；current checkout 另加 1 個巨匠藥 hostile-condition runtime contract，共 194；保留 mechanics／protocol／player trace／solver safety 等高價值 owner，移除 literal mirror 與重複研究測試 |
| Deployment | workflow ready, live version unverified | `.github/workflows/deploy-pages.yml`；main push／manual dispatch，tests＋typecheck＋Vite build＋Pages artifact；目前五配方版本需另做 live smoke |

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

> Current runtime：錠 `cosmic-titanium-guide-integrated-v1.2.0`、釘 `cosmic-titanium-nails-guide-integrated-v1.3.0`、木板 `hardened-survey-plank-guide-integrated-v1.1.0`、腳手架 `mobile-work-stairs-guide-integrated-v1.3.0`、巨匠藥 `survey-craftsmans-command-brew-guide-integrated-v1.1.0`。三個 exact 玩家面板已集中資料化；食藥釘走高尾 route，食藥腳手架走 75% projected-quality cashout，巨匠藥把 mechanics `requiredQuality=0` 與 policy target 12000 分離，以 bounded certificate 防止可避免的低品質提前完成，並停用無收益的 specialist actions。assumed profiles／IID marginal 不是實戰成功率；逾時／錯誤回到 `cosmic-craft-objective-lookahead-fallback-v1.5.0`。

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
7. 比較 `cosmic-craft-objective-lookahead-fallback-v1.5.0`、749 CP video-informed reference、consistent rollout planner、後續 option MPC 與 policy-value artifact。報告 overall、paired wins、per-profile、worst profile、worst decile、condition sensitivity、stop-reason taxonomy、safety violations、OOD fallback 與 runtime latency。
8. 只有 promotion gate 全部通過才新增 runtime artifact／loader 並讓 UI 使用；否則保留 fallback，將 negative result 與下一個 hypothesis 寫回本 roadmap。

目前可重現的 validation snapshot（2026-08-12，本機 Node／Vitest＋in-app browser smoke，不代表所有裝置）：

- `npm run typecheck`：通過；
- `npm test`：current checkout 為 194 tests 通過；checkpoint `827cf73` 的價值稽核由 209 淨減為 193，之後只加入 1 個巨匠藥 all-Malleable 滿品質完工／零專家技能 runtime contract。保留 mechanics／protocol／player trace／solver safety owner，並包含五個 scenario identity／planner、第一手 Normal，以及點目前或其他配方都完整重置的 session 行為；
- `evaluate:rollout-planner --planner guide-integrated --corpus planner-development-384-v1 --max-cp 749 --seed-count 24`：31／72，profiles 19／8／4，零 safety violation，paired 對舊 baseline +26／-1；2,387 states latency p95 `1.053ms`、p99 `8.127ms`、max `451.640ms`；
- GitHub Pages base `/frozen_rabbit_expert/` 的 Vite production build 通過，另產生 `guidePlanner.worker` chunk；
- in-app browser current-checkout smoke 已驗證 320×568、390×844、667×375：收合入口不再常駐所有配方，頁面無水平溢出；recipe dialog 在手機採內部捲動 bottom sheet，搜尋、focus、Escape／取消、切換與點目前配方重新開始均通過。dirty state 重置後回到第一步 Normal、滿耐久／CP、0 作業／品質與空歷史；console 無 warning／error。這仍不是所有真實裝置的視覺保證；
- 公開頁面是否已包含目前五配方與 compact control／dialog 改動需另行 live 驗證；development 已參與調整時不得當 promotion final。
- `evaluate:elevating-platforms -- --seed-count 4`：六組非專家裝備 × 三個 assumed condition profiles；木板滿品質完成 70／72，成品完成 72／72、滿品質 18／72，0 specialist recommendation／safety violation。

## 已完成配方擴充：宇宙鈦鐵釘

XIVAPI game data 已驗證 Recipe `36283`、Item `48361`、RecipeLevelTable `746`，作業 10000、耐久 55、品質上限 27400、`requiredQuality=0`。它與宇宙鈦鐵錠使用相同 recipe level，但 objective 完全不同：作業滿即完成，品質未滿不是 craft failure。玩家遊戲內任務表另確認 1000 分上端是收藏價值 2710，因此 policy target 為 27100；2466–2710 對應 700–1000，但區間內精確換算仍待不同結算點證據。

### 必須保留的能力

- 同一 TypeScript mechanics、action legality、buff／CP／耐久結算與同 recipe level 的基礎 gain。
- 玩家逐步回報、worker、3 秒 timeout fallback、actual-history memory rebuild、undo／reload／resync。
- condition opportunism、Manipulation／Waste Not 耐久循環與 progress finisher search。

### 不能直接沿用的規則

- 禁止把 `requiredQuality=0` 當品質已達標，或計算 `quality / requiredQuality`。
- 錠專用的 progress／quality 百分比、CP floor、Manipulation 次數與 Byregot 時機全部重新評估；31／72 不能換算成釘的成績。
- 品質 certificate 改由外部 `CraftObjective.qualityTarget` 驅動；mechanics 的 `minimumQuality` 與想追求的 score／quality target 分離。
- policy 先證明剩餘 CP／耐久可完成 progress，再用剩餘空間追品質；若繼續加工明顯危及完工，就接受目前品質並收尾。

### 已交付與目前驗證點

1. Recipe 36283 profile、`CraftObjective`、完成語意與除零 regression 已完成；Recipe 36282 回歸保留。
2. progress／quality certificates 已接受外部品質目標，並驗證品質路線後仍有作業收尾。
3. nails-specific policy、獨立 development／frozen／reserved corpus 與 evaluator 已建立；只執行 development。
4. v1.1.0 把 objective 明確改為 completion-first：修正 score target 污染 mechanics safety、前期作業資源不足、Malleable 機會浪費、Byregot CP 未保留與 IQ0 低資源仍花 CP。development 512 場全數完成，0 true failure／policy-null／safety violation；品質 min／p10／p25／median／p75／p90／max 為 5214／11700／13819／16879／20636／23929／27400，暫定 tier 累積 272／176／41／22。
5. 第一場匿名玩家 export 保存 35 手、品質 14242／作業 9571，停在完成前一手；第二場保存完整 39 手，以品質 17224／作業 10000 完成。兩場球色與 Rapid／Hasty 成敗都未支持異常倒楣，已加入 exact-state regression；但沒有逐步遊戲畫面，仍只作 replay／policy evidence。v1.1.0 尚待玩家實戰重驗，frozen／reserved 不執行。
6. v1.2.0 以 27100 任務目標與高分尾端為 metric：保留 70% 作業 reserve，GS threshold 0.65，Normal／IQ<=8 可用專心致志→集中加工，IQ10 收尾使用快速改革與最多三次不耗工次的設計變動等高品質；普通觀察預設 0。empirical 128 場 high 11→27、`>=97% target` 6→21、`>=27100` 5→9；完整 development 512／512、0 safety violation。精確 900 分門檻未知，因此不得稱 Silver rate。

## 已完成第一版：高空作業用的腳手架與配方切換 UI

2026-08-12 已新增 **【高難＋】製作高空作業所需的腳手架**：

1. 宇宙探索用的硬化木板為 Recipe 36205／Item 48263，作業 4700、耐久 20、必要／上限品質 14900；`hardened-survey-plank-guide-integrated-v1.1.0` 以滿品質作硬門檻並使用 joint certificate。
2. 高空作業用的腳手架為 Recipe 36208／Item 48311，作業 9300、耐久 60、品質上限 22500、非收藏品且可 HQ；`mobile-work-stairs-guide-integrated-v1.3.0` 先保完成再提高一次 HQ 判定的品質，未滿品質不是 craft failure。
3. 兩配方使用 Normal／Good／Good Omen／Sturdy／Pliant／Malleable／Primed；domain 已實作 Good Omen 下一 advancing step 強制 Good，以及 Primed 新 buff +2 steps。
4. policy 與 evaluator 均可明示停用 specialist；木板／成品 runtime 固定禁用。木板 joint certificate frozen 三裝備合計 `+11／-0` completion；成品 exact 食藥 frozen-v2 completion 不變、both-complete provisional HQ `+7.36pp`、completion-weighted 任務分 `+44.02`，0 safety violation。community HQ curve 仍不是遊戲內 oracle或真實成功率。
5. UI 只常駐目前物品 icon／名稱／任務與 compact「切換配方」control；完整清單在可搜尋、可捲動、accessible 的 bottom sheet／dialog 中，並可明確重新開始目前配方。點目前或其他配方都以目前面板數值完整重置至 step 1、Normal、滿耐久／CP、零作業／品質且無 pending／action history。推薦卡顯示強決策／快速備援、elapsed、policy version，並區分 `3000ms` timeout 與 3000ms 前的 worker 立即失敗。

跨配方先共用 mechanics、session 與參數化 equipment，但 objective、config 與 policy version 仍逐 recipe 維護。後續優先取得真實 condition transition、HQ 結算、玩家完整 trace 及較大的 frozen／OOD 跨裝備 corpus；若證據顯示路線可共享，再抽通用 policy，不能先假設所有 EX+ 配方一致。

擴充流程固定為 data profile → `CraftObjective` → scenario registry → planner config／mission policy → mechanics／scenario regression → fresh development corpus → 玩家 trace。只有不同 mechanics 才改 domain；不同數值、球色或目標應以 data／config 注入。下列 Phase 3／4 是目前可參考的研究骨架，實作時再以各任務 current data 對應。

## 已完成第一版：製作工匠所需的複方藥第三件

2026-08-12 已把「宇宙探索用的巨匠藥」接入現有單件 craft runtime：

1. 支援範圍只包含任務第三件 Recipe 36582／Item 48570；前兩件仍由玩家以其他方式處理，網站沒有三件合計分數／時間的 mission controller。
2. mechanics 為作業 10000、耐久 55、品質上限 12000、`requiredQuality=0`；`CraftObjective.qualityTarget=12000` 才表示滿品質目標，不能把它改寫成 craft failure 條件。
3. 已知 1020–1200 收藏價值對應 700–1000 分；10800 品質只是頂段線性內插得到的 provisional 800 分 proxy，待下一張遊戲內分數區間／結算畫面修正。
4. `survey-craftsmans-command-brew-guide-integrated-v1.1.0` 以可證 quality-first route 與 bounded certificate 避免 Malleable 造成的可避免提前完成；證明失敗時仍允許安全完工。checkpoint `827cf73` 的 v1.0.0 曾允許 specialist arms，但 development 中專家 stats 結果與非專家相同且三種 specialist actions 使用 0 次，因此 v1.1.0 關閉 `allowSpecialistActions`／`useSpecialistFinisher`，仍維持一個 recipe policy identity。
5. 食藥非專家在三個 assumed primary profiles 合計 `384／384`、兩個 adversarial stress profiles 合計 `64／64` 都完成且滿品質；食藥＋專家 stats 結果完全相同。無 buff primary 完成 `384／384`、滿品質 `145／384`，故 scenario development envelope 只含前兩組 exact food／medicine profiles，無 buff 標 OOD。這些都是已參與調整的 assumed development，不是實戰率；frozen／reserved 未執行。

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
