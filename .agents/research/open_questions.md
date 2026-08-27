# Active Research Questions

## 文件角色

本檔只列尚未回答、會影響目前產品決策的問題。已結案或移出範圍的問題進 archive，不保留長篇時間線。

## 問題清單

| ID | 問題 | 為何阻塞 | 需要的 evidence | 結案位置 |
| --- | --- | --- | --- | --- |
| RQ-02 | 若採用 Rust 結果，WASM 或新的 TypeScript Web core 較合適？ | 決定 Web compute owner | 同 corpus target-device benchmark、boundary transfer、load／memory、parity 與維護成本 | `technical_architecture.md` |
| RQ-03 | 獨立快速求解器如何證明 valid state 0 policy-null？ | 是 release 必備 fallback | 結構性 legal-action selector proof、reachable stress corpus、p95／p99／max、final-selector rate | `solver_policy_and_safety.md`＋tests |
| RQ-04 | 100ms 快速 solver 的 target devices 是哪些？ | 沒有裝置範圍就不能成立產品 latency claim | 代表性 desktop／mobile hardware、browser、cold／warm measurements | Release evidence |
| RQ-05 | 哪些 hard-quality family failures 是策略缺口，而不是裝備或 assumed world 壓力？ | 決定下一個 generic Rust hypothesis | Per-cell traces、resource tail、paired route analysis、必要時 tighter bound | Rust evaluation report |
| RQ-06 | 自然 condition transition 是否有足夠 evidence？ | 限制真實成功率 claim | Patch-aware player traces 或 official data、sample metadata、transition matrix | Data package／research report |
| RQ-07 | 目前 UI 的技能繁中名稱是否全部符合官方伺服器用語？ | 避免玩家看到非正式譯名 | 對照繁中官方能工巧匠指南與 in-game strings | i18n owner＋`glossary.md` |
| RQ-08 | 發布前需要哪些代表性玩家完整 traces？ | Synthetic matrix 不能取代實戰 interaction | 不同 family／裝備／risk 的匿名 full sessions，含 deviation／resync／failure | Golden trace fixtures |
| RQ-09 | 新 candidate 資料流在代表情境中有哪些候選覆蓋、續作估計或路線銜接的改善空間？ | 決定第一批實作後的改善優先序 | 相對 baseline 的有限效果比較、來源與工作量摘要、依問題取得的案例 trace | Rust evaluation report＋roadmap |
| RQ-10 | 共同 scorer 與 route intent 能否提供相對研究 baseline 相當或更好的成果及合理成本？ | 決定新 Rust 求解器的採用價值 | 事前效果／代價界線、未見保留集、重要切片、玩家偏離、複雜度與 latency | Rust evaluation report＋`current_state.md` |

## 已移出目前範圍

跨件材料、任務分數、倒數與 Duty Action 的問題不再是本專案 blocker。除非使用者重新把 Mission controller 納入產品，不建立 active research item。

歷史五配方、舊 equipment scorecard、Material Miracle 與舊 promotion questions 見 [archive snapshot](../archive/research/open_questions-before-2026-08-26.md)。

## 新增與結案格式

新增問題需包含：

- 唯一 ID；
- 一句可回答的問題；
- 它解除的產品 blocker；
- 最小充分 evidence；
- 結案後更新的 canonical owner。

Evidence 到位後，先更新 owner，再從本檔刪除問題；需要保留的調查過程移入 evaluation output 或 archive。
