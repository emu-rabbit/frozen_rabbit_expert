# Solver Policy、Objective 與安全規範

## 核心邊界

正式 runtime 是**本機、固定預算、可 fallback 的 recommendation planning／inference**。它不 materialize 完整技能／condition policy tree、不以 memo capacity 硬撐完整 DP，也不執行無 deadline 的 primitive-action tree search。未來較強規劃器以 p95 `< 1s` 為體驗目標；目前 web 以 `3s` 為硬上限，逾時終止 Worker 並以同一 generic policy 同步備援。3 秒不得被當成可長期占滿的日常預算。

Mechanics engine 應精確；policy 是可版本化、可評估、可 fallback 的近似推薦。

## Recommendation pipeline

```text
exact current state
  -> legal action mask
  -> terminal / catastrophic hard veto
  -> derive phase
  -> recipe / objective / risk signals; optional historical guide priors only in offline research
  -> route options / small candidate set
  -> finisher feasibility / required reserve
  -> fixed-budget paired planning or policy-value inference
  -> action + alternatives + reasons + confidence
```

Pipeline 中的策略責任分三層：

- **Core route guard**：跨 objective 共用 legality、terminal、資源、progress finisher、recovery 與避免過早完成；這一層不決定玩家應追求哪個品質尾端。
- **Objective option**：依 required-quality、collectability／score、HQ／maximize-quality 與 risk preference 決定 progress commitment、quality floor、burst／cashout 與 variance budget。
- **Condition interrupt**：依目前球色提出限時機會，例如 Good 的 Precise／Intensive／Tricks、Pliant 的高 CP option、Malleable 的 progress window、Primed 的 buff window；它必須附 resume／termination 條件，不能每步因小分差換掉整場意圖。

Core invariant 只 veto 可證明的路線破壞；stable／balanced／aggressive 可透過 objective option 接受不同 probabilistic downside。若完整後綴顯示某個球色機會值得承擔代價，resolver 可以選它；「保守」不能成為所有模式的隱藏硬限制。

## Phase policy

預設 phase：

1. `opener`
2. `secure-progress`
3. `build-inner-quiet`
4. `maintain-resources`
5. `prepare-quality-burst`
6. `quality-finisher`
7. `complete-synthesis`
8. `recovery`

phase 是由 current state 推導的 feature，不是只能單向遞增的 stored truth。action failure、玩家偏離、資源惡化或新 condition 都可進入 recovery／secure-progress，再回到品質 phase。

## Guide policy signals

Teamcraft Expert Crafting Guide 可作 `guide-policy-v1`／`pi_0`，但不是 mechanics oracle 或已證明最優答案。規則不翻成一條命中即 return 的巨大 `if/else`。

```ts
interface GuidePolicySignal {
  ruleId: string;
  kind: 'hard-veto' | 'required-reserve' | 'candidate' | 'utility-adjustment';
  action?: CraftActionId;
  value?: number;
  reasonCode: string;
  source: string;
  confidence: 'verified' | 'guide' | 'assumed';
}
```

同一 condition 可以產生互相競爭的 signals。例如 Good 可能同時支持 Tricks、Precise Touch、Intensive Synthesis 或品質收尾；resolver 必須比較 state、reserve 與 objective，而非固定回傳第一條。

## Candidate gate

每個 phase／condition 只保留少量有意義候選，降低評估與解釋成本。候選來源是可測、可版本化的 default，不是永久真理：

- Malleable：progress candidates。
- Centered：RNG actions 的成功率價值。
- Pliant：昂貴 recovery／buff actions。
- Primed：長效 buff candidates。
- Good：CP recovery、Precise／Intensive、finisher opportunity。
- Robust／Sturdy：durability-efficient actions。
- Normal：low-cost progress、resource maintenance、Observe、phase transition。

legal action mask 與 safety veto 永遠先於 candidate preference。

