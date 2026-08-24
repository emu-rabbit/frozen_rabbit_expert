# Frozen Rabbit Expert POC 實作計畫

## 文件角色

本 roadmap 封存 2026-08-23 前五個 recipe-specific POC 的階段、交付物與驗收紀錄。它不是目前產品 backlog，也不得用其中的「下一步」、五配方 live route 或 test count 指揮 generic 主線；目前優先級與狀態只看 `broad_solver_implementation_plan.md`。產品／mechanics／schema 的永久規則由 mission、domain 與 spec owner 管理。

`last_verified: 2026-08-23`

## 2026-08-23 歷史狀態

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
| Scenario-based simulator UI | five-recipe pilot ready（歷史） | 當時的 scenario registry、目前配方 compact control、可搜尋／可捲動 accessible recipe bottom sheet／dialog、點目前／其他配方皆完整重置、低認知負荷主流程、worker、undo、resync、reload、local replay、export；Playwright 未建立 |
| Guide-integrated policies | five recipe-specific policies embedded（歷史） | 錠 v1.2.0、釘 v1.3.0、木板 v1.1.0、腳手架 v1.3.0、巨匠藥 v1.2.0 當時已接 web；巨匠藥 `.70` 候選因 final 僅窄幅小利且 120 面板粗篩退步而撤回。當時 `.65` 在 120 組 synthetic panels 共 2400 場全完成、0 safety，但只有最強 8 組在所有 plausible episodes 滿品質；Command Brew reserved 已使用一次並轉 regression |
| Episode／research planner | shared contract complete, candidate unpromoted | action-only 0／72、continuation MPC 未泛化；causal root MPC 已有 closed-loop paired runner、完整 scenario identity／RNG 隔離／workload gate，首個巨匠藥 development case 是品質與 latency 負結果；option／certificate／bounded-risk modules保留，runtime owner 仍在 solver |
| 有限資料下的可靠性路線 | shared interpreter＋guide option extraction checkpoint complete；independent policy still in progress | 精準 condition transition、完整 loadout database、任務 score 曲線與大量玩家 trace 不作單件配方研究的硬阻塞；`craft-adaptive-policy-program-v1` 與首個巨匠藥 data program 已落地，在三個 regression panels／五個 plausible＋stress worlds 共 1,344 場全部完成、0 safety，但保守支線未保住無增益高尾，故未接 web／未 promotion。released guide 的進取／復原行為已另轉成 profile-ID-independent option segmentation，576 場／16,209 transitions 逐手等價；下一個未完成里程碑是把這些 option labels 編成獨立 data-only program，並在 plausible colored worlds 提高 `>=10200`／滿品質，而不是再以全白低分完成當成功 |
| 預設測試套件 | value audit complete | checkpoint `827cf73` 由 209 淨減為 193 tests；2026-08-20 為 58 files／394 tests。2026-08-23 撤回未落地 v2／六手切片的 20 個 Vitest 與 5 個 Rust tests，再移除 2 個低價值案例後，完整實測為 57 files／392 tests、Rust all-target 54 tests；仍以 failure contract 價值而非數量判斷 |
| Deployment | workflow ready, live version unverified（歷史） | `.github/workflows/deploy-pages.yml`；main push／manual dispatch，tests＋typecheck＋Vite build＋Pages artifact；當時五配方版本需另做 live smoke |

## 當時的實作順序原則

1. data identity 與 exact mechanics 先於 solver。
2. single-recipe simulator／replay 先於 recommendation。
3. readable guide policy 先於 approximate model。
4. WR.01 單件 craft 先於 WR.02／TR.01 mission complexity。
5. TypeScript single source 先於 worker／WASM optimization。
6. 每一 phase 通過 gate 才擴大 scope；未知 mechanics 不用 UI workaround 掩蓋。
7. 共用引擎先在單一 recipe 證明跨裝備 robust coverage，再逐 recipe 擴張；不等待所有配方、完整真實機率或精確 score curve 同時到齊。

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

