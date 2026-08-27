# v1.0 新求解器實作

## 版本用途

`generic-craft-route-portfolio-v1.0.0` 標示新的 Rust 求解器架構世代。Application、Cargo package、Web 採用與公開發布各自管理；本次維持既有應用程式與 package 版號。

方向 checkpoint 為 `8995441`。目前 baseline 為 v0.30；v1.0 是依 [開發評測 brief](brief.md) 驗證的新 candidate。

## 決策資料流

~~~text
實際 state + objective + crafter + condition model + PlannerContext
  -> 能力提出 action + continuation + setup/consumer
  -> 共用 preview、首步成敗分支與有限續作
  -> 安全、完整品質價值與下行成本比較
  -> 選定建議
實際 action/outcome
  -> mechanics transition
  -> 更新 route memory，下一步重新比較
~~~

| Owner | 責任 |
| --- | --- |
| `native/craft-kernel/src/generic_solver/portfolio/types.rs` | 候選、分支證據、路線記憶與外層工作量 |
| 同目錄 `producers.rs` | Semantic、Budgeted、進展、品質、球色、恢復與專家能力提出候選；相同 action 的不同續作各自保存 |
| 同目錄 `scoring.rs` | 共用成敗分支、私有規劃樣本、有限續作與品質／風險評分 |
| 同目錄 `mod.rs` | v1.0 identity、能力 adapter、合法性／立即失敗排序與統一選擇 |
| `native/craft-kernel/src/generic_episode.rs` | 依實際事件推進；observer 使用同一次推薦結果提供診斷 |

新流程重用現有 Rust mechanics、完整品質效用、Semantic 與 Budgeted 續作能力、資源判斷和有限完工搜尋。v0.30 的路由保留作對照；新 candidate 透過自己的比較器選招。

## 比較與預算

- 最多 16 個 route candidates；同一 action 共用 preview。完全相同的 action／route 合併來源，來源數量不增加分數。
- 首步成功與失敗依 mechanics 機率分開計算，每個有機率的分支使用 2 個私有規劃樣本，最多續作 64 actions，並受剩餘 action budget 限制。
- 外層最多 4,096 個 projected transitions。`PortfolioWork` 記錄候選數、不同 action、producer／continuation 呼叫及外層轉移；重用 adapter 內部的既有 bounded search 另有自身預算。
- 只有完成的樣本取得 delivered quality utility。未完成狀態保留小幅 potential 作比較線索；有限搜尋沒有找到路線時保留 unknown。
- 完工證據可表達已完成、Normal reference 下下一招可完成、已發生 mechanics failure 或 unknown。這些證據與有限樣本的 completion estimate 分開呈現。
- Stable／Balanced／Aggressive 共用完整品質效用，透過完成權重及 protected-floor 下行成本表達風險。分數相同時優先延續仍有效的 continuation，再比較預期工序。

規劃 seed 由可觀測 state 與樣本索引產生；adapter 接收已移除 recipe identity 的 mechanics profile。真實 episode seed／RNG cursor 只由 episode controller 使用。球色權重是宣告的假設模型；未提供權重的 library 呼叫採 Normal continuation。

## 路線與實際事件

這一版保存準備技能、直接使用該效果的 consumer、續作 engine、intent 與暫時 interrupt。Consumer 需合法、能使用準備效果且具備當下資源；未來路線透過每一步的新評估延續。

球色或資源機會可以暫時保存原路線；相同觀測狀態下有效的 consumer 會再次成為候選。玩家自行選招時，以實際 action 更新 context；不附帶 route 的實際事件會清除舊 intent，resync 後依新 state 重新判斷。

## 診斷與評測入口

`recommend_route_portfolio` 回傳實際選擇、全部候選證據與工作量。`execute_generic_episode_with_observer` 在規劃完成後、真實 RNG 抽樣前提供唯讀 state／context 與同一份推薦結果。

`route_portfolio_diagnostics` example 接受 1–8 個 native episode cases，輸出每步候選、分數、consumer、分支、工作量與 p50／p95／p99／max。Native paired evaluator 的 `--output` 同時保存 `.baseline.tsv`／`.candidate.tsv`，可直接重播；report 記錄 binary SHA-256，每臂有可設定的 timeout。

目前 wire 仍為 `native-generic-episode-batch-v6`：既有輸入／輸出欄位保持一致，handshake 新增 solver identity，v1.0 context 使用獨立 fingerprint。新 metadata 位於 library diagnostic API；Web 與 session protocol 維持現況。

## 下一個驗收層級

先以 development 的逐 family 結果定位候選覆蓋、續作估計與資源分配，再固定未參與調整的完整保留集與接受界線。主／快速雙求解器、3 秒 runtime watchdog、目標裝置效能與 Web 採用依 [roadmap](../../../.agents/roadmaps/broad_solver_implementation_plan.md) 分別驗收。
