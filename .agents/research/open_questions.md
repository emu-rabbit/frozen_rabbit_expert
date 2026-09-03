# Active Research Questions

## 文件角色

本檔只列尚未回答、會影響目前產品決策的問題。已結案或移出範圍的問題直接刪除，不保留長篇時間線。

## 問題清單

| ID | 問題 | 為何阻塞 | 需要的 evidence | 結案位置 |
| --- | --- | --- | --- | --- |
| RQ-03 | 獨立快速求解器如何證明 valid state 0 policy-null？ | 是 release 必備 fallback | 結構性 legal-action selector proof、reachable stress corpus、p95／p99／max、final-selector rate | `solver_policy_and_safety.md`＋tests |
| RQ-04 | 100ms 快速 solver 的 target devices 是哪些？ | 沒有裝置範圍就不能成立產品 latency claim | 代表性 desktop／mobile hardware、browser、cold／warm measurements | Release evidence |
| RQ-05 | 哪些 hard-quality family failures 是策略缺口，而不是裝備或 assumed world 壓力？ | 決定下一個 generic Rust hypothesis | Per-cell traces、resource tail、paired route analysis、必要時 tighter bound | Rust evaluation report |
| RQ-06 | 自然 condition transition 是否有足夠 evidence？ | 限制真實成功率 claim | Patch-aware player traces 或 official data、sample metadata、transition matrix | Data package／research report |
| RQ-08 | 發布前需要哪些代表性玩家完整 traces？ | Synthetic matrix 不能取代實戰 interaction | 不同 family／裝備／condition sets 的預設策略匿名 full sessions，含 deviation／resync／failure | Golden trace fixtures |

## 已移出目前範圍

跨件材料、任務分數、倒數與 Duty Action 的問題不再是本專案 blocker。除非使用者重新把 Mission controller 納入產品，不建立 active research item。

歷史五配方、舊 equipment scorecard、Material Miracle 與舊 promotion questions 已結案；需要追溯時由 Git history 與對應 evaluation report 取回。

## 新增與結案格式

新增問題需包含：

- 唯一 ID；
- 一句可回答的問題；
- 它解除的產品 blocker；
- 最小充分 evidence；
- 結案後更新的 canonical owner。

Evidence 到位後，先更新 owner，再從本檔刪除問題；需要保留的調查結果移入 evaluation output。
