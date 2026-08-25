# Frozen Rabbit Expert 廣泛配方 Generic Solver 實作計畫

## 文件角色

本 roadmap 管理五配方 POC 完成後的目前主線、交付順序、support-level gate、停止規則與可觀察進度。永久產品目的由 `project_mission.md` 擁有；catalog、generic craft policy、mission controller 與 support-level 定義由 `product_architecture.md` 擁有；mechanics、solver safety 與驗證細節仍由各自 domain owner 管理。

`last_verified: 2026-08-25`

## Phase transition

早期五配方 POC 已完成 live 任務。其 recipe-specific guides、certificates、bounded-risk routes、exact-profile thresholds、玩家 traces 與 frozen corpora 只保留作歷史、teacher 或 regression，但不再構成新 generic solver 的逐手 runtime 相容性義務，也不再是產品主線的持續優化對象。runtime fallback 由 generic contract 提供，不以舊逐配方 policy 為前提。

目前主線是：

```text
broad high-difficulty recipe catalog
  + versioned mechanics-family bindings
  + recipe-owned objectives
  + actual CrafterProfile
  + observed CraftState / action outcome / condition
  + stable | balanced | aggressive preference
  -> Rust-primary generic local state-feedback solver
  -> recommendation + reasons + support level
```

### 第一批 catalog 硬邊界

第一批不是抽樣幾個新 recipe，而是納入目前 patch 可辨識的**全部宇宙探索高難度製作配方**。成員資格以 `WKSMissionRecipe` 的 WKS mission membership 與 XIVAPI `Recipe.IsExpert`／level 100 交叉決定；不可只用 `IsExpert=true`，以免混入非宇宙探索的 Master Recipe。

目前固定 snapshot 為 XIVAPI game data `284bb7f44b9c0976`、schema `exdschema@2:rev:83e965d091116f895d5b17573cc5d12909a5f407`、`WKSMissionRecipe` revision `1b5c1af6a79063015f53fda7752cc84ff0545342`、`WKSMissionUnit` revision `c142b1269a76e9e3fffc42f984a5f193ba565ddc`；canonical content SHA-256 為 `2a6b26ca88bbc568d80df82b5333b1205d1a9f1aea39d9070ff9f64b4fb03530`。共 432 個配方、八職各 54 個，按會影響求解的數值與 condition／objective 分成 50 個 mechanics families。另有 8 個同為 level 100 Expert 的 Crumbling Aqueduct Master Recipes 不具 WKS mission membership，明確排除。配方名稱各自可選，但相同 mechanics signature 共用 generic solver 與 family-level evaluation。

## 成功量尺

每個 milestone 優先回答玩家能否得到更多、較好的實際建議，不以 framework、tests、corpus 或 native protocol 數量當進度代理。

主要量尺：

- catalog 中高難度 recipes 與 mechanics families 的涵蓋數；
- 已知 mechanics family 新 recipe 的 data-only onboarding 比率；
- onboarding 一個新 recipe 所需的 code owners、人工時間與 evaluation 成本；
- development-preview／experimental／supported／validated 各層級的 recipe／family 數與降級原因；
- tactical sanity suite 的 illegal、terminal、明顯 condition-opportunity／dominated-action failures；
- family × equipment profile／tier × risk × world 的 completion、有意義品質門檻、high-tail 與 catastrophic failure；difficulty cross-view 依 `algorithm_verification.md` 的事前 schema，不能只看全 catalog 混合完成率或把 solver failure 循環命名為配方本身困難；
- policy-null、OOD、fallback、resync 與玩家偏離後 recovery；
- runtime recommendation p50／p95／p99、timeout 與 fallback latency。

五個舊 recipe config 的微小 paired uplift、單一 exact profile threshold、artifact schema 欄位數、hash 數或 test count 不得單獨列為產品 milestone。

## Milestone 1：Catalog-first onboarding

### 交付

- 定義目前可表達的 mechanics families，以及每個 family 共用與 recipe-owned 的欄位。
- 建立 patch-aware、canonical-ID 驅動的廣泛高難度 recipe catalog。
- 將 condition availability／forced transitions、`RecipeProfile` 與 `CraftObjective` 由 data binding 注入。
- UI／session／worker 從 catalog 取得 recipe identity、objective 與 support level，不維護另一份 recipe switch。
- 完整匯入目前全部宇宙探索高難配方；以每個 mechanics family 的代表 recipe 做 solver／evaluation probe，但 432 個 recipe identity 都必須可搜尋與選擇。