Safety veto 只處理可證明的災難或結構性循環，不把高變異策略永久封死。2026-08-11 玩家 trace 顯示改革剩一回合可合理續上，也提出 Pliant 時即使 buff 尚餘多回合仍可能值得刷新；因此可恢復的 active buff refresh 不再 hard-veto，由 full-route outcome 判斷 opportunity cost。共用 safety layer 不把第一次 Observe 永久列為非法；但 v0.5.1 與只作 deterministic normalization 的 `generic-craft-route-objective-condition-v0.6.0-migration-oracle` 在 explicit cross-step continuation token 完成前都不主動開啟 Observe fishing，避免付出 7 CP 後下一次重排靜默放棄 Advanced Touch。若玩家實際 Observe 且 state／actual history 證明 combo 已成立，live policy 會優先使用可支付的 Advanced Touch，Good 時則可改用 Precise Touch。active Final Appraisal 的再次施放是零工次、同狀態 deterministic loop，另作 hard veto。未來重新開放主動 Observe 時必須有明示 budget、termination 與 condition interrupt contract；不代表 Observe 會提高 Good 機率或應成為常規推薦。

## Finisher certificates

維護固定大小、人工設計且已用 mechanics 驗證的 progress／quality finisher templates。它們是**可中斷 option**，不是巨集：每一步仍重新推薦，出現 Good／Pliant 等高價值 condition 時可改變路線。

certificate 至少描述：

- preconditions；
- CP／durability／buff／one-use resource requirements；
- guaranteed 或 probabilistic progress；
- expected／minimum quality effect；
- action count／time estimate；
- applicable recipe／stats／condition assumptions；
- mechanics version 與 tests。

每次候選評估至少檢查：

- 使用後是否仍有一組可行 progress finisher；
- CP、durability、buff 與 one-use resource reserve 是否足夠；
- 是否可能意外完成 progress 而失去品質機會；
- WR.01 是否已達 target、能否安全結束；
- WR.02 是否仍可在剩餘 real time 完成；
- TR.01 是否讓 joint failure risk 超過底線。

尚未有 proof 的區域只能顯示 viability estimate，不稱 guaranteed。

## Mission objectives

保留 outcome vector，不過早壓成單一 scalar。

### 配方完成條件與品質目標必須分開

`RecipeProfile.requiredQuality` 只表示 mechanics 的最低完成條件；solver 另接收 recipe／mission objective 的品質或分數目標。不得用 `quality / requiredQuality` 作通用 feature，也不得把 `quality >= requiredQuality` 直接等同「停止做品質」。

- 宇宙鈦鐵錠：最低品質與目標品質都是 18900；品質未達時完成作業就是失敗。
- 宇宙鈦鐵釘：最低品質為 0、配方品質上限為 27400；作業達 10000 即完成，品質未滿不是 craft failure。玩家遊戲內任務表另確認收藏價值 2710 是 1000 分上端，因此 policy target 是 27100，不是 mechanics 上限。固定 WKS mission data 與八職對應任務頁確認同 mechanics family 的單件要求／conditions 共用，故這組 objective template 套用到該 family 的所有 recipe identity；任務 ID、材料鏈與跨件總分仍分開。
- **【高難】製作工匠所需的複方藥** 三件目前都已進 catalog／單件 development-preview；Recipe 36582 提供較完整的 family-level objective evidence。它的最低品質為 0、品質上限為 12000；作業達 10000 即 mechanics completion，policy 另以滿品質 12000 為主要目標。同 mechanics／單件任務要求的職業對應 recipe 共用這個 objective template；任務 identity 與跨件 controller 不合併。已知收藏價值 1020–1200 對應 700–1000 分，但區間內精確換算未知；品質 10800 只是假設線性內插的暫定 proxy。跨三件 mission controller 尚未支援。
- nail score 表為 1644–1917→100、1918–2465→300、2466–2710→700–1000；錠固定 80，Silver／Gold 分別 980／1080，所以一錠一釘需要釘至少 900／1000。700–1000 區間內精確映射仍待遊戲結算 evidence；未驗證前分開報 high tier、95%／97%／97.5% 任務目標與 27100，不自行假設線性，也不稱 Silver rate。
- 宇宙探索用的硬化木板：作業 4700 與必要品質 14900 都達成才算 valid completion；滿品質 count 不是可和腳手架成品共用的軟效用。
- 高空作業用的腳手架：作業 9300 完成是 hard gate，之後才比較 0–22500 品質與 HQ utility。Patch 7.4 Lodestone 玩家研究並以 Teamcraft cross-check 的曲線目前只作 provisional utility；沒有本任務遊戲內 HQ 百分比／結算 evidence 前，不得把 estimate 寫成真實 HQ rate。

