# 新求解器架構：能力參考與工程風險

日期：2026-08-27。本文整理 v0.30 可重用的能力、現有證據及新架構的工程風險。實施順序與交付里程碑由 [roadmap](../../../.agents/roadmaps/broad_solver_implementation_plan.md) 擁有，驗收方式由 [algorithm_verification.md](../../../.agents/skills/domain/algorithm_verification.md) 擁有；第六批實證見 [結果分析](review.md)。

## 設計目標

v0.30 是已接受的效果基準。新 Rust 架構追求相當或更好的求解成果、合理計算成本及更容易改善的結構；選招、路線與 planner context 按新設計組織。

工程投入以能運作的新決策流程、早期效果比較及可定位的改善問題為主。既有能力依其服務的玩家成果選擇重用或重新設計，baseline binary 和歷史資料提供獨立比較與診斷。

## 可重用能力

主要程式入口為 [generic_solver.rs](../../../native/craft-kernel/src/generic_solver.rs) 與 Rust [ts_migration_port.rs](../../../native/craft-kernel/src/ts_migration_port.rs)。下表是取材索引；實際程式邊界由新架構決定。

| 能力 | 現有入口 | 評估的新架構成果 |
| --- | --- | --- |
| 完整品質價值與風險退路 | `GenericObjective`、`quality_utility` | 三種 risk 持續追求完整品質，並適當衡量失去完工與品質退路的成本 |
| 低耐久時保留追品質空間 | `progress_quality_shield_action` | 同時評估延後完工的品質收益與後續交貨機會 |
| 控制進展增量 | `premature_finish_progress_bank_action` | 協調進展、品質與收尾資源，保留有價值的後續路線 |
| 專家品質與恢復機會 | `specialist_quality_opportunity_action`、`specialist_null_recovery_action` | 準備技能能接上受益的後續技能，資源投入轉化為完成與品質成果 |
| 共用續作與有限等待球色 | `objective_capability_base_decision`、`bounded_shared_continuation_decision` | 在可觀測條件及明示預算內利用機會、恢復與收尾 |
| 使用紀錄與資源管理 | `PlannerContext`、`advance_planner_context` | 新 context 保存使用紀錄、路線意圖與預留資源需求，客觀資源餘量由 `CraftState` 提供 |

能力對照保持精簡，連到原 owner 與代表案例即可。新流程透過共同證據比較各能力提出的方案，並以完成、品質及成本驗收其價值。

## 現有證據的用途

- **效果基準**：v0.30 source checkpoint、保存的 binary 與第六批原始結果提供固定比較身份；v0.22 留作歷史分析。
- **開發與診斷**：已看過的六批資料、[逐家族索引](family-summary.md)、[分組量尺](metrics.json) 和[案例重播](replays.json) 用於選擇代表情境及定位效果差異。
- **採用驗證**：另固定未參與調整的 seeds／保留集，覆蓋完整 family × equipment × risk × assumed world；統計與取捨按驗收 owner 執行。

原始 overnight rows 保存每件的技能序列、終局 state、停止原因與 context fingerprint；選定案例的診斷重播另有逐步 trace。調查具體問題時，再補充所需的候選、路線、context 或資源紀錄，讓觀測成本對應到可解除的問題。

## 架構風險與驗證重點

| 面向 | 工程風險 | 對應的設計與驗證 |
| --- | --- | --- |
| 候選覆蓋 | 有價值的方案未進入比較 | 以代表情境及來源摘要檢查 progress、quality、condition、resource 與 specialist 能力 |
| 後續路線估計 | 有限搜尋對準備技能的收益、恢復或收尾估計不足 | 比較首步與續作，涵蓋預期受益技能及完工退路；搜尋邊界採共同續作估計 |
| 路線銜接 | 球色機會、實際失敗或玩家偏離改變原路線的可行性 | 明確記錄進入／退出條件，依實際 state 選擇繼續、暫時插入或換路線 |
| 完工證據 | 搜尋結果的可信範圍不同 | 區分找到路線、已反證及預算內未找到，保留搜尋假設與預算 |
| 證據合併 | 相同首步可能具有不同資源需求及後續用途 | 共用 mechanics preview，保留各方案的 consumer、reserve 與 context 差異 |
| State 比較 | buff、condition、combo、一次性資源或 context 改變可用路線 | 在語意可比較時使用 Pareto dominance，其餘以路線收益評估取捨 |
| 計算與維護成本 | 候選展開及規則交互作用增加成本 | 使用固定 work budget，量測候選數、展開量及 latency，結合效果與模組責任判斷 |
| 泛化 | 開發資料的效果無法延伸到其他輸入 | 以未見保留集檢查重要切片、玩家偏離與成本，呈現配對及群集不確定性 |

共同 scorer 的效益取決於候選覆蓋與續作估計。早期評測用來識別主要限制，再將工作集中於能改善玩家成果的部分。

## 證據範圍

現有結果屬 native、synthetic assumed-world evidence。新架構先在相同可比較條件下驗證成果與計算成本；遊戲自然球色、任務時間及目標裝置表現，分別由遊戲實證與 Web 採用評測補足。

下一次實作的第一個交付與後續採用條件依 [roadmap](../../../.agents/roadmaps/broad_solver_implementation_plan.md)。本文件提供取材與診斷參考，具體效果門檻及工作預算在當輪 brief 固定。