### Gate

- 新增一個已知 mechanics family recipe 時，只修改 data／source metadata／catalog fixture；generic solver、worker control flow 與 domain transition 不需 recipe-specific branch。
- canonical ID、recipe mechanics、condition set、objective 與來源缺一不可；未知欄位明示 unknown，不自行補公式。
- catalog identity drift、重複 ID、錯 family／objective binding 與不支援 condition 可 fail closed。
- recipe 達 `catalogued`／`mechanics-ready` 不要求玩家 trace、unseen loadout population、reserved-final 或獨立 guide policy。

## Milestone 2：Generic state-feedback solver MVP

### 交付

- 單一 solver entry 接收 `CraftState`、`RecipeProfile`、`CraftObjective`、`CrafterProfile`、`RiskPreference` 與固定 node／evaluation work budget；wall-clock 只作外層 abort，不參與正常選招語義。
- solver algorithm 的 target 唯一權威實作是 Rust；日間 bounded evaluation 與 overnight 共用同一 native core，Web 由同一 core 的 WASM build 接入。v0.5.1 只作 historical outcome baseline；deterministic TS migration identity 只守 bounded behavioral similarity，Rust 接手後不維護第二套長期 solver。
- 建立明確分層：共用 core route／resource／finisher invariants，objective-specific progress／quality／risk options，以及可中斷 active route 的 condition-specific tactical options；最後以完整後綴 outcome resolver 選 action，不把所有差異壓成一組全域 scalar priors。
- 由 mechanics preview 建立 legal candidate set，包含 recipe-relevant condition 專屬技能、資源回收、buff／repair、quality burst、progress commit 與 recovery。
- 使用 route／option memory 或等價規劃狀態保持跨步意圖；每次 observed outcome 後重新規劃，不依賴預知 future RNG。
- progress finisher／recovery reserve 作安全 scaffold，但不把「任何時刻都有 deterministic finish」設成 aggressive policy 的永久硬限制。
- objective 同時表達存活／完成、有意義品質門檻、high-tail、資源與 variance；stable／balanced／aggressive 使用同一 engine 的不同 utility／risk boundary。
- 低裝備依 actual gain 與 CP 做 best-effort，不走 exact-profile router 或長期 recipe threshold tuning。

### Tactical sanity gate

- 永不推薦 illegal action、已 terminal 後一般 action、可證明 deterministic loop 或無恢復路線的直接災難。
- condition-limited 高價值技能必須被實際比較。若 Good／Malleable／Pliant／Primed 等狀態下選擇一般技能，輸出可由完整 route、reserve、action use、objective 或風險偏好支持的 reason。
- mechanics preview 顯示某 action 在 progress／quality、CP、durability、成功率與後綴可行性上被另一 legal action 局部支配時，不得無理由選被支配者。
- 玩家偏離、技能失敗、undo／resync 後能從 actual history 繼續，不依賴舊 recipe route node。

### Outcome gate

- 至少跨多個 mechanics／objective families、數個 equipment bands 與多組 plausible condition worlds 執行 closed-loop evaluation。
- `experimental` 要求零 safety invariant 違反、無系統性 tactical sanity failure、fallback 有效，並在合理裝備中顯示高於無策略／明顯保守低價 baseline 的任務價值。
- 不要求 experimental candidate 在每個舊五配方逐手重現現行 guide，也不要求先有真正 unseen loadout 或 final corpus。
- 未來較強規劃器的主要 UX 目標為 p95 `< 1s`；web `3s` hard timeout 與 fallback 必須可見、可用。2026-08-24 的 generic slice 中，Worker 與同步 fallback 執行同一 policy，只差執行隔離，不得把它們當成兩種策略能力。
- Rust migration 先以 bounded TS→Rust corpus 鎖 action、完整 state、policy memory、RNG cursor 與 stop reason；同一 native binary 在 1／2／4 workers 下不得改變 episode。產品整合再鎖 native Rust↔同 core WASM exact parity；release 不是第一次做 semantic parity。