以下 WR.01／WR.02／TR.01 只保存 historical mission-controller objective examples，不代表目前 432-entry 單件 catalog 的 mission coverage。

### WR.01

1. 完成最終 craft。
2. 達到使用者要求的 Silver／Gold 門檻。
3. 不破壞前兩者下提高 quality／score。
4. 減少不必要步數與昂貴資源。

### WR.02

1. 在 mission deadline 前完成。
2. 達到累積 Gold target。
3. 合理分配兩次 Material Miracle。
4. 控制每步思考／輸入時間。
5. 再比較 expected score。

### TR.01

1. 兩件都不失敗。
2. 累積分數達到 Gold。
3. 分配 Stellar Steady Hand。
4. 降低 joint catastrophic failure。

## Risk profiles

- `stable`：嚴格保護 completion 與門檻 success。
- `balanced`：允許有限完成率交換較高 Gold opportunity。
- `aggressive`：接受較多 Rapid／Hasty variance，但仍有最低 completion／failure cap。

risk profile 是效用偏好；不可用新手／高手、好／壞描述。門檻與權重要保存版本，並用 scenario evaluation 解釋差異。

## Offline policy improvement

### 2026-08-14 productization research boundary

`scenarioBeamPlanner` 當時只可當 optimistic existence／throughput negative control：它能看到各抽樣路線的未來，回答「是否存在一條好路」，不能代表玩家在當下資訊下可執行的 policy success。研究候選 `certificate-shielded-causal-root-mpc-v0.1.0` 當時改為每次只比較目前 root action，所有候選之後都回到同一個 scenario guide，並以相同 random streams 對照；只要 baseline 完成而候選未完成，或 worst-profile completion 下降，就退回 baseline。

這個 causal root MPC 在該次研究只通過五配方候選上限、baseline 保留、paired RNG、Good Omen／no-step 語意與 budget fallback smoke；沒有未知裝備／held-out／frozen evidence，也未接 web。當時曾列出的後續 paired comparison 不再代表目前 generic 主線。

### Current generic runtime

Web 對 432 個 Cosmic expert entries 一律使用 `generic-craft-route-objective-condition-v0.6.0-migration-oracle`。它保留 v0.5.1 的策略層次，但以固定 node work budget 與 canonical tie-break 移除 wall-clock／locale 對選招的影響，作一次性 Rust migration reference；這不是策略改善宣稱。它直接讀取 recipe、完整 objective、實際裝備、完整目前 state、實際 action history 與 stable／balanced／aggressive；共用 route core 處理資源／phase／收尾，objective strategy 選擇 hard requirement、verified tier 或 continuous quality floor，condition tactics 處理當步球色機會。progress-only contract 達 voluntary floor、Inner Quiet 10、最後一個耐久窗口且 Good 遇到已付 Great Strides／Innovation 時，會立即使用仍保留 bounded guaranteed finisher 的 deterministic quality consumer，不用 Tricks 或 refresh 放棄 setup；只有品質效用飽和才直接執行 certificate。bounded proof 不存在不等於不可行；pre-route contingent synthesis 只可取代沒有 funded quality consumer、也沒有 guaranteed certificate 的 setup，其他情況必須等共用 route 與 lookahead 都回空才成為最後救援。balanced／aggressive 可接受這個「當下成功即交貨」選項，stable 仍 fail closed。這條規則不得套用到未達 `requiredQuality` 的 hard-quality craft。Worker 與同步 fallback 執行同一 generic policy implementation，目前只差執行隔離，不再路由五個 recipe-specific guide，也不得標成兩種策略強度。全部 entries 目前只標示 mechanics-ready／development-preview：family smoke 尚有 hard-quality policy-null，未達 experimental gate；兩條執行路徑都無合法建議時 UI 必須明示無路線並開放手動合法技能與 resync，不得永久顯示計算中。

