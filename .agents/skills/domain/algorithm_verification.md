# Mechanics 與 Solver 驗證規範

## 文件角色

本檔定義各種 claim 需要的 evidence，以及如何避免 aggregate、synthetic 或 migration 指標誤導產品決策。

## Mechanics 驗證

### Unit／table tests

每個支援技能至少覆蓋：

- legal／illegal；
- success／failure；
- condition modifier；
- CP／耐久／進展／品質與 rounding；
- buff／combo／內靜／一次性技能；
- terminal 與 required quality。

表格 expected value 需要來源或可重播 trace；只把目前 implementation 抄成 expected 不算獨立驗證。

### Invariants

每一步檢查：

- 數值有限且在合法範圍；
- CP、耐久、內靜與 buff duration 不越界；
- terminal 後不再推薦一般技能；
- illegal action 不改 state；
- forced condition 與 no-step action 符合 contract；
- replay 相同 identities／events 得到相同 state。

### Golden traces

Golden trace 要保存 recipe、crafter、initial state、每步 action／success／condition、observed state、versions 與 provenance。逐步一致才支持 mechanics claim；只有 final summary 相同不足。

工作流見 [validate-golden-traces.md](../../workflows/validate-golden-traces.md)。

## Solver 評測矩陣

開發與 release evidence 以 mechanics family 去重，但報告仍能追回 recipe identities。

最低切面：

~~~text
family
× equipment profile／band
× Stable／Balanced／Aggressive
× declared condition world
× paired seed
~~~

相同 family 的新名稱配方不重跑同一求解案例。若 objective、condition set 或 mechanics 不同，必須拆 family。

### 必報結果

- progress-only delivery；
- progress-only meaningful-quality floor／utility；
- hard-quality completion；
- quality distribution／high tail；
- policy-null、no-legal-action、terminal failure、action-limit；
- illegal／safety violations；
- 製作長度：全部技能使用數（含 no-step）與實際推進遊戲工序數分開，完成／未完成各報 p50／p90／p95／max；
- CP／耐久尾端與 recovery；
- fast-selector 使用率；
- main／fast latency。

Aggregate 只作入口。結論必須指出是裝備壓力、condition assumption、資料缺口或策略缺口；未知時明示 mixed／inconclusive。

製作長度目前是觀察量尺，不是自動 release gate。任務倒數、技能動畫、網路與玩家回報延遲尚未進入模型，所以不能從 actions／steps 直接換算任務是否來得及；但 family × equipment × risk × world 的長尾應被保留，供後續用 live 任務時間資料建立門檻。

## 「不退步」的驗收標準

本專案依變更目的選擇驗收方式。策略層的「不退步」是保有或提高玩家在隨機製作中取得有價值成果的機會；個別配對的勝負交換是效果分析的一部分。

| 變更類型 | 要證明的事情 | 通過依據 |
| --- | --- | --- |
| 正確性與 runtime 契約 | Mechanics、合法性、state／identity、結果標示、計算預算與回傳行為可信 | 規則與 invariants 嚴格成立；必要品質如實計入成功，主／快速求解器各自符合契約 |
| 保持行為的結構搬移 | 新資料流完整承接原行為 | 在聲明的 corpus 上做 deterministic exact parity，涵蓋 action、state、context、RNG、資源／預算及停止結果；事先列出可不同的 timing／觀測 metadata |
| 有意改變決策的策略實驗 | 成功機率、完整品質與成本的取捨符合產品目標 | 依主要效果、不確定性、重要切片與事前容忍界線決策，允許個別 seed 勝負互換 |

Exact parity 的結論限於聲明的輸入範圍，適用於不改行為的搬移階段；策略演進使用效果驗收。合法隨機技能的失敗與 best-effort 未完成按機率、結果和成本評估，與 mechanics／runtime 違規分開。

## Paired comparison

Baseline 與 candidate 使用 [common random numbers](../../glossary.md)。Case identity 至少綁 family、equipment、risk、world、seed、horizon 與 relevant hashes。

報告包含：

- candidate win／loss／tie，以及完成與未完成之間的雙向變化；
- progress-only 交貨、完整品質效用與 hard-quality 完成／滿品質分層；
- effect interval、事前 practical threshold 與成本；
- family × equipment × risk × world，以及重要弱切片的原因。

### 策略實驗的決策流程