## Milestone 3：廣泛 Experimental catalog

### 交付

- 所有 mechanics-ready entries 可接明示的 `development-preview`，用來暴露 policy-null、策略錯誤與收集 trace；只有通過 experimental gate 的 family 才標示 `experimental`。
- UI 明示 support level、已知 objective、equipment／condition envelope、OOD 與 fallback；配方數增加不擠壓主要製作流程。
- 建立跨 recipe family 的 tactical sanity、completion、quality-tail、latency 與 null／fallback dashboard。
- 由正常玩家 session 自然累積 trace；優先修正重複出現的 mechanics mismatch、obvious strategy error、policy-null 與 recovery family。

### Gate

- 至少證明數個新 recipes 可 data-only 從 mechanics-ready 進入 experimental。
- 新 recipe 不需先建立 guide-integrated policy、exact-profile config、專屬 frozen corpus 或獨立 worker。
- 任一 family 若需 recipe-specific code，必須先證明那是 mechanics／objective 差異，不能由既有 data contract 或 generic planner 表達。
- catalog coverage、tactical correctness 與玩家可用性優先於舊五配方的小幅 paired improvement。

## Milestone 4：Supported／Validated promotion

### Supported

- 依實際使用價值選擇代表性 recipes／families，不要求整個 catalog 同時 promotion。
- 以可能存在且來源可追溯的 equipment bands、plausible condition worlds 與壓力序列驗證 completion、品質門檻、high-tail、recovery、safety、latency 與 OOD fallback。
- 低裝備的 gate 是 best-effort 有用、避免明顯錯誤與誠實能力邊界，不是與高裝備相同的高分率。

### Validated

- policy／objective／profiles／metrics 凍結後，才增加隔離 held-out／frozen／必要的 final evaluation。
- 玩家 trace、自然 condition、score／HQ 結算等 evidence 足以支持的範圍才做量化 claim。
- artifact 可版本化、重現、rollback，且實際執行內容與宣告 identity 一致。

Supported／validated 的深證據不能反向成為 catalogued、mechanics-ready 或 experimental 的通用前置條件。

## 研究預算與停止規則

- 每個研究 task 開始前，先寫出要解除的玩家可見 blocker、最小實驗與停止條件。
- 若 hypothesis 在小型 development probe 沒有 material signal，不擴大 seeds、框架、artifact schema、native protocol 或文件同步面積；保存負結果後回到 catalog／generic solver 主線。
- 2026-08-25 profiler 已證明 TypeScript overnight 的主要瓶頸是 generic recommendation；完整量測由 `algorithm_verification.md` 擁有。Rust generic closed-loop migration 因此成為目前產品主線；只搬 transition、延伸 historical adaptive ABI 或新增無關 native framework 仍不在範圍內。
- 不為單一 exact profile 長期搜尋 progress floor、CP threshold、cashout timing 或另一份 recipe-specific driver。只有跨 recipes／equipment 反覆出現的 failure family 才值得升為 generic rule／feature。
- 舊五配方只在 live mechanics bug、使用者可見策略錯誤或 generic regression 能由其 corpus 重現時投入修正；不再以完整歷史 scorecard 的微量起伏決定目前主線。
- full frozen／reserved-final 只服務 supported→validated 或重大 default replacement；experimental onboarding 使用較小、versioned、可重跑的 bounded suite。
- 全 Normal／極端 stress 用於 catastrophic safety／recovery，不得壓過合理彩球 worlds 的 high-quality product value。

### Family 去重與任務邊界

固定 `WKSMissionUnit` revision `c142b1269a76e9e3fffc42f984a5f193ba565ddc` 的逐 family 核對顯示：50 個 mechanics families 中，49 個 family 的 Silver／Gold requirements、任務類型、level group、sync 與時間等 scalar mission requirements 全數一致；唯一例外 `cosmic-expert-mechanics-28a8766ee960` 只分成 `420s` 與 `330s` 兩種 `MissionTime`，其單件製作 mechanics、Silver／Gold requirements 與 policy-effective objective 仍相同。逐任務頁也把八職同型任務列為相同 crafting requirements／conditions。

