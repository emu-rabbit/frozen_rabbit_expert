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

## Paired comparison

Baseline 與 candidate 使用 common random numbers；case identity 至少綁 family、equipment、risk、world、seed、horizon 與 relevant hashes。

報告：

- candidate win／loss／tie；
- baseline completed→candidate failed veto；
- progress-only 與 hard-quality 分層；
- effect interval 與事前 practical threshold；
- per-family／worst-cell，而非只有平均。

Repeated looks、停止規則與 practical effect 在看結果前凍結。更多 seeds 不能修補結構性過鬆的 objective 或 bound。

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