> 2026-08-23 archived runtime snapshot（不是 current Web contract）：錠 `cosmic-titanium-guide-integrated-v1.2.0`、釘 `cosmic-titanium-nails-guide-integrated-v1.3.0`、木板 `hardened-survey-plank-guide-integrated-v1.1.0`、腳手架 `mobile-work-stairs-guide-integrated-v1.3.0`、巨匠藥 `survey-craftsmans-command-brew-guide-integrated-v1.2.0`。三個 exact 玩家面板已集中資料化；巨匠藥以實際面板與每步 state 重算，同一 `.65` config 經 120 組 synthetic equipment screening 建立完成／品質邊界，但尚無真實 unseen loadout population。assumed profiles／IID marginal 不是實戰成功率；當時的 worker null／錯誤／逾時會回到 `cosmic-craft-objective-lookahead-fallback-v1.5.0`。

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

> Cross-profile blocker：feature schema v2 已能區分 mechanics-derived base gain、current／max CP、craftsmanship boundary 與 cosmic tool flag，但只用單一 `CrafterProfile` 訓練仍不能證明適用其他裝備。正式 promotion 前仍需來源受限且可能存在的 CrafterProfile envelope、profile-grouped splits、cross-profile benchmark 與 OOD contract；完整 Teamcraft loadout replay 是未來收窄 assumptions 的較佳資料，不再是開始單一 recipe promotion 的硬阻塞。詳細 invariant 由 `solver_policy_and_safety.md` 管理，package／artifact 邊界由 `technical_architecture.md` 管理。

> 2026-08-14 productization checkpoint：表示與評估的基礎已升級，但效果證據尚未跟上。五配方有 data-only recipe／objective owner；domain 有單一 objective validator 與 mechanics-versioned 裝備 signature；feature v4 對 `requiredQuality=0` 配方仍保持有限值並含所有 specialist 資源；population／grouped split 可阻止同裝備跨 role；held-out evaluator 會要求完整 interpolation／boundary／OOD group coverage。這些只證明「測試方法較不容易自欺」，不是未知裝備已解好。真正 loadout-derived unseen population、seed／initial-state corpus content hash、cross-profile paired benchmark 與 OOD router仍未完成。optimistic scenario beam 已降為 existence／throughput negative control；新 causal root MPC 固定 guide continuation、paired random streams 與 completion shield，但尚未跑 closed-loop 效果，未接 runtime。Rust 只有 RNG／base-gain shared-fixture parity，沒有完整 transition／search 或速度收益。下一個視窗依 `solver-productization-handoff-2026-08-14.md` 的收尾順序繼續，reserved-final 不得用來選方向。

> 2026-08-20 shared-kernel／evidence checkpoint：五配方仍保留各自 objective、guide config 與 policy version，但 web、研究 evaluator 與 causal planner 已共用 solver-owned scenario resolver，並以完整 recipe／objective 內容 hash 阻止同 ID 漂移。evaluation seal 已鎖 seed、recipe×group initial state、population 與 split 內容；candidate factory 看不到 held-out／reserved 標籤或 corpus，boundary probe 也不能從 final groups 洩漏。正式 promotion gate 還要求 release-owned expected hashes 與 live evaluator result，並因「執行中的 policy bytes 尚未與宣告 artifact 綁定」及「reserved-final 尚未評估」固定拒絕 promotion。這只是可信評估底座；真正可重播的 loadout-derived unseen population、cross-profile 結果與 OOD router仍缺，沒有新 solver promotion。causal closed-loop runner已抓到巨匠藥單場從 guide 25 手／12000 品質退化為 33 手／7869、p95 約 2.53 秒的負訊號，之後加上更保守 gate，尚未有足夠樣本證明候選改善。Rust direct fixtures 現已逐一覆蓋 35／35 actions；10 個 fixed-action cases 鎖完整逐步 state／RNG／terminal／stop reason，另有 `native-root-plan-matrix-v1` 在 paired seeds 與 shared fixed continuation 下批量比較 root candidates。兩次 1,000,080 candidate×seed episodes／5,800,464 transitions 的 release 重跑約有 11.31～13.02x core、11.24～12.95x 含 process boundary收益。generic adaptive-program interpreter 也已逐手對齊 TS，但 MPC／generic search、runtime ABI 與 adaptive large-batch speedup 尚未完成；reserved-final 仍未使用。

> 2026-08-20 limited-real-data principle：使用者確認無法合理提供大量抽球、精準限時 score 點或大量成功／失敗玩家場次。後續不再把這些資料設成永久 blocker；先為一個 recipe 凍結來源可追溯的 plausible equipment envelope、condition-world suite 與 stress sequences，以 completion／已知品質門檻／lower tail／safety／手數／latency 做 paired robust evaluation。玩家 trace 改為正常遊玩時自然累積；condition、equipment、score 皆保留 versioned replaceable artifacts，未來 Teamcraft／官方／社群資料到位後整批 replay。promotion 逐 recipe 決定，只能宣稱 evaluated envelope 內的 model robustness，不宣稱真實成功率。