1. **定義比較目的。** 在 active brief 固定主要量尺、版本、切片與加權、practical effect、可接受代價、統計方法及停止規則。等權矩陣表示 benchmark 效果；推論玩家平均體驗需要玩家分布依據，各 assumed worlds 另列。
2. **衡量玩家成果。** Hard-quality 成功、progress-only 交貨和品質價值各自評估，再結合風險偏好、製作長度及已知成本。若每次成本與成功價值相同、結果只有成敗，提高成功機率就是改善。尚未建模的材料或任務時間成本列為未知。
3. **檢查重要情境。** 依可觀測的 family、裝備能力、risk、world／state signal 尋找有實質影響的弱點。切片判斷同時看幅度、樣本量與不確定性，容許樣本波動和持平；整體收益與可信的局部代價一併交代。
4. **用保留集驗證。** 已參與調整的資料用於 development／回歸與診斷；promotion 使用未參與決策的資料。區間估計保留配對與群集結構，例如同一 seed 在不同 risk 下的相關觀測，並處理 repeated looks 與多重比較。
5. **選擇值得維護的改善。** 收益和損失案例共同用於定位候選缺失、資源與續作估計問題。優先採用可泛化、在保留集具有淨效益且維護成本合理的改動；逐案勝負不是採用門檻。已觀察到的代價是否可消除，仍是待驗證問題。

主要效果與重要切片／成本都落在事前約定界線內時，可提出採用建議；證據不足時補最有辨識力的驗證，超出界線或取捨尚未約定時交使用者決策。具體數值由每輪 brief 擁有，最終正式發布仍依下方發布 evidence 審查。

若使用者在看過結果後調整產品取捨，保留原 brief，另記決策日期、理由與資料用途。新判準用於後續實驗；本輪則如實記為看過 evidence 後的決策。

## Condition world

Natural transition 未知時可用多個 plausible／stress worlds，但每個都標 assumption。IID marginal、Normal-heavy、opportunity-scarce 或 all-Normal 都不是實際成功率。

若要宣稱 probability 精確，需要 recipe／family-specific empirical 或 official transition evidence、sample metadata 與 uncertainty。

## 主／快速求解器

### 主要求解器

- 在目標裝置量測 p50／p95／p99／max。
- 3 秒為 hard watchdog；只有用滿才算 timeout。
- Startup、boundary transfer、compute 與 rendering 分開。

### 快速求解器

- 固定 work budget，目標裝置 p95 小於 100ms。
- 報 p50／p95／p99／max、final-selector 使用率與 policy-null。
- Valid nonterminal state 仍有 legal action 時，0 policy-null 是結構 contract與 evaluation gate。
- 壓力 state 包含玩家偏離、弱裝備、接近終局、低 CP／耐久與 forced condition。

Reference desktop benchmark 不能取代 mobile／target-device UX。

## Rust、WASM 與 TypeScript

- Frozen TS→Rust migration 比較 mechanics／codec／RNG／terminal exactness，以及事前定義的 outcome parity；有意演進的 Rust policy不需逐招複製 TS。
- Rust native→同一 Rust WASM core 若被採用，transition、RNG、terminal 與 solver output 應要求 exact parity，除明示 platform metadata。
- 若採用新的 TypeScript Web core，需重新定義 Rust→new-TS parity gate；不能稱為舊 TS continuation。
- Parity corpus 包含 full state、action history、planner context、stop reason 與 timing 以外的 deterministic output。
- ABI、binary、schema、solver 或 corpus identity 漂移時 fail closed。

## 能力界線

Evidence 強度：

~~~text
目前 causal policy outcome
  <= 最佳未知 causal policy
  <= 看得到 future RNG 的 fixed-tape witness
  <= 放寬資源與 setup 的 optimistic bound
~~~

- Closed-loop matrix 是目前 policy 的 evidence，不是裝備理論上限。
- Fixed-tape witness 證明特定未來存在路線，不是 live 可達率。
- Relaxed bound 只有 negative impossibility 具硬意義；not-ruled-out 不等於可達。
- 宣稱 near-model-limit 需要事前定義的 stochastic causal lower／upper bracket；bound 太寬時標 inconclusive。

## 發布 evidence

產品採全部 432 配方的單一 release gate，不使用 maturity badge。發布 review 至少回答：

- 每個 family 的 mechanics 是否有可信 evidence；
- 主／快速 solver 是否 0 illegal，快速 solver 是否 0 policy-null；
- progress-only 與 hard-quality 是否各自達到使用者接受的效果；
- 裝備、risk 與 worlds 的 worst cells；
- 玩家偏離、undo、resync 與 replay；
- 目標裝置 latency；
- 哪些結論仍只來自 synthetic／assumption；
- 是否存在會讓某 family 不宜發布的系統性 failure。

最終是否足夠可靠由使用者檢視完整 evidence 後決定，不能由單一自動分數代替。
