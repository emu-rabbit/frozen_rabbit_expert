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
- Duty Action usage distribution；
- OOD fallback rate；
- guide-policy-v1 disagreement set。

使用 paired random streams 比較候選／policy，報告 seed、episode count、profile 與 model versions。只報平均值不足以支撐 mission safety。

### Scenario objective 與裝備矩陣

policy evaluator 必須明示傳入 recipe-owned `CraftObjective`。`requiredQuality` 是 mechanics 完成條件，不是所有配方共用的品質 denominator；`requiredQuality=0` 而沒有正數 `qualityTarget` 時，evaluator 必須拒絕執行，不能產生 `Infinity`／`NaN` 或把零品質視為達標。

- 宇宙鈦鐵錠、宇宙探索用的硬化木板：只把作業與必要品質都完成的 episode 計為 valid completion。
- 宇宙鈦鐵釘：completion first，再依已驗證收藏價值區間與 high-tail proxies 評估；精確 900 分門檻未知時不得輸出 Silver rate。
- 宇宙探索用的巨匠藥：只評估複方藥任務第三件；`requiredQuality=0` 仍以作業完成判定 mechanics completion，另報品質 `>=10200` 的已知高分區、`>=10800` 的 provisional 800 分 proxy、滿品質 `12000` 與 lower tail。10800 不得命名為 verified 800-point rate；前兩件與任務合計分數不在目前 evaluator scope。
- 高空作業用的腳手架：completion first，再報品質 p10／median／p90 與 HQ utility。若 HQ 曲線只來自 community table，輸出必須標 `provisional`，不得稱真實 HQ rate 或 promotion oracle。

目前玩家決策矩陣至少固定分開 `5408／5140／630` 無 buff、`5408／5237／749` 食物＋藥水、`5428／5257／764` 食藥＋專家三組宇宙工具 profile。candidate 與 baseline 使用同一 versioned corpus／common random numbers，分 profile 報 paired wins／losses／ties、worst condition profile、stop reasons、safety、risk action failures 與 latency；平均改善不可掩蓋任一裝備的 completion 或 lower-tail regression。

專家面板只表示技能可用，不表示允許消耗能工巧匠圖紙。評估必須有明示 specialist gate，並分開報每個 specialist action invocation；在 exact consumable inventory／cost 尚未建模時，invocation 不得寫成圖紙單位或淨收益。食藥非專家若已提供相近任務效用，專家 candidate 必須顯示足以解釋額外成本的 Pareto uplift 才能作周回預設。

development、frozen-validation、reserved-final corpus 必須使用互斥、versioned seeds。調 threshold、risk cap、cashout timing 或 utility table 時只能查看 development；policy、profiles、metrics 與 specialist gate 全部凍結後才執行 frozen validation，reserved-final 不得用來選參數。

巨匠藥 evaluator 的 Normal／Good／Malleable balanced、Normal-heavy 與 Good-scarce／Malleable-stress profiles 都是 assumed sensitivity，不是從玩家自然轉移估出的 probability。development 已分開報食藥非專家、食藥＋專家 stats 與無 buff：前兩組 primary `384／384`、adversarial stress `64／64` 均完成且滿品質，專家三技能使用 0 次；無 buff primary 完成 `384／384`、滿品質 `145／384`。因此 runtime 關閉 specialist actions，development coverage 只保留前兩組 exact food／medicine profiles；無 buff 不得標為滿品質 `near-boundary`。frozen／reserved 尚未執行，所有 development rate 都必須標 assumed、已參與開發且非實戰率。

### 預設測試套件價值稽核

2026-08-12 checkpoint `827cf73` 將預設 Vitest suite 由 209 tests 淨減為 193。保留的 canonical owner 包含 mechanics 公式／取整／terminal boundary、specialist semantics、protocol replay／undo／mismatch、simulator RNG／no-step、manual import／tamper、action resolution、玩家 golden／live traces，以及 solver safety／certificate；移除 literal mirror、重複 forwarding／起始狀態、無行為差異的訊息測試與研究 timing oracle。current checkout 只再加入一個巨匠藥 runtime contract，以食藥非專家 profile 驗證全 Malleable trace 仍同時完工、滿品質且不使用專家技能，因此預設 suite 為 194。後續新增防復發（regression）測試必須對應曾發生或高風險的可觀察 failure contract；能由既有 owner 覆蓋時合併案例，不以 test count、CSS 常數鏡像或 production literal copy 充當品質。

## 6. Performance

分開量測：

- transition throughput；
- episode／offline rollout throughput；
- policy training／distillation；
- runtime recommendation p50／p95／p99；
- worker startup／artifact load；
- UI input-to-render latency；
- debug／distribution／tree materialization。

快速 guide／lookahead fallback 保留原本 p95 `< 50ms` 的觀測基準；強規劃器目標為本機 p95 `< 1s`，目前 web hard timeout 為 `3s`，並需報 p99、max、timeout／fallback rate。Material Miracle 是否可接受同一上限仍需以實機錄影／計時量測 game↔tool switching，不以 solver benchmark 取代 UX evidence。

## 7. TS／WASM parity（未來才觸發）

若 profiler 證明需要新增 Rust／WASM batch core：

- TypeScript 保留 oracle。
- 同一 random stream、action、intermediate state 與 terminal outcome 逐步比較。
- shared fixtures 涵蓋 rounding、condition、buff、failure 與 boundary。
- solver summary 相同但中間 state 不同仍視為 parity failure。
- WASM memory／capacity failure與 wrapper materialization failure分開分類。
- 壓力 benchmark 不塞入預設 unit suite。

## 8. Evidence levels for claims

| Claim | 最低證據 |
| --- | --- |
| action formula 正確 | unit tables＋至少一條對應官方／遊戲 trace |
| full mechanics 可用 | representative golden traces 全步一致＋invariants |
| recommendation 達互動預算 | target platform／device benchmark，報 p50／p95／p99／max 與 timeout fallback |
| policy 優於 guide | held-out paired statistical evaluation＋無 safety regression |
| mission 可實戰完成 | 玩家完整 session replay＋resync／fallback evidence |
| probability 精確 | recipe-specific empirical／official profile＋sample metadata |

## 9. 失敗處理

測試失敗時先分類是 model bug、fixture bug、source drift、environment／sandbox 或 flaky timing。不得用增加 timeout、放寬 tolerance、刪除 edge case 或更新 snapshot 掩蓋未理解的差異。