> 2026-08-20 first adaptive data-program checkpoint：solver 新增 `craft-adaptive-policy-program-v1`，把 recipe strategy 表示成 content-addressed nodes／guards／decisions 與 observed-only serializable memory；`decide` 純讀、`advance` mechanics 驗證後原子提交，錯 context、stale state、非 fresh entry 與 OOD equipment 都 fail closed。首個巨匠藥 artifact 不看 equipment ID：強能力 envelope `5350–5500／5215–5350／748–780` 走滿品質路線，exact 無增益 `5408／5140／630` 走保守路線，其他面板回既有 policy；兩個 route-consistent Good `Precise Touch` 規則只在窄 state／preview 證據包絡內生效。完整 development paired suite 為 primary 1,152＋stress 192：全部完成、0 safety；兩個強面板共 896／896 滿品質；primary 候選滿品質／10200／7200 為 `773／797／961`，相對 released guide raw quality `+120／-259／=773`、worst `-5433`，所以 machine gate 仍拒絕 default promotion。Rust generic adaptive interpreter 不硬編 recipe／equipment；最新 artifact 18 cases／386 transitions 與 TS 逐手 deep-equal，CI 強制兩種 native parity。這是跨裝備共用 interpreter／保守模式的有效里程碑，不是新的正式 solver release；reserved-final 未使用。

> 2026-08-20 risk-objective correction：使用者重申高難配方的設計本來就要求強烈依賴 condition；玩家成功影片曾以 Observe 等待機會球，低價值的確定完工不是產品成功。巨匠藥保守支線的 6839 品質僅落在已知 100 分區，因此降為 recovery／negative-control evidence，不再作預設方向。後續 primary gate 以 plausible colored worlds 的 `>=10200`、滿品質、完成與 recovery 為主；all-Normal／長白球只檢查 catastrophic failure／安全收尾並獨立報告。Observe、Hasty／Rapid 等可恢復風險允許進候選，重點是 budget 與失敗後路線，不要求 risky failure 為零。

> 2026-08-20 guide-risk extraction checkpoint：`command-brew-guide-extracted-risk-options-v0.1.0` 不改 released guide，而是把每一手分類成 mainline、作業／品質風險、condition opportunity、burst、recovery 或 safe finish，保存 actual action、serializable memory、risk counters 與 context／state binding。完整 U 384 場中 `355` 場至少一次下注失敗、總失敗 `1,643`、最多下注 `17`、最長連敗 `8`，仍 `384／384` 完成；F／S 各 96 場皆完成且滿品質。576 場／16,209 transitions 的 action、outcome、state 與 tier 全部等同 released guide，0 safety／budget mismatch。這是「先保存成熟司機的進取與救車能力」的 checkpoint，不是新 policy promotion；下一步才把 labels 變成能自行 commit／resume 的 data-only option program。

> 同步建立的 `command-brew-development-risk-evaluation-v2` 只接受完整 development coverage：三面板、三個 plausible worlds、128 seeds，加兩個 catastrophe worlds 至少 32 seeds。合理彩球 slice 逐 cell 檢查 7200／10200／滿品質、p10、平均與 worst paired downside；catastrophe quality 只報告，completion、hard stop、safety 與 failure recovery 才能否決。Trace 會以 canonical mechanics 逐手重算，但尚未證明 RNG origin／initial-state provenance，所以 formal promotion 固定 false；本輪 route／adaptive candidates 在完整 coverage 下仍被拒絕。

### 交付

- reachable state sampler。
- fixed-budget paired rollout evaluator。
- boundary／recovery／mistake／guide disagreement corpus。
- route-consistent planner、option contract 與後續 policy-value／option-prior artifact。
- stable／balanced／aggressive objectives。
- held-out condition profile／stats 與 adversarial benchmark。
- 單一 recipe 的 versioned plausible condition-world suite、equipment envelope 與自然 trace calibration path。
- artifact version、promotion／rollback mechanism。
- CrafterProfile sampling envelope、profile-grouped split、cross-profile／boundary benchmark 與 OOD router。

