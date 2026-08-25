# Mechanics 與 Policy 驗證規範

## 目的

本文件定義什麼證據足以支持 mechanics correctness、policy quality 與 runtime readiness。不同問題使用不同 test layer，不用單一「測試通過」取代完整判斷。

## 1. Mechanics unit tests

每個 supported action 至少涵蓋：

- legal／illegal；
- success／failure；
- relevant conditions；
- CP／durability／progress／quality 與取整；
- buff apply／tick／consume／expire；
- combo 與 one-use resource；
- terminal progress／durability boundary；
- no-step／no-tick semantics；
- explanation／reason code 對應實際 effect。

公式測試使用 table-driven fixtures，明確保存 intermediate values 與 rounding stage。不要只 assert 最終 summary。

## 2. Invariants／properties

- `0 <= cp <= maxCp`。
- durability 不超過 recipe max；若容許負值表示 terminal ordering，contract 必須明確。
- Inner Quiet、buff duration、one-use counters 在合法範圍。
- illegal action 不產生 transition。
- terminal state 不推薦一般 action。
- outcome probability sum 在 tolerance 內為 1。
- forced transition 不被 generic sampling rate 覆寫。
- deterministic／100% success action 不產生虛假 failure branch。
- no-step action 的 step／buff tick／condition transition 符合 evidence。
- event replay 在相同 model versions 下 deterministic。

## 3. Golden player traces

Golden trace 是 mechanics 最重要的 oracle。每一步比較：

- previous state；
- action legality／cost；
- success／failure；
- progress／quality／durability／CP；
- buffs／Inner Quiet／combo／one-use resource；
- next condition；
- terminal result。

mismatch 必須定位到 data、formula、rounding、buff timing、event transcription 或 patch drift。不得為了讓 fixture 綠燈直接修改 observed value。

trace intake／replay workflow 見 `.agents/workflows/validate-golden-traces.md`。

## 4. Small exhaustive oracle

可以在人工縮減的 state/action/horizon 使用 exhaustive checker 驗證 transition、tie-break 或 candidate comparison，但：

- 不進 production runtime；
- 不使用完整 EX+ state space；
- 不以 toy exhaustive success 證明正式 solver 可擴展；
- oracle 與 production code 不共用同一段可疑 optimization。

## 5. Policy evaluation

資料切分至少包含：

- training recipes／stats／profiles；
- held-out stats；
- held-out condition profiles；
- adversarial scenario suite；
- player deviation／mistake／resync；
- recovery／boundary／OOD states。

輸出至少包含：

- completion rate＋confidence interval；
- Silver／Gold rate＋confidence interval；
- expected、median、lower-tail score；
- catastrophic failure rate；
- step count 與 estimated real time；
- 在 baseline／candidate 都完成相同 objective 的 paired episodes 中，另報較短／較長／同手數與平均手數差；不能讓較高完成率掩蓋效率，也不能用較短失敗路線冒充改善；
- Duty Action usage distribution；
- OOD fallback rate；
- guide-policy-v1 disagreement set。

使用 paired random streams 比較候選／policy，報告 seed、episode count、profile 與 model versions。只報平均值不足以支撐 mission safety。

### 真實分布未知時的 robust evaluation

缺少大量玩家樣本時，不以單一 assumed probability table 代替真實世界，也不把取得精準 transition matrix 當成單件策略 promotion 的硬阻塞。每個 recipe 要先凍結一組 versioned evaluation suite，至少涵蓋其 reachable conditions 中有意義的：

- all-Normal 或長 Normal streak 的 deterministic／adversarial floor；
- Normal-heavy 與 balanced plausible worlds；
- Good、Malleable 或其他 recipe-relevant 有利 condition 稀少的 stress worlds；
- IID 與 transition-aware variants；已知 Good Omen 等 forced transition 在兩者都必須維持 mechanics semantics；
- RNG action 連敗、晚到機會球、資源邊界與可恢復玩家偏離等明示壓力序列。

