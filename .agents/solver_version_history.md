# Rust Solver 版本變更史

## 文件角色

本檔是 Rust generic solver identity 的變更摘要 owner。它回答每個版本改了什麼、由哪些 runtime signal 選擇、和前一版的關係，以及目前用途；精確 identity 由 `native/craft-kernel/src/generic_solver.rs` 及其 `portfolio` module 擁有，單次評測數字仍留在 evaluation output。

新增 Rust solver identity 時，同一個 task 要更新本檔。`.agents/current_state.md` 只保存目前 baseline／candidate，不重複整條時間線。

## 版本表

v1.0 起的主版號標示求解器架構世代。Web 採用、Application／Cargo package 版本與公開發布各自管理。

| 版本 | Identity | 相對前版的主要改動 | 目前用途 |
| --- | --- | --- | --- |
| v0.6 | `generic-craft-rust-bootstrap-v0.6.0` | 建立第一個 Rust generic route bootstrap，讓 whole-episode kernel 有可呼叫的 Rust policy。 | 歷史開發基線 |
| v0.7 | `generic-craft-hard-quality-context-v0.7.0` | 增加 hard-quality context 與必要品質收尾處理。 | 歷史實驗 |
| v0.8 | `generic-craft-rust-primary-v0.8.0` | 將 Rust route selector 升為當時的 primary policy，補齊通用 progress／quality／recovery 選擇。 | 歷史實驗 |
| v0.9 | `generic-craft-option-route-v0.9.0` | 引入可持續跨步的 option route。 | 歷史實驗 |
| v0.10 | `generic-craft-option-mpc-v0.10.0` | 對 option route 加入 bounded MPC 比較。 | 歷史實驗 |
| v0.11 | `generic-craft-guide-option-mpc-v0.11.0` | 把 frozen guide 訊號接入 option MPC 作遷移比較。 | 歷史遷移實驗 |
| v0.12 | `generic-craft-guide-lease-mpc-v0.12.0` | 加入 guide route lease，限制跨步 intent 的持有與釋放。 | 歷史遷移實驗 |
| v0.13 | `generic-craft-guide-phase-mpc-v0.13.0` | 以可觀測 phase 區分 route 決策。 | 歷史遷移實驗 |
| v0.14 | `generic-craft-strategy-portfolio-mpc-v0.14.0` | 讓多個 strategy persona 在同一 bounded portfolio 內競爭。 | 歷史實驗 |
| v0.15 | `generic-craft-capability-portfolio-mpc-v0.15.0` | 以 state／能力訊號選擇 portfolio option。 | 歷史實驗 |
| v0.16 | `generic-craft-deep-portfolio-mpc-v0.16.0` | 加深 portfolio 的 bounded route 比較。 | 歷史實驗 |
| v0.17 | `generic-craft-strategy-program-mpc-v0.17.0` | 將 persona 與 option 的切換整理為可延續的 strategy program。 | 歷史實驗 |
| v0.18 | `generic-craft-opportunity-reserve-v0.18.0` | 建立 Rust whole-episode solver 路徑，加入 condition opportunity reserve 與跨步 planner context。 | 歷史候選；commit `b8cac91` |
| v0.19 | `generic-craft-delivery-shield-v0.19.0` | progress-only 在已取得可交貨成果後保留 deterministic completion route，必要時使用明示的最後機會風險。 | 歷史候選；commit `d34e42f` |
| v0.20 | `generic-craft-budgeted-condition-v0.20.0` | 將 condition fishing／recovery 納入固定預算，避免無界等待球色。 | 歷史候選；commit `174132a` |
| v0.21 | `generic-craft-ts-v0.6-semantic-port-v0.21.0` | 把 frozen TypeScript v0.6 行為語意移植到 Rust whole-episode core，作第四批遷移基線；不是執行 TS solver。 | 歷史 overnight baseline；commit `d840a34` |
| v0.22 | `generic-craft-condition-set-portfolio-v0.22.0` | hard-quality 且非 Stable 時，依 recipe 宣告的 random condition set 在 v0.20 budgeted-condition 與 v0.21 semantic port 間共用切換；不讀 recipe／equipment ID 或未來 RNG。 | 第六批歷史比較對照；commit `4c45c0a` |
| v0.23 | `generic-craft-capability-condition-set-portfolio-v0.23.0` | 曾嘗試加入更粗的 capability selector；selector 未形成可接受的淨提升後已從路由移除，目前行為等同 v0.22。 | 保留 identity 作實驗追溯，不作候選 |
| v0.24 | `generic-craft-condition-continuation-portfolio-v0.24.0` | v0.22 選中的 budgeted-condition branch 在合法非終局 state 回傳空白時，改由同輸入的 shared semantic continuation 接手。 | v0.25 的直接策略基底 |
| v0.25 | `generic-craft-objective-capability-portfolio-v0.25.0` | 保留 v0.24 continuation；objective 以 recipe `qualityMax` 作唯一上限，所有 risk 共用完整四檔／連續品質／HQ 機率 utility，路線持續追求最高品質；risk-specific `protectedQualityFloor` 只控制退路與下行風險。只有進入 shared continuation 後，Observe／Careful Observation 才共用單次有限 fishing budget；新 continuation 會依呼叫端宣告的 action budget 保留 8 actions runway，runway 不足時只接受能立即完成的首步，已提早進入的路線則可走完。 | v0.26 的策略基底 |
| v0.26 | `generic-craft-progress-quality-shield-v0.26.0` | progress-only 尚未滿品質、耐久不高於 10 且 base 將以必成進展立即完工時，若工匠的絕技仍可合法使用，先啟用一次性耐久保護以保留追品質空間。只讀 objective、state、action preview 與 action budget。 | v0.27 的策略基底 |
| v0.27 | `generic-craft-specialist-resource-portfolio-v0.27.0` | hard-quality 專家在內靜成熟、改革未啟用且資源受壓時，可在必成品質技能前使用快速改革；base policy-null 時可用專心致志打開資源恢復機會。設計變動仍由既有 condition route 使用。 | v0.28 的策略基底 |
| v0.28 | `generic-craft-progress-bank-portfolio-v0.28.0` | progress-only 尚未達 protected floor、未達 90% 滿品質且 base 將提前完工時，改選不完工的必成技能；替代後必須仍有 7 actions 內的 deterministic completion certificate。 | 行為基底 |
| v0.29 | `generic-craft-flat-opportunity-portfolio-v0.29.0` | 將 v0.26–v0.28 的遞迴版本 wrapper 攤成單層 orchestration：只求一次 v0.25 base，再依固定順序套用品質護欄、專家機會與進展 bank；base-null 才做專家恢復。600 個 paired cases 與 v0.28 的結果／stop／state／長度／context 完全相同。 | v0.30 的結構基底 |
| v0.30 | `generic-craft-specialist-resource-guard-v0.30.0` | 修正 v0.27 將「耐久 10 但仍有掌握回合」誤判為資源壓力：CP 尚充足時，掌握會覆蓋低耐久訊號，不提前花快速改革；真正低 CP 或沒有掌握覆蓋的低耐久仍可使用。以 state／buff／resource signal 選擇，不讀 recipe／equipment ID。 | 第六批檢測與分析完成；2026-08-27 接受為有足夠改善、保留局部小幅缺陷的架構研究 baseline；implementation checkpoint `59988e2`，結果見 current state |
| v1.0 | `generic-craft-route-portfolio-v1.0.0` | 建立 action＋continuation 候選、共同成敗分支評估、固定預算續作、setup／consumer 與 observed-event route memory。Semantic／Budgeted 能力透過 adapter 提案，recipe identity 在邊界移除。 | 新架構 foundation checkpoint `7eeed3b`；[第一批報告](../reports/generic-cosmic-overnight/v100-development/results.md) 及封存 binary 作開發對照 |
| v1.1 | `generic-craft-route-portfolio-v1.1.0` | 必要品質／progress-only 分配 8／4 個共同 samples，selection 依配對增益的不確定性成本比較換路線；未交付結果保留目標距離 tie-break，單一候選只評估首步。完工 witness 遵守剩餘 action budget，已證實 suffix 的耐久搜尋改為二分。後續以存在性查詢、最佳耐久上界及局部完整輸入快取保留決策並減少計算。 | 效能 checkpoint `c3ff358`；固定 64-seed npm 交付、ABI v7 逐次耗時及證據見 [效能報告](../reports/generic-cosmic-overnight/v110-performance/results.md) |
| v1.2 | `generic-craft-route-portfolio-v1.2.0` | 依全部九種球色提出獨立機會，與共用品質／進展／資源及完整品質收尾路線比較；超過三個提案時先共同初評，再比較參考與最佳替代。修正無效果的 no-step 消耗，依葉端真正讀取的 context 快取，省略模擬內未讀取的路線記帳；真實事件更新完整保留。 | 研究節點；新種子確認有一般收藏品收益但必要品質／HQ 退步，不交付 overnight；見 [結果](../reports/generic-cosmic-overnight/v120-development/results.md) |
| v1.3 | `generic-craft-route-portfolio-v1.3.0` | 固定寬度／深度的完整收尾候選、等價 forecast 共用決選名額與計算、hard-quality 8-sample 決選、滿品質立即交貨快速路徑。已有滿品質 witness 時不再重做 beam；不同 consumer／suffix 與真實 route 記帳保留，只讀 state／objective／condition／risk。 | 研究 checkpoint，尚未交付 overnight；[v1.3 結果](../reports/generic-cosmic-overnight/v130-development/results.md) |
| v1.4 | `generic-craft-route-portfolio-v1.4.0` | 兩種起手、可支付品質連招與內靜建立候選；依 Semantic 真正的 context 依賴共用 forecast，保留 Budgeted 歷史差異。收尾寬度縮至 16。 | 失敗研究 checkpoint；交貨／HQ 退步且成本超界，撤回採用；[v1.4 結果](../reports/generic-cosmic-overnight/v140-development/results.md) |
| v1.5 | `generic-craft-route-portfolio-v1.5.0` | 回到 v1.3 行為；以單次推薦 scoped、容量有界的純查詢快取重用進展／品質 witness，含 None。只對確定不讀品質的進展查詢投影品質欄位，保留原搜尋預算。 | 精確行為與成本研究 checkpoint；初批 1,800 cases 和 v1.3 逐招／結果／context 一致，但成本仍超界；[v1.5 結果](../reports/generic-cosmic-overnight/v150-development/results.md) |
| v1.6 | `generic-craft-route-portfolio-v1.6.0` | 回到 v1.3，三候選先各以兩個共同 samples 初評，保留參考與最佳替代再完整比較；其他候選數不變。 | 失敗研究 checkpoint；1,800 cases 比 v1.3 少完成三件且省時不足，撤回採用；[v1.6 結果](../reports/generic-cosmic-overnight/v160-development/results.md) |
| v1.7 | `generic-craft-route-portfolio-v1.7.0` | 回到 v1.3；完整 suffix 展開全部球色，只有各分支都合法、必成且滿品質完工才縮減比較。品質已滿時也檢查多步進展；固定 state／transition 上限，超界為 unknown。 | 未採用研究 checkpoint；1,800 cases 僅多一件滿品質，時間幾乎不變；[v1.7 結果](../reports/generic-cosmic-overnight/v170-development/results.md) |
| v1.8 | `generic-craft-route-portfolio-v1.8.0` | 回到 v1.3；以樂觀品質／進展上界剪去不可能達標的查詢或支線。只讀 mechanics、state 與剩餘步數；品質預查保持 witness，進展剪枝會改變固定預算內的路線。 | 未採用研究 checkpoint；broad 品質／交貨退步，成本不足；[v1.8 結果](../reports/generic-cosmic-overnight/v180-development/results.md) |

## 維護規則

每個新版本只在確實改變可觀察 solver 行為或輸入契約時建立 identity，並在同一列記錄：

1. 相對上一版唯一新增或移除的策略能力。
2. selector 可讀取的 mechanics／objective／condition／state signal。
3. 是獨立候選、組合基底、撤回實驗或正式 comparison baseline。
4. commit 或可重播 evaluation output；尚未 commit 的 candidate 由 current state 指向目前 checkout。

不得把 seed 數、單次勝負或暫時 tuning weight 寫成版本定義；這些是 evidence，不是 identity 語意。