Rust offline owner 的下一輪候選是 `generic-craft-opportunity-reserve-v0.18.0`。它不是把獨立小規則逐一打開，而是一個完整、可恢復的策略結構：progress reserve 作持續 intent；Good／Pliant／Primed 只在高價值時 interrupt；動作後回復 reserve；progress headroom 足夠才切入 integrated quality／recovery／cashout／finish。研究 probe `research-opportunity-reserve-guide-direct-v0.1.0` 與 release candidate 在 300-case 檢查完全一致，避免 root selector 意外改寫結構。後續策略迭代以 Rust A/B 為主；Web 接入時移植同一 Rust core，而不是把 v0.18 另行手抄回一套 TS policy。

### Historical five-recipe policy evidence（非 Web runtime）

`cosmic-titanium-guide-integrated-v1.2.0` 是舊宇宙鈦鐵錠 POC policy。它不是單步分類器：先按目前狀態推導路線階段，以實際 action history 重建計數，維護 Manipulation／Waste Not 耐久循環，使用有限節點的作業與品質收尾證明。v1.2.0 另允許一手 deterministic progress prefix，但只有「前綴→滿品質 burst→保證作業收尾」完整 route 可證明時才使用；frozen 三裝備合計 valid completion `986／3072→990／3072`，paired completion `+4／-0`，0 safety regression、0 額外 specialist invocation。效果很小，只作 historical comparator。

Historical frozen benchmark 固定三個玩家面板：無 buff `5408／5140／630`、食藥 `5408／5237／749`、食藥＋專家 `5428／5257／764`，皆宇宙工具 ON。玩家 95 球 empirical marginal（36／14／13／13／10／9）只是 IID marginal replay，不是 exact transition model 或真實成功率。

舊 Web 曾在 worker 執行 scenario 對應 guide 並以 `cosmic-craft-objective-lookahead-fallback-v1.5.0` 備援；這段 latency evidence 只保留作歷史 regression，不是目前 generic worker route。現行 `3000ms` watchdog、立即 worker failure／null 與 elapsed／reason UI contract 仍保留，但 fallback owner 已改為同一 generic policy。

釘 v1.3.0 historical comparator 保留 27100 任務目標與 completion-first safety。observed 128 場 high `9→12`、27100 `3→6`；完整 development high `37→45`、27100 `24→27`，但 p10 `11700→11274`、minimum `5214→2794`。這是高分尾 trade-off，不是全面 dominance、真實 100% 或目前 generic roadmap 的調參優先級。

巨匠藥 historical comparator `survey-craftsmans-command-brew-guide-integrated-v1.2.0` 仍保存為單一 recipe policy identity，不建立「專家／非專家兩套策略器」。它的 bounded certificate、Good／Malleable 局部支配替換、滿品質後作業 phase 與 specialist-off 只說明舊 POC 已驗證的策略形狀，不是目前 Web route。