各 world／sequence 必須保存 identity、來源層級、假設、condition artifact version 與 seed。baseline／candidate 在相同 world 使用 common random numbers；除了 aggregate，逐 equipment group 與 world 報 completion、objective attainment、quality lower tail、hard stop、safety、手數、資源與 latency。策略若只在一張有利機率表勝出，或在任何合理支援邊界出現 catastrophic regression，不得 promotion。

跨 catalog 報告不得只用全部 families 的混合完成率。主要 cell 至少是 family × equipment profile／tier × risk × world。family difficulty schema 必須在看 candidate 前版本化，主要依已驗證的 recipe mechanics／objective burden（如必要作業／品質、耐久、CP 與 condition constraints）建立；若引用 reference results，只能使用獨立 frozen reference，不能用 candidate 或同版 solver outcome 循環定義「配方本身困難」。可信 schema 完成前不宣稱 intrinsic easy／hard，只完整報 per-family cells 與明示 provisional strata；其後才分開回答困難 family 遇到弱裝備的 best-effort、改用中期裝備後的改善，以及簡單 family 在各裝備層是否仍維持高達成率。

必須分開「主要 plausible worlds」與「對抗性壓力序列」。全 Normal／極長 Normal streak 用來檢查是否失控、錯誤完工、資源耗盡後無 recovery 或完全無法收尾；除非產品明示把它列為支援分布，不要求候選為了守住該世界的高品質而放棄在合理彩球世界中的任務價值。對抗性全白結果不可與主要 worlds 等權平均後主導選擇。

高難配方允許 Observe／condition fishing 與成功率低於 100% 的技能。`riskyActionFailures=0` 不是 promotion 目標；需要驗的是風險是否有明示 budget、失敗後能否恢復、完成率是否維持，以及 `>=10200`／滿品質等任務相關門檻的 paired 結果是否改善。只靠確定技能得到低價值完成，不得因 lower-tail 較整齊而勝過有可控風險且顯著提高任務價值的策略。

在真實分布未知時，recipe-scoped promotion 可以由「跨明示裝備範圍與多組合理 worlds 都不崩潰」支持，不要求宣稱真實成功率。此時對外只能描述 evaluated model envelope、觀測到的最差尾端與 safety；不得把 episode 比例轉成遊戲實戰機率。單一 recipe 通過即可先 promotion，共用引擎不要求所有 recipes 同時畢業。

裝備 envelope 可以先由 verified mechanics、已知玩家面板、合理 stat／CP／取整邊界組成，不要求已有完整 Teamcraft loadout replay 才開始；但 profile 必須可能存在、來源與假設可追溯，split 仍以完整 equipment family 分組。score curve 不完整時，以 mechanics completion、raw quality、已知門檻、lower tail、手數與資源為 primary outcomes；未知區間的 provisional score 只能作 sensitivity，不得成為唯一 promotion oracle。

玩家 trace 以正常遊玩自然累積，主要用於 mechanics mismatch、未建模狀態與 recovery discovery。新 Teamcraft／官方／empirical artifacts 到位時，保留舊 suite、建立新版本並整批 replay；資料更新可以收窄或改變支援 envelope，但不得無聲改寫舊 evidence。

### Scenario objective 與裝備矩陣

policy evaluator 必須明示傳入 recipe-owned `CraftObjective`。`requiredQuality` 是 mechanics 完成條件，不是所有配方共用的品質 denominator；`requiredQuality=0` 而沒有正數 `qualityTarget` 時，evaluator 必須拒絕執行，不能產生 `Infinity`／`NaN` 或把零品質視為達標。