### Gate

- held-out completion／Gold 指標有統計支持的改善，或 trade-off 在預定容忍內。
- safety invariants 零違反。
- 任一明示支援 equipment group／plausible condition world 不得有 catastrophic regression；真實分布未知時，結果標為 model-robust evidence，不輸出實戰成功率。
- OOD fallback rate 與 tail failures 可見。
- planning／inference 保持 local；強規劃 p95 `< 1s`、web `3s` hard timeout，deadline fallback 通過。
- 未見裝備 profile 的 per-profile／worst-tail 指標不退化；超出 stat envelope 可安全 fallback。
- 若沒有穩定改善，保留 guide-policy-v1 並記錄 negative result。

### 下一個正式深度訓練視窗接手點

開始前先確認目前分支包含 `26939f5`（離線實戰老師研究管線）；simulator、teacher、policy-lab 與 worker 是刻意保留的已提交 POC，不要重做或刪除。依下列順序推進：

1. 先重跑 `npm run typecheck`、`npm test`、`npm run test:policy-lab`、`npm run benchmark:solver`；Vite build 依本機 `AGENTS.md` 使用需要的 sandbox permission。
2. 已完成：feature schema v2 能辨識 mechanics-derived base progress／quality、current／max CP、craftsmanship boundary 與 cosmic tool bonus；artifact version 已 bump，並有「不同裝備不再得到相同 vector」的測試。
3. 定義第一版 `CrafterProfile` sampling envelope。不要任意獨立亂數組合不可能存在的裝備；至少保留最低可行、常見、中高、上界與 CP／取整邊界，來源與假設另行記錄。先以這個可追溯 envelope 做單一 recipe 跨裝備 gate；未來 Teamcraft loadout 資料到位時新增 artifact version 並整批重跑。
4. 部分完成：`tools/train-policy` 保存 recipe／target profile／condition profile／policy population／seed／budget／source state class，並能由 checkpoint／artifact resume；仍需 mechanics／objective version、正式 split manifest 與 source trace grouping。
5. corpus 至少分成 natural reachable、guide disagreement、buff／combo window、condition opportunity、resource boundary、player mistake／recovery、live trace。現有 512-state action-only 實驗已證明多 continuation intent 混合會退化；先讓 direct planner 保存 `(optionId, actionId)` 與 route value，再產生 training targets。
6. split 以完整 CrafterProfile 與來源 trace 分組；先凍結 held-out manifest，再訓練，禁止依 held-out 結果反覆人工調 label。
7. 比較 `cosmic-craft-objective-lookahead-fallback-v1.5.0`、749 CP video-informed reference、consistent rollout planner、後續 option MPC 與 policy-value artifact。報告 overall、paired wins、per-profile、worst profile、worst decile、condition sensitivity、stop-reason taxonomy、safety violations、OOD fallback 與 runtime latency。
8. 只有 promotion gate 全部通過才新增 runtime artifact／loader 並讓 UI 使用；否則保留 fallback，將 negative result 與下一個 hypothesis 寫回本 roadmap。

目前可重現的 validation snapshot（2026-08-12，本機 Node／Vitest＋in-app browser smoke，不代表所有裝置）：

- `npm run typecheck`：通過；
- `npm test`：2026-08-14 產品化 dirty checkpoint 為 43 files／264 tests 通過；checkpoint `827cf73` 的價值稽核由 209 淨減為 193，目前另包含五配方 objective／catalog、裝備 population／held-out evidence、RNG consumption、native parity、causal planner，以及既有巨匠藥／scorecard／球色防連點 regressions；
- `evaluate:rollout-planner --planner guide-integrated --corpus planner-development-384-v1 --max-cp 749 --seed-count 24`：31／72，profiles 19／8／4，零 safety violation，paired 對舊 baseline +26／-1；2,387 states latency p95 `1.053ms`、p99 `8.127ms`、max `451.640ms`；
- 當時 GitHub Pages base `/frozen_rabbit_expert/` 的 Vite production build 通過，並產生歷史 `guidePlanner.worker` chunk；目前 worker contract 以 generic roadmap 與 current code 為準；
- in-app browser current-checkout smoke 已驗證 320×568、390×844、667×375：收合入口不再常駐所有配方，頁面無水平溢出；recipe dialog 在手機採內部捲動 bottom sheet，搜尋、focus、Escape／取消、切換與點目前配方重新開始均通過。dirty state 重置後回到第一步 Normal、滿耐久／CP、0 作業／品質與空歷史；console 無 warning／error。這仍不是所有真實裝置的視覺保證；
- 2026-08-23 當時公開頁面是否已包含五配方與 compact control／dialog 改動仍未 live 驗證；這條歷史缺口不得拿來描述目前 432-entry generic checkout。
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
5. 當時 UI 只常駐目前物品 icon／名稱／任務與 compact「切換配方」control；完整清單在可搜尋、可捲動、accessible 的 bottom sheet／dialog 中，並可明確重新開始目前配方。點目前或其他配方都以目前面板數值完整重置至 step 1、Normal、滿耐久／CP、零作業／品質且無 pending／action history。當時推薦卡用「強決策／快速備援」區分 worker；此措辭已被 generic 架構淘汰，目前若兩條路徑執行同一 policy，只能顯示背景執行／同策略備援與具體失效原因。