2026-08-23 鎖定的 `.70` 候選已執行一次 Command Brew reserved-final。primary 每 arm 4608 場，兩版 completion 都是 `4606／4608`，相同兩場 U／Normal-heavy 走到 policy-null；paired `>=10200 +5／-5`、滿品質 `+10／-4`、raw quality `+63／-35`、平均差 `+9.06`，F／S 逐場持平。catastrophe 384 場的 completion／10200／12000 tier 持平，raw quality `+3／-9`、平均 `-3.60`。另在 120 組 synthetic equipment 的同 seed 粗篩，candidate primary high `139／142`、full `131／134`、平均品質 `7989／8195`，與通裝備目標相反，故撤回而未 promotion；final corpus 此後只作已揭露 regression，不得再用來選門檻。

Historical `.65` v1.2.0 在 `5200–5500 craftsmanship／4900–5350 control／580–780 CP`、宇宙工具 ON、非專家的 120 組合成面板，三個 plausible profiles 各 4 seeds 與兩個 catastrophe profiles 各 4 seeds 共 2400 場全部完成、0 safety；primary p95 decision latency `33.03ms`，stress `35.48ms`。120 組都至少一場進 10200／滿品質，但只有能力最強的 8 組在 12 場 plausible episodes 全部滿品質。這證明舊單配方策略可跨明示 mechanics grid 收尾，不證明 generic runtime、真實裝備人口、自然球色或弱裝備穩定高分。

2026-08-13 玩家提供四筆食藥非專家 `5408／5237／749`、宇宙工具 ON 的匿名 web exports。三筆無 action failure 的場次都是 25 手滿品質完成，技能序列除最後 Good 可用集中製作外幾乎相同；另一筆含 8 次高速製作失敗，export 在 37 手、作業 9070／品質 9232 時仍未 terminal，保留作 recovery evidence。這四筆是 actual action／outcome／condition event path，沒有每步遊戲畫面數值或最終任務得分，不是 mechanics golden oracle，也不足以估 transition probability。

由三筆 clean route 抽出的 exact-profile 固定序列在全 Normal mechanics replay 於 25 手為作業 9762／品質 12000；尾端補一手 100% 的製作後，26 手作業 10000／品質 12000。相同 26 手候選在四筆 observed condition streams 都滿品質完成；即使第 6 手精密製作遇到 Malleable，其作業量也不足以在第 15 手品質收尾前完成，只會讓後段作業較早結束。這只支持 Recipe 36582 與上述 exact stats 的玩家試跑候選，不推廣為任意裝備／配方通用巨集，也不取代 condition-aware policy 的研究目標。

**【高難＋】製作高空作業所需的腳手架** 的木板 v1.1.0／成品 v1.3.0 只保留為 historical comparators。它們證明 required-quality 與 HQ-quality objective 不可混用、late Good 可在可證收尾下延伸品質，也保存過度硬步數規則的負結果；詳細 paired 數字由 historical handoff／scorecard 擁有，不再是 current runtime 規範。

Historical paired benchmark 使用玩家三組 exact profiles與三個 assumed condition profiles；舊 4-seed／舊 corpus screening 與發生 specialist leakage 的 Round 0 只保留歷史診斷。固定 risk-attempt cap 與固定 progress-floor 調整都曾使 completion／滿品質退步；不可把 cap 或 progress ratio 寫成跨裝備常數。

### 2026-08-12 historical five-recipe frozen regression scorecard

以下 scorecard 是 final checkout 對已查看過的 versioned frozen corpus 做可重現 regression，不是新的 promotion evidence 或遊戲內成功率。headline 對每個配方／裝備等權混合三個 assumed condition profiles、每 profile 256 seeds，故 `N=768`；high 是釘品質 `>=24660`（收藏價值 `>=2466`、已知 700–1000 分區），不能稱 Silver／900 分率；HQ 是完成品品質經 provisional community curve 單調轉換後的中位數，不是 Recipe 36208 遊戲內 oracle。