- 宇宙鈦鐵錠、宇宙探索用的硬化木板：只把作業與必要品質都完成的 episode 計為 valid completion。
- 宇宙鈦鐵釘：completion first，再依已驗證收藏價值區間與 high-tail proxies 評估；精確 900 分門檻未知時不得輸出 Silver rate。
- 宇宙探索用的巨匠藥：只評估複方藥任務第三件；`requiredQuality=0` 仍以作業完成判定 mechanics completion，但品質 6000–7199 只落在已知 100 分區，不能把這種低價完成當作策略成功。主要報品質 `>=10200` 的已知 700–1000 分區、`>=10800` 的 provisional 800 分 proxy、滿品質 `12000` 與 reasonable-world lower tail。10800 不得命名為 verified 800-point rate；前兩件與任務合計分數不在目前 evaluator scope。
- 高空作業用的腳手架：completion first，再報品質 p10／median／p90 與 HQ utility。若 HQ 曲線只來自 community table，輸出必須標 `provisional`，不得稱真實 HQ rate 或 promotion oracle。

目前玩家決策矩陣至少固定分開 `5408／5140／630` 無 buff、`5408／5237／749` 食物＋藥水、`5428／5257／764` 食藥＋專家三組宇宙工具 profile。candidate 與 baseline 使用同一 versioned corpus／common random numbers，分 profile 報 paired wins／losses／ties、worst plausible condition profile、stop reasons、safety、risk action uses／failures／recovery 與 latency；平均改善不可掩蓋任一裝備的 completion 或任務相關門檻退步。對抗性全白 lower tail 另列，不和 plausible-world promotion gate 混成同一個否決條件。

專家面板只表示技能可用，不表示允許消耗能工巧匠圖紙。評估必須有明示 specialist gate，並分開報每個 specialist action invocation；在 exact consumable inventory／cost 尚未建模時，invocation 不得寫成圖紙單位或淨收益。食藥非專家若已提供相近任務效用，專家 candidate 必須顯示足以解釋額外成本的 Pareto uplift 才能作周回預設。

development、frozen-validation、reserved-final corpus 必須使用互斥、versioned seeds。調 threshold、risk cap、cashout timing 或 utility table 時只能查看 development；policy、profiles、metrics 與 specialist gate 全部凍結後才執行 frozen validation，reserved-final 不得用來選參數。

巨匠藥 evaluator 的 Normal／Good／Malleable balanced、Normal-heavy 與 Good-scarce／Malleable-stress profiles 都是 assumed sensitivity，不是從玩家自然轉移估出的 probability。development 已分開報食藥非專家、食藥＋專家 stats 與無 buff；無 buff primary 完成 `384／384`、滿品質 `145／384`，不得標為滿品質 `near-boundary`。`v1.2.0` 對 exact 食藥非專家另完成固定路線 paired development 與首次 frozen：development primary／stress 為 `384／384`、`64／64` 完成且滿品質，frozen 為 `768／768`、`128／128`；frozen primary 手數 `78` 較短／`0` 較長／`690` 同手，condition-responsive uses `1717／928`、paired `416` 更多／`0` 更少。該 v1.2.0 checkpoint 當時未執行 reserved-final；2026-08-23 的 `.70` candidate 已使用一次 Command Brew reserved-final 並因跨裝備退步而拒絕，該 corpus 此後只作 regression。所有 rate 仍必須標 assumed、非實戰率。

`command-brew-development-risk-evaluation-v2` 的 development expansion report 必須精確覆蓋三組 regression panels、三個 plausible worlds、完整 128-seed development corpus，以及兩個 catastrophe worlds 至少 32 seeds；partial、空 stress、錯 corpus 或 frozen 重標都 fail closed。plausible slice 逐 cell 檢查 tier、p10、平均與 paired worst downside；catastrophe quality 只報告，completion、hard stop、safety 與 adverse-event recovery 仍可否決。Observe fishing 必須由 decision 明示 step index 與目標 condition，不能從 action 名稱事後猜測。外部 trace 即使逐步通過 canonical mechanics replay，若沒有 RNG origin、initial-state provenance 與 sealed executable binding，仍只能作 development diagnostics，formal promotion 固定 false。