因此 Craft policy evaluation 維持 **50 個 scenarios**，不因 objective evidence source、配方名稱、職業或不影響單件決策的任務時間拆成 53 個；真正 objective signature 衝突則 fail closed。`330s／420s`、任務 ID、材料鏈、需求件數與跨件總分仍是 Mission controller data，不能因單件 solver 去重而消失。

### 能力界線與迭代成本

固定 recipe／equipment／objective／condition world／horizon 後，能力證據按下列偏序表達：

```text
目前可執行 causal policy
  <= 最佳 causal policy
  <= 看得到未來 RNG 的 fixed-tape clairvoyant optimum
  <= 放寬 CP／耐久／setup／球色與成功限制的 mechanics upper bound
```

- closed-loop matrix 只提供目前 policy 的下界與尾部，不證明裝備極限。
- fixed-tape search 只提供可重播的 future-aware 路線 witness；找到更好路線可證 route 存在，不能稱 live policy 可達率。beam 截斷時，找不到路線仍是 inconclusive。
- optimistic action-gain relaxation 只有 negative result 具硬意義：若連「全技能成功、每手最佳球色、滿 IQ／buff、忽略 CP／耐久／setup 並可重複技能」的上界仍低於 target，才可在該 horizon 證明目標不可達；`not-ruled-out` 不表示實際可達。
- 一般情況要宣稱「已接近這組裝備的 model limit」，仍需 finite-horizon stochastic causal Bellman lower／upper bounds；在此完成前，不把 oracle 或更多 seeds 冒充能力極限。

截至 2026-08-25，這個「裝備 × 配方距離上限」量尺的誠實狀態是 **尚未做成可用的停止投資量尺**。現有 optimistic action-gain bound 的實作與 500-cell 執行證據有效，但只適合 negative proof；`500／500 inconclusive` 表示它對目前母體沒有產生任何可用分類。fixed-tape probe 也有效，但只回答特定 RNG tape 是否存在更好 future-aware route。兩者都不能輸出「目前策略已達 model optimum 的 97%」這類 proximity 數字。

可達成、且值得做的目標不是未知真實 transition distribution 下的「遊戲絕對理論上限」，而是每個明示 condition world／horizon 的 **model-limit bracket**：目前最佳 causal policy 與可重播 route 提供 lower bound；resource-aware relaxation 與 stochastic causal Bellman／branch-and-bound 提供 upper bound。只有上下界差距小於事前門檻，該 equipment × family cell 才可標 `near-model-limit`；否則明示 `inconclusive`。condition distribution 或 objective 本身未驗證時，claim 必須保留 model-qualified，不能外推成真實遊戲上限。

這把尺本身也受成本閘門約束：先只對 hard-quality 最差與高投入 cells 建 bound；若 resource-aware bound 仍無法把 500-cell historical relaxation 明顯收窄，就停止擴到全母體，不用更多 seeds 掩蓋結構性過鬆。solver hypothesis 若在相同 paired cases 的 material-effect interval 已落入 ±`0.02` immaterial band，或該 cell 已有窄的 model-limit bracket 且剩餘 headroom 小於預定效果，立即切換目標；bound 仍寬時則不能用它要求無止境榨最後幾％。

候選改動使用相同 case identity 與 common random numbers，完成場的 normalized objective utility 為 `min(quality / target, 1)`、未完成為 `0`。預設 material effect 為 `0.02`，最多 8 次預先界定的 fixed looks，使用 Bonferroni empirical-Bernstein interval；任何 baseline completed／candidate uncompleted 直接 veto。信賴區間落在 immaterial band 時停止該 hypothesis，不能推論所有未來演算法都無改善空間。

## 目前最高優先：Rust-primary migration

在繼續新的 solver hypothesis 前，依序完成：