| Exact 裝備 | 錠 valid completion | 木板 valid completion | 釘 completion | 釘 high | 釘 `>=27100` | 腳手架 completion | 腳手架 median quality | provisional median HQ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 無 buff／宇宙工具 | 57／768（7.42%） | 376／768（48.96%） | 767／768（99.87%） | 6／768（0.78%） | 1／768（0.13%） | 768／768（100%） | 13920／22500 | 19% |
| 食物＋藥水／宇宙工具 | 248／768（32.29%） | 642／768（83.59%） | 768／768（100%） | 61／768（7.94%） | 33／768（4.30%） | 766／768（99.74%） | 19218／22500 | 81% |
| 食藥＋專家／宇宙工具 | 295／768（38.41%） | 672／768（87.50%） | 768／768（100%） | 117／768（15.23%） | 54／768（7.03%） | 768／768（100%） | 19398／22500 | 82% |

錠／釘另以玩家 95 球 empirical IID marginal 各跑 256 seeds 作補充邊界：錠 valid completion 為 `32／256`、`168／256`、`190／256`；釘 high 為 `1／256`、`27／256`、`69／256`，但後者只是把錠的 marginal transfer 到釘，不能當 nails transition probability。兩組 scorecard 全部 safety violation 為 0；本段錠／釘的 reserved-final 狀態不因 Command Brew 已開封而改變。

無 projected-quality gate 的 CP100 cashout 已由 frozen v1 拒絕：三裝備 HQ point estimate 皆負且 interval 跨 0。通過的 v1.2.0 只路由 exact 食藥 profile；無 buff／專家 stats profile維持保守 baseline。HQ 曲線來自 Patch 7.4 Lodestone 玩家研究並以 Teamcraft cross-check，仍是 provisional community utility，不是 Recipe 36208 遊戲內 oracle。詳細完整矩陣與負面結果由 `expert-crafting-training-handoff-2026-08-11.md` 保存。

```text
pi_0 = versioned guide-policy-v1

repeat for a fixed small number of rounds:
  simulate pi_i and collect reachable states
  add boundary, recovery, OOD and player-mistake states
  compare gated candidates with paired fixed-count rollouts
  fit a route-aware policy/value model or option prior when planner data is strong enough
  evaluate on held-out stats, recipes and condition profiles
  reject if safety or holdout performance regresses
```

每個 rollout 只抽一條 future trajectory；計算量由 `N states * C candidates * K rollouts * H horizon` 控制，不建立 exponential tree。

`cosmic-titanium-rollout-teacher-v0.1.0` 的第一場玩家實戰已證明窄 scenario oracle 不足：greedy continuation 讓逐步 replan 浪費 Veneration、Good opportunity 與未結束的 Waste Not II／Manipulation。此版本 `RESEARCH_TEACHER_PROMOTED=false`，不得進入玩家 runtime。下一版需先把 reachable／boundary／mistake states 與完整 episode route commitment 批次化、建立 held-out evaluation，再蒸餾 compact artifact。

`packages/policy-lab` 是替代路徑：多個 continuation policies 先提出候選路線，在相同 condition／success streams 下完成 episode。舊 objective 只把 terminal failure 當失敗，並在零完成時偏好較短 episode，實際會獎勵更快卡死；目前 evaluator 已加入 `policy-null`／`no-legal-action`／`illegal-action`／`action-limit` taxonomy，只有成功路線才比較步數。compact scorer 的 training accuracy 不構成 promotion，必須另外通過未參與訓練的完整 episode corpus。

2026-08-11 後續依「有意義的訓練不因小樣本未進展即判死」擴到 512 states、每候選 3 profiles × 8 futures，並以 64 hidden-unit compact scorer、candidate-state DAgger、單一固定後續與一輪 artifact policy iteration 驗證。過程發現 simulator 曾讓 no-step Final Appraisal 消耗未來 condition／success RNG，造成不存在於遊戲的抽球優勢；修正後 Final Appraisal labels 由 55／512 降至 10／512。多後續與自我策略迭代仍無法完成 72 場；單一 video-informed continuation 的最佳 compact lower-tail balance 為 31.6%，低於 reference 的 52.0% 與 4／72。training accuracy 約 93% 仍不能轉成完整 episode，證據指向 action-only labels 遺失 continuation intent；下一步應研究 option／route learning，不再只堆同型單步 labels。