巨匠藥 evaluator 另輸出 completed action-count 的 min／p10／median／p90／max／average，paired arms 只在兩側都完成且達滿品質 12000 時比較手數。近乎滿完成的效率 promotion 預設要求 baseline worst-profile completion 至少 `99.5%`、candidate worst-profile 與 average completion 都無觀測退步、平均成功手數至少縮短 `0.25`，並維持零 safety／failure／hard-stop／stall regression；此 gate 不代表小樣本已證明真實完成率等價。

### 預設測試套件價值稽核

2026-08-12 checkpoint `827cf73` 將預設 Vitest suite 由 209 tests 淨減為 193。保留的 canonical owner 包含 mechanics 公式／取整／terminal boundary、specialist semantics、protocol replay／undo／mismatch、simulator RNG／no-step、manual import／tamper、action resolution、玩家 golden／live traces，以及 solver safety／certificate；移除 literal mirror、重複 forwarding／起始狀態、無行為差異的訊息測試與研究 timing oracle。2026-08-13 current checkout 新增案例直接保護巨匠藥 exact-profile macro／四筆 observed condition streams／continuous-Malleable、Good／Malleable 局部支配替換與 phase jump、近滿完成效率 promotion 及球色防連點；完整測試數以當次 `npm test` 結果為準。2 個 scorecard registry guards 要求 released version 有 immutable commit，並拒絕把 `-candidate.N` 冒充已發布版本。後續新增防復發（regression）測試必須對應曾發生或高風險的可觀察 failure contract；能由既有 owner 覆蓋時合併案例，不以 test count、CSS 常數鏡像或 production literal copy 充當品質。

## 6. Performance

分開量測：

- transition throughput；
- episode／offline rollout throughput；
- policy training／distillation；
- runtime recommendation p50／p95／p99；
- worker startup／artifact load；
- UI input-to-render latency；
- debug／distribution／tree materialization。

現行 Worker 與同步 fallback 執行同一個 generic policy，不得再把 historical guide／lookahead 的 p95 當成現行第二種快速能力。generic recommendation 的主要目標仍是目標裝置 p95 `< 1s`；目前 web hard timeout 為 `3s`，並需分別報 policy p50／p95／p99／max、Worker startup、timeout 與立即 error／null fallback rate。Material Miracle 是否可接受同一上限仍需以實機錄影／計時量測 game↔tool switching，不以開發機 family smoke 取代 UX evidence。

## 7. TS／native／WASM parity

2026-08-25 的完整 TypeScript overnight instrumentation 顯示，`recommendAction` callback 佔 evaluator child work 約 `99.9457%`。另一次以相同 evaluator bundle 執行的代表性 CPU sample，將主要熱點指向 mechanics preview 與 finisher／route-safety certificate search；它不是整個 overnight matrix 的 sampled profile。兩項證據共同支持把最小有效 Rust 邊界定為完整 closed-loop episode，而不是逐 transition、逐 action IPC 或 fixed-continuation matrix。現行 native batch core 已跨過單步、固定路線與第一層 root-candidate matrix 三個 checkpoint，但 generic recommendation／whole-episode ABI 尚未完成。

v0.5.1 只保留 historical outcome baseline，不能直接當 exact migration oracle。先在 TypeScript 建立 canonical action ordinal／tie-break 與固定 node／evaluation work budget，更新 policy identity 並凍結成新的 deterministic migration oracle，再開始 Rust exact port。現行 bounded finisher 的 node cap 加 `800ms` wall-clock 會使較快 CPU 在同一時間內探索更多節點；在 wall-clock 退出正常選招語義前，TS／Rust action 差異既不能直接判為 port bug，也不能當成策略改善。wall-clock 只可保留為另行記錄的外層 fail-safe。

第一次 cutover 的 continuous parity 至少包含：

