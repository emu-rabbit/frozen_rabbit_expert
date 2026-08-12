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