2026-08-12 以現在 guide 重評舊 722 CP regression，legacy 由舊 target `4／72` 提升到 guide `23／72`（paired `+19／-0`），secondary 由 `4／72` 到 `19／72`（`+15／-0`），所以舊結果不能證明 on-policy improvement／evolution 不適合此遊戲，弱 teacher 確實是重大混淆因素。但直接把強 guide 塞回逐步 one-step guide-continuation，在 1 seed × 3 assumed profiles smoke 仍由 guide `2／3`／`1／3` 退為 `0／3`；teacher 變強沒有消除 action-only／route identity、decision memory、objective 與 closed-loop distribution 問題。research-only conservative gate 即使要求 local average completion 嚴格增加、robust completion 不降且 paired guide-only loss 為 0，完整 episode 仍可退為 `0／3`；再要求至少 5 個 candidate-only paired completions（0 反向損失）後才回到 guide 的 `2／3`，且本次沒有實際偏離。因此這個 gate 只是防止小樣本局部優勢破壞 parent 的安全 scaffold，不是 student 已改善的證據。後續重啟必須讓 student 保存 `(optionId, actionId)`、route memory 與 distributional completion／hard-stop／quality／time value；由 student 跑到的 states 再交 strong guide／certificate teacher 標註，並只在 paired conservative gate 通過時偏離 parent。舊 compact 自己作唯一 teacher 的 bootstrap-only round 不等於真正多世代 evolution。

新的第一個 research baseline 是 `consistent-continuation-rollout-planner-v0.1.0`：每一步比較所有合法非災難 root actions，但所有候選都接回同一個明示 continuation，以完整 episode paired rollouts 直接做 one-step policy improvement；不再先蒸餾成 action-only class。修正 stall objective 後，single-continuation one-step improvement 與整場 fixed continuation 都未在 749 CP regression 勝過 6／72 reference，只保留作 negative controls。每步重選 `(continuationId, actionId)` 的 MPC 在兩組已看過 regression 分別得到 7／72 與 10／72，對照皆為 6／72，且零 safety violation、p95 約 160ms；但 development corpus 的首批 24 seeds/profile 是 6／72 對 6／72、paired 2 勝 2 敗，未重現完成率提升。worst-profile completion 仍為 0、raw unfinished quality 下降、continuations 尚不是真正 options，因此只是值得延續的 research signal，不得 promotion。

第一版 `video-informed-mainline-v1` route contract 已在 `routeOptionController.ts` 落地。主線 options 依序為 `progress-window`、`inner-quiet-build`、`quality-cycle`、`quality-burst`、`safe-finish`；`resource-recovery` 與 `bounded-condition-fishing` 是帶 `resumeOptionId` 的可返回 suboptions。`PlannerContext` 與 mechanics `CraftState` 分離，controller 保存可序列化 option memory、action budget、observed transition count 與 resume target；每個 episode 由 factory 建立隔離 memory。active option 仍可利用 Good／Pliant／Centered 等 condition interrupt，但只有 option completed、needs-recovery、infeasible 或明示 route boundary 才能換 option，不能用 Monte Carlo 微小分差每步換人格。目前每個 option 暫時只暴露 target policy 的一個 mainline candidate，尚未接 MPC、finisher certificate 或 runtime。

第一版 planner 比較 `(optionId, actionId)`，每個 option 只提出 1–3 個 mainline／condition-interrupt candidates。所有候選使用 common random numbers，先給同樣少量 futures，再以 successive halving 把約一秒預算集中到前幾名；rollout 內沿用同一 route controller 與獨立 memory copy。實際 action outcome 回報後才更新 route memory，再在同一 active option 內重規劃。只有建立可信的 option-level search visits 後，才訓練 completion／stall／resource quantiles 的 distributional value ensemble 與 option prior；不再以單一 argmax action label 當 teacher truth。