1. **完成**：保留 TypeScript v0.5.1 historical outcome baseline；`generic-craft-route-objective-condition-v0.6.0-migration-oracle` 已定義 canonical ordering／tie-break 與固定 per-root work budget，只作一次性 migration reference。
2. **完成**：objective／risk、decision memory、route options、RNG／transition 與 terminal 已納入 `native-generic-episode-batch-v2`；Node evaluator 不逐 action 往返，overnight parent 只做 shard／lock／timeout／retry／resume／report orchestration。
3. **完成到足夠相似度**：mechanics／codec／RNG／terminal 沿用 exact parity fixtures；TS policy 不再追逐逐行／逐招 exact port。Rust v0.15 已吸收主要 capability portfolio，TS 差異只用 decision strata 與 bounded matrix 防止錯誤簡化；後續 Rust policy 自行演進。
4. **部分完成**：日間矩陣與 native overnight preview 已強制同一 Rust release binary、ABI／handshake／SHA-256／content-address snapshot 與 native-only fail-closed。1／4 workers 的 1,920 semantic rows 除計時外 hash 完全一致；4 workers 的全 50-family、8-seed 預覽為 48,000 paired cases／96,000 solver episodes、112 秒、0 retry／timeout。使用者授權的 64-seed v0.15→v0.18 完整 preview 已跑完 384,000 paired cases／768,000 solver episodes、150／150 shards、0 retry／timeout，wall clock 12 分 12 秒；人工觀察四核心約 `86°C`，但當時另有遊戲負載且仍非可信 sensor evidence，所以正式 unattended calibration gate 不變。
5. **進行中**：Rust 已是 offline solver 與策略 owner；Web 隨後接同一 Rust core 的 WASM build，嚴格做 native↔WASM／TS wrapper parity，不把整合風險留到 release。

在以上 gate 完成前，不再啟動完整 generic overnight。日間可用 2～4 workers 加速 bounded iteration，但 worker 數只可影響 throughput，不得改變 deterministic outcome。

## 第一批工作項目

1. **完成**：從 data／domain owner 列出可資料化欄位與真正需要新 semantics 的缺口。
2. **完成**：建立可重跑的 broad catalog importer，匯入 432 個宇宙探索高難配方並綁定 canonical data／objective／condition；以 50 個 family probe，不縮減 UI catalog coverage。
3. **完成**：定義 generic solver entry 與 `RiskPreference` contract；generic wrapper 可重用既有 route engine 的 recipe-ID-independent internals，但不呼叫 recipe-specific resolver、named config、exact-profile router 或舊五配方 fallback；那些 named policy 只作離線 teacher／regression。
4. **部分完成**：已鎖 illegal、completion rule、Good condition dominance、Robust forced transition，並以當時三個 historical player profiles 建立 50 family × 多 assumed worlds 的 bounded closed-loop checkpoint；evaluation registry 已擴為 10 個來源可追溯 profiles，全部以實際 i720 Cosmic 或 i750 Stellar fixed-relic 主手工具為基礎，10-profile overnight 也已跑完，但其 child 實際為 Node／TypeScript，只可作 v0.5.1 品質 baseline，不能作 Rust 耗時、溫度或 worker 校準。i780 與 CP 特化裝備仍是未納入本輪母體的 future references，細節由 [`open_questions.md`](../research/open_questions.md) 擁有；transition-aware 自然 world、recovery trace、未知裝備人口與 tactical promotion suite 仍缺。
5. **大致完成，熱 gate 待補**：`native-generic-episode-batch-v2`、paired native evaluator 與 overnight runner 已接通 release handshake、hard caps、matrix validation、binary snapshot、resume 與 1／4-worker determinism。CLI 要求 `--native-preview`，避免沒有 calibration evidence 時誤稱正式夜跑。
6. **下一輪候選已形成**：v0.19 誤把不換 condition 的 Final Appraisal 當 sampling spacer，已撤回。`generic-craft-budgeted-condition-v0.20.0` 以 v0.18 為增量 baseline，保留 deterministic finish 與 objective-aware 最後交貨機會，並把純抽球的 ConditionFishing 限定為 Observe／Careful Observation。第一抽維持原 legal fallback ordering；每次 ConditionFishing 最多多付一次連續 Observe，免費 Careful Observation 優先，advancing buff 仍按原 ordering 競爭，no-step Final Appraisal 不得重設預算。Pliant 下的 Manipulation／Waste Not，以及 Primed 下的 Manipulation，只在即將結束且刷新本來就值得時同時上 Buff 與換球；仍有效的 Innovation／Veneration 若只為賭下一球而提早覆蓋，需留給 option-conditioned continuation 比較剩餘回合、CP 與 finish suffix，不在 v0.20 加局部 heuristic。50 families × 3 risks × 10 equipment × 4 worlds × 4 seeds 的 24,000 paired daytime gate 中，completion `+554／-0`、quality target `+230／-0`；其中 progress-only completion `+389／-0`、hard-quality completion `+165／-0`。這足以投入 64-seed v0.18→v0.20 overnight preview；它仍不是實戰成功率、全部 cells dominance 或接近裝備上限的證據。