當時只先共用 mechanics、session 與參數化 equipment，objective、config 與 policy version 仍逐 recipe 維護；當時的下一步假設是先取得更多證據再抽通用 policy。這個執行順序已被 2026-08-24 的 generic 主線取代，不得拿來否決目前由共用 core、objective options 與 condition interrupts 組成的 solver。

當時的 recipe-specific 擴充流程為 data profile → `CraftObjective` → scenario registry → planner config／mission policy → mechanics／scenario regression → fresh development corpus → 玩家 trace。generic 時期不再要求每個 recipe 新增 planner config／mission policy；目前 onboarding contract 以 broad roadmap 為準。只有不同 mechanics 才改 domain；不同數值、球色或目標仍應以 data／objective 注入。

## 已完成第一版：製作工匠所需的複方藥第三件

2026-08-12 已把「宇宙探索用的巨匠藥」接入現有單件 craft runtime：

1. 支援範圍只包含任務第三件 Recipe 36582／Item 48570；前兩件仍由玩家以其他方式處理，網站沒有三件合計分數／時間的 mission controller。
2. mechanics 為作業 10000、耐久 55、品質上限 12000、`requiredQuality=0`；`CraftObjective.qualityTarget=12000` 才表示滿品質目標，不能把它改寫成 craft failure 條件。
3. 已知 1020–1200 收藏價值對應 700–1000 分；10800 品質只是頂段線性內插得到的 provisional 800 分 proxy，待下一張遊戲內分數區間／結算畫面修正。
4. `survey-craftsmans-command-brew-guide-integrated-v1.2.0` 保留可證 quality-first route 與 bounded certificate，並只在完整剩餘路線仍可 100% 滿品質完成時，採用 Good `Precise Touch` 或 Good／Malleable 作業替換；品質提前滿時直接跳進作業 phase。specialist actions 仍關閉，維持單一 recipe policy identity。
5. exact 食藥非專家 development primary／stress 維持 `384／384`、`64／64` 完成且滿品質；首次 frozen primary／stress 也維持 `768／768`、`128／128`，paired 手數 `78` 較短／`0` 較長／`690` 相同，condition-responsive uses `1717／928`。無 buff development primary 完成 `384／384`、滿品質 `145／384`，仍標 OOD。這些是 assumed IID sensitivity，不是實戰率；該 v1.2.0 checkpoint 當時尚未執行 reserved-final。
6. 2026-08-23 已對鎖定的 `v1.3.0-candidate.1` 執行一次 reserved-final。兩版 primary 都完成 `4606／4608`，paired `>=10200 +5／-5`、滿品質 `+10／-4`；相同兩場 U／Normal-heavy policy-null 會在 web 啟動 quick fallback。candidate 的 120 synthetic panel 單 seed 配對 high `139／142`、full `131／134`、平均品質 `7989／8195`，故拒絕升版並把 runtime 撤回 v1.2.0；該 final corpus 此後只作 regression。
7. 現行 `.65` 另在 120 組 synthetic panels、三個 plausible worlds 與兩個 catastrophe worlds 各 4 seeds 共 2400 場全部完成、0 safety，primary／stress p95 decision latency `33.03／35.48ms`。只有最強 8 組在所有 plausible episodes 滿品質；弱裝備是可收尾但分數隨球運波動的 coverage，不得外推成真實 OOD promotion。

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
