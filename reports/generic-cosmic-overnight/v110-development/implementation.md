# v1.1 實作責任與計算契約

## 決策流程

`Input → producers → scoring → selection → GenericDecision → observed event`

| Owner | 責任 |
| --- | --- |
| `portfolio/mod.rs` | 正規化 mechanics／objective，組合流程，重用 Rust Semantic 與 Budgeted 能力 |
| `portfolio/producers.rs` | 提交合法 action＋continuation、setup／consumer、condition／resource／specialist 候選 |
| `portfolio/scoring.rs` | 保存 root 成敗分支、Normal 參考完工證據、隔離續作、品質效用與每個樣本的結果 |
| `portfolio/selection.rs` | 比較立即失敗、預期效果與配對增益的不確定性成本，並以有效既有路線作參考 |
| `portfolio/types.rs` | 共用 evidence 型別及由實際事件更新的 route memory |
| `ts_migration_port.rs` | 既有 Rust 能力與品質效用；已成功重播 suffix 的最小起始耐久使用有限區間二分搜尋 |

新增能力由 producers 提案，由同一 selection 選擇。來源數量只描述證據，不增加權重。玩家回報、偏離與 resync 都經實際 state／context 更新。

## v1.1 的評估預算

- 每次最多 16 個 action＋continuation 候選，最多 64 個假想 actions。
- 有比較選擇時，必要品質每個非零 root 分支使用 8 個共同 samples，progress-only 使用 4 個。
- 單一候選只計算首步分支，`forecast_horizon=1`；此時的 completion 值只代表首步終局證據。
- 真實 episode 的 RNG、cursor 與 state 由 episode controller 擁有；預測使用獨立的 state-seeded stream。
- Root 失敗分支使用 mechanics 成功率加權，續作樣本是 planning estimate。預測未交付的結果只有小幅目標距離 tie-break。
- 比較器在既有 capability 的逐樣本結果上計算配對增益的 standard error，再依 risk 給成本；這是選招的有限樣本穩定化方法，不是遊戲自然成功率的信賴區間。
- 完工 witness 同時受剩餘 action budget 限制。`Unknown` 表示當下證據範圍不足。

外層轉移上限為 `16 × 2 × 8 × 64 = 16,384`。Adapter 內既有搜尋各有固定預算；此上限描述外層，不把 adapter 搜尋藏進外層計數。

## 可回答的診斷問題

`route_portfolio_diagnostics` 使用正常 episode 的同一次唯讀 observer，輸出每步 state、候選來源、route、成敗證據、預期品質、原始 score、selection score、樣本數、horizon 與 work counters。它支援回答候選是否缺漏、setup 是否有 consumer、風險分支如何影響選擇、換路線是否有足夠收益，以及時間花在哪一層。

## 操作與版本

Solver `1.1` 屬 `1.x` 架構世代；Application／Cargo package 版號及 Web 採用各自管理。Native wire 與 ABI 維持 v6；context 格式維持 route-portfolio-context-v1。

Overnight runner `1.2.0` 統一中止 evaluator 程序樹：Windows 使用本次 spawned PID 的 taskkill tree，POSIX 使用獨立 process group。Native timeout 由 shard timeout 傳入；parent invocation deadline 可停止仍在工作的整棵 child tree。Atomic shards 與 config identity 繼續由既有 runner 管理。