候選比較使用 common random numbers。除了自然 sampling，刻意涵蓋連續 Normal、RNG action 連敗、晚 Pliant、關鍵 Good timing、Robust→Sturdy、資源邊界、player mistake／resync 與 Miracle expiry。

### 裝備泛化與 OOD

policy artifact 的適用範圍必須包含 `CrafterProfile`，不能只綁 recipe。不同 craftsmanship／control 會改變離散取整後的 action gain，不同 max CP 會改變 combo、buff window、repair 與 finisher 的可行性，宇宙工具也會改變 Good 品質價值。

- train／validation／held-out 以完整裝備 profile 分組，禁止同一 profile 洩漏到不同 split；
- label 與 evaluation 覆蓋最低可行、常見、邊界與高配 profile，不只使用開發者當前面板；
- 報告 overall 之外的 per-profile、worst-profile 與 worst-decile completion／failure；平均改善不可抵銷某群玩家的 catastrophic regression；
- artifact 宣告 recipe、stat envelope、tool flag coverage 與 OOD rule；超出範圍時 fallback，不聲稱 universal；
- 若單一 conditional policy 無法穩定涵蓋離散 gain／CP boundary，允許使用多個 versioned stat-bucket artifacts，但必須有 deterministic router 與 boundary tests。

## Policy promotion gate

planner／policy artifact 只有在以下全部成立時才可取代預先凍結的 generic／heuristic baseline；舊 guide 只在適用 recipe 作離線 comparator：

- held-out／adversarial metrics 有統計支持；
- completion／Gold 改善或 trade-off 在預先定義容忍內；
- safety invariants 零違反；
- OOD fallback 可見且有效；
- artifact 可版本化、重現、回退；
- runtime latency 達標且不依賴 server。
- 未見 `CrafterProfile` 的 held-out／boundary 評估不退化，且 artifact 對裝備範圍與 OOD 行為有明確 contract。

若 baseline worst-profile completion 已至少 `99.5%`，不能再要求 candidate 必須增加 completion 才承認改善。通用 gate 中，candidate 在 worst-profile／average completion 無觀測退步、沒有 safety／failure／hard-stop／stall regression、objective 不退步，且平均成功手數至少縮短 `0.25` 時，可標記 `near-perfect-efficiency` improvement。巨匠藥另有 recipe-owned `near-perfect-condition-responsive-efficiency` gate：兩側都完成且滿品質的 paired episodes 不得出現 candidate 較長或較少 condition-responsive action，平均手數不得增加，且必須有至少一組局部色球利用提升；Good 替換還要逐步滿足更高品質、CP／耐久不增加與完整剩餘路線可證。報告仍需 paired 手數、condition-use 勝負與 held-out／adversarial 範圍，不能以「看起來有看球」取代 outcome safety。

若改進沒有穩定勝出，保留目前 generic baseline 或降回 development-preview 是有效研究結論；不得為了使用更複雜模型而升級。舊 guide 不因此重新成為 Web fallback。

## Recommendation contract

```ts
interface RecommendationConfidence {
  mechanicsVersion: string;
  conditionProfileConfidence: 'verified' | 'empirical' | 'assumed';
  policyCoverage: 'in-distribution' | 'near-boundary' | 'out-of-distribution';
  evaluationSampleSize?: number;
}

interface Recommendation {
  action: CraftActionId;
  alternatives: Array<{ action: CraftActionId; tradeoff: string }>;
  phase: string;
  reasons: string[];
  metrics: {
    completionProbability?: number;
    silverProbability?: number;
    goldProbability?: number;
    expectedScore?: number;
    catastrophicFailureProbability?: number;
    expectedRemainingSteps?: number;
  };
  confidence: RecommendationConfidence;
}
```

metrics 可以缺省；沒有可靠 probability model 時，寧可不顯示精確數字，也不產生虛假精準度。