### 2026-08-24 historical development checkpoint（舊三 profiles）

以下 `2400` episodes 是擴充到目前 10-profile registry 以前留下的 historical checkpoint，不是目前完整 equipment coverage。frozen baseline `generic-cosmic-family-development-matrix-v1-49e4374bf762ca92` 使用 balanced policy，對 50 個 policy-effective family scenarios、當時三組既有 equipment、四個 condition sensitivity worlds 各跑 4 seeds，共 2400 episodes／71,991 次 recommendations。balanced／Normal-heavy 是 plausible assumptions，opportunity-scarce 是 plausible stress，全 Normal 另列 adversarial；它們都不是真實遊戲機率或 promotion corpus。

`completed` 必須按 mechanics completion contract 拆開解讀：

| 範圍 | Completion contract | completed | policy-null | action-limit | 解讀 |
| --- | --- | ---: | ---: | ---: | --- |
| balanced＋Normal-heavy | `requiredQuality=0`，只需作業完成即可交貨 | 862／864 | 1 | 1 | 一般配方 delivery floor 為 99.77%，仍有兩條 generic failure 要修 |
| balanced＋Normal-heavy | 作業＋`requiredQuality>0` 皆為硬門檻 | 92／336 | 244 | 0 | 裝備、world 與 route 缺口混合，不能由未完成直接推論能力極限 |
| 四 worlds 全部 | `requiredQuality=0` | 1726／1728 | 1 | 1 | 壓力世界下仍幾乎都能交貨 |
| 四 worlds 全部 | 作業＋`requiredQuality>0` | 104／672 | 568 | 0 | 是目前主要未完成來源 |

前兩個 plausible worlds 依裝備分層：無 buff `297／400` completed、104 target、103 null；食藥 `328／400` completed、179 target、72 null；食藥＋專家 `329／400` completed、199 target、70 null。這些 completed 數字仍混合兩種 contract，因此產品底線以表中的 progress-only 分層為準；品質與 hard-required capability 另報。

依 world 分開時，balanced IID 為 `496／600` completed、305 target；Normal-heavy IID `458／600`、177 target；opportunity-scarce `440／600`、97 target；全 Normal `436／600`、91 target。所有 2400 場為 0 terminal failed、0 illegal；recommendation callback p50／p95／p99／max 為 `1.449／36.425／70.452／654.079ms`，只代表這台開發機的 in-process policy，不是 target-device UI SLA。

一般交貨的兩條例外已固定成 regression targets：Recipe 37002 的低裝備 normal-heavy 路線在 `9060／10200` 作業、5 durability、8 CP 停住；Recipe 38200 的專家 balanced 路線在 Good／Good Omen 間反覆 setup／Tricks，80 手仍只有 `6068／7400` 作業。前者是 progress reserve 失敗，後者是無 deadline 的 opportunity loop；都不能以追求品質為理由接受。

`generic-craft-route-objective-condition-v0.5.1` 只針對這兩種共用 failure contract 加入 bounded 修補：已付 Great Strides／Innovation 的最後 Good 品質窗口必須使用仍保留 guaranteed finisher 的 consumer；當共用 route 的 setup 沒有 funded quality consumer、也沒有 guaranteed certificate 時，balanced／aggressive 才可採「成功即交貨」的 contingent synthesis。若已有 guaranteed certificate，不得用它在 route 前提早截斷品質；一般 contingent completion 也只在 route 與 lookahead 都回空後救援。hard required-quality 不套用這條 delivery floor。