- 每次相關變更的快速 decision fixtures，比較 exact action／null、actual action history、policy memory、safety／certificate／fallback 與 deterministic tie-break；
- 固定 50 families × 3 risks × 弱／中／強代表裝備 × 4 worlds × 1 seed 的 closed-loop migration corpus，共 1,800 episodes；每一步比較 action、success、next condition、完整 state、兩條 RNG cursor、terminal、stop reason 與 action limit；
- pre-overnight 將同一 corpus 擴為 4 seeds，並以 1／4 workers 重播；worker 數、Rust debug／release profile 不得改變逐步輸出；
- full-trace SHA-256、structured output hash、binary／ABI／policy／mechanics／action-schema identity 與 versioned parity evidence 任一漂移即 fail closed；只比 aggregate completion 或 summary 不算 parity。

新的 deterministic TypeScript identity 是凍結的遷移 oracle，不是永久第二個 solver owner。Rust promotion 後，有意的 policy 進化不要求繼續逐招等同該 TS oracle；持續 gate 改為 mechanics／deterministic regression、Rust native 與同一 core WASM exact parity。產品 release 只做擴大確認，不能是第一次 semantic parity。WASM memory／capacity failure 與 wrapper materialization failure 仍分開分類；壓力 benchmark 不塞入預設 unit suite。

`native/craft-kernel` 仍無第三方 dependency、禁止 unsafe、未接 web runtime。現行 `native-transition-batch-v2`、`native-rollout-batch-v2` 與 `native-root-plan-matrix-v2` 使用完整 9×9 condition matrix；54 個 direct transition cases 逐一覆蓋 35／35 actions並含 Robust，10 個 rollout cases 鎖完整逐步 state、condition／success RNG、explanation、terminal、非 IID transition row 與 no-step action budget，另有 12,000 個 root operations 比較 paired seeds 與 shared fixed continuation。三層各自使用 full-trace SHA-256 與跨語言 binary FNV，任何欄位或中間 state 不一致都 fail closed。

root-plan encoder 必須從實際 recipe／objective 重算 scenario identity；沿用舊 hash 卻突變內容的 input 會在執行前拒絕。一般 batch 的 per-request limit 之外，另有整批 2,000,000 episodes、100,000,000 projected transitions 與 240 MiB output hard cap；benchmark 為 10,000,000 episodes／100,000,000 projected transitions。TS／Rust 使用相同保守 projection，binary 再核對實際 bytes，避免多 request 或極端 repetitions 繞過限制。

2026-08-20 的兩次 1,000,080 candidate×seed episode 大批次中，Rust core 相對 TS 約 11.31～13.02x，含 process boundary 約 11.24～12.95x；兩側 FNV 都是 `283b6575`。這是 fixed continuation candidate matrix 的 throughput 證據，不是 adaptive guide、MPC、generic search 或策略品質證明，不能用來預告 generic native 加速倍數。generic cutover 必須另以同一 sealed closed-loop workload、single worker、release binary 量 end-to-end episodes／s、decisions／s、transitions／s、process-boundary share 與 worker-seconds／1,000 episodes；若沒有足以抵銷移植與設備成本的明顯端到端改善，先繼續 profile，不開 full overnight。

## 8. Evidence levels for claims

| Claim | 最低證據 |
| --- | --- |
| action formula 正確 | unit tables＋至少一條對應官方／遊戲 trace |
| full mechanics 可用 | representative golden traces 全步一致＋invariants |
| recommendation 達互動預算 | target platform／device benchmark，報 p50／p95／p99／max 與 timeout fallback |
| policy 優於 guide | 跨明示裝備 envelope／plausible condition worlds 的 held-out paired evaluation＋無 safety regression；未有真實分布時只稱 model-robust improvement |
| mission 可實戰完成 | 玩家完整 session replay＋resync／fallback evidence |
| probability 精確 | recipe-specific empirical／official profile＋sample metadata |

## 9. 失敗處理

測試失敗時先分類是 model bug、fixture bug、source drift、environment／sandbox 或 flaky timing。不得用增加 timeout、放寬 tolerance、刪除 edge case 或更新 snapshot 掩蓋未理解的差異。