最終 paired A/B `generic-cosmic-family-development-matrix-v1-4bda386bef2a84b6` 對 frozen v0.5.0 baseline 使用完全相同的 2400 cases／seeds。v0.5.1 的 progress-only 為 `1728／1728` completed，較 baseline 多 2 場且 0 completion regression；quality target 多 1 場且 0 target regression。hard-required-quality 維持 `104／672` completed、568 policy-null。paired normalized objective utility 平均差為 `+0.000611`，Bonferroni empirical-Bernstein 95% interval 為 `[-0.012249, +0.013472]`，完整落在預先宣告的 ±`0.02` immaterial band，因此決策是 `stop-no-material-signal`：保留局部 correctness 修補，但停止在這個 hypothesis 上繼續燒評測成本，不能宣稱有 2% 的普遍成效提升。

v0.5.1 full matrix 共 71,867 次 recommendations；這台開發機的 TypeScript callback median／p95／p99／max 為 `1.486／38.967／84.903／670.197ms`。它通過本機快速 policy p95 `<100ms` benchmark gate，但仍不是 target-device UI SLA，也不能推估 Rust native 時間或溫度；p99／max 也不能被平均值掩蓋。

hard-required-quality 的 plausible worst tail 集中在跨裝備／world 仍反覆 policy-null 的 families；目前 route 曾把 Inner Quiet 堆到 10 卻未比較完整 `繼續品質` 與 `Great Strides／Innovation／Byregot cashout＋必要重建＋progress finish` 後綴。直接改 Innovation 次數、放寬單步 Byregot threshold或把 finisher node limit放大，都沒有增加完成且有品質／latency退步，已撤回。下一個有效 hypothesis 是帶 `PlannerContext` 跨步意圖的 bounded hard-quality completion option，不是再加 recipe-specific threshold 或保守 hard veto。

第一階段的 historical optimistic mechanics bound 曾只覆蓋 50 families × 3 equipment，共 150 cells；結果為 `targetProvablyImpossible=0`、`inconclusive=150`。

9-profile／450-cell 的 live checkpoint 已由目前 10-profile registry 取代。2026-08-25 live 驗證在 horizon 80 跑完 50 families × 10 equipment，共 500 cells；預計掃描量為 `304,760,000／310,000,000`，仍受明確硬上限保護。實際報告為 `targetProvablyImpossible=0`、`completionImpossibleUnderRelaxation=0`、`inconclusive=500`。白話來說，這把尺先假設幾乎所有事情都對製作有利，又忽略 CP、耐久與 setup 等代價，所以目前仍太鬆：它沒有排除任何目標，只能回答「這個非常樂觀的模型尚未證明不可能」，不能回答實際策略做不做得到，更不能證明任何裝備已接近能力極限。後續先收緊 resource-aware bound，再對最差 hard-quality cells 建 causal Bellman bounds。

Recipe 36990／食藥／normal-heavy assumed IID／固定 seed 的 pathwise probe 提供一個具體反例：目前 causal policy 在 30 手以品質 `25552／29700`、作業 `1510／1700`、D10／CP6 `policy-null`；看得到同一未來 RNG tape 的 bounded search 找到可精確重播的 34 手完成路線，品質 `29700`、作業 `1700`、D15／CP10。這只證明該 tape 與裝備存在路線，不代表 live causal policy 可達率；frontier 已截斷，也不是全域 optimum。但它足以否定「這一場失敗已由裝備硬極限解釋」，支持繼續投資 generic route continuation，而非替該 failure 降低目標。

完成 Rust migration gate 前，不在 TypeScript 上繼續實作／調參新的 policy hypothesis，也不重新啟動舊 Command Brew option 微調、exact-profile promotion、完整 historical scorecard或完整 generic overnight。failure analysis、migration fixtures、deterministic oracle 與 Rust port 屬目前主線，不受此停止規則禁止。

## Milestone 更新規則

- roadmap 只記目前階段、產品進度與 gate；單次 recipe 實驗數字留在 evaluator output／handoff，不複製到所有 canonical owners。
- status 必須回答「新增了多少可用 recipes／families、generic solver 改善了什麼玩家結果、花了多少 onboarding 成本」，不能只列 tests、hash、episodes 或 commits。
- blocked 項目連到具體 mechanics／data question；缺少 validated evidence 只限制 claim level，不自動阻塞 experimental。
- 每次 milestone 更新 `last_verified`，並以目前 code、catalog、tests 與可重跑 evaluation 驗證；不得由舊 handoff 推定 current state。
