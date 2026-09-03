# Rust Solver 版本變更史

## 文件角色

本檔是 Rust generic solver identity 的變更摘要 owner。它回答每個版本改了什麼、由哪些 runtime signal 選擇、和前一版的關係，以及目前用途；精確 identity 由 `native/craft-kernel/src/generic_solver.rs` 及其 `portfolio` module 擁有，單次評測數字仍留在 evaluation output。

新增 Rust solver identity 時，同一個 task 要更新本檔。`.agents/current_state.md` 只保存目前 baseline／candidate，不重複整條時間線。

## 版本表

v1.0 起的主版號標示求解器架構世代。Web 採用、Application／Cargo package 版本與公開發布各自管理。

2026-08-29 使用者校正：往後只有經驗證、有意義的推進才給數字版號，規則由 [開發實作規範](skills/professional/development_standards.md) 擁有。下表既有 v1.2–v1.10 是改用此規則前的研究身份，**不代表九次已驗證的能力升級**；保留原名供重播，不重新編號。

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
| v1.3 | `generic-craft-route-portfolio-v1.3.0` | 固定寬度／深度的完整收尾候選、等價 forecast 共用決選名額與計算、hard-quality 8-sample 決選、滿品質立即交貨快速路徑。已有滿品質 witness 時不再重做 beam；不同 consumer／suffix 與真實 route 記帳保留，只讀 state／objective／condition／risk。 | 未採用研究 checkpoint；新種子確認有必要品質退步，收藏品方向仍有收益；[v1.3 結果](../reports/generic-cosmic-overnight/v130-development/results.md) |
| v1.4 | `generic-craft-route-portfolio-v1.4.0` | 兩種起手、可支付品質連招與內靜建立候選；依 Semantic 真正的 context 依賴共用 forecast，保留 Budgeted 歷史差異。收尾寬度縮至 16。 | 失敗研究 checkpoint；交貨／HQ 退步且成本超界，撤回採用；[v1.4 結果](../reports/generic-cosmic-overnight/v140-development/results.md) |
| v1.5 | `generic-craft-route-portfolio-v1.5.0` | 回到 v1.3 行為；以單次推薦 scoped、容量有界的純查詢快取重用進展／品質 witness，含 None。只對確定不讀品質的進展查詢投影品質欄位，保留原搜尋預算。 | 精確行為與成本研究 checkpoint；初批 1,800 cases 和 v1.3 逐招／結果／context 一致，但成本仍超界；[v1.5 結果](../reports/generic-cosmic-overnight/v150-development/results.md) |
| v1.6 | `generic-craft-route-portfolio-v1.6.0` | 回到 v1.3，三候選先各以兩個共同 samples 初評，保留參考與最佳替代再完整比較；其他候選數不變。 | 失敗研究 checkpoint；1,800 cases 比 v1.3 少完成三件且省時不足，撤回採用；[v1.6 結果](../reports/generic-cosmic-overnight/v160-development/results.md) |
| v1.7 | `generic-craft-route-portfolio-v1.7.0` | 回到 v1.3；完整 suffix 展開全部球色，只有各分支都合法、必成且滿品質完工才縮減比較。品質已滿時也檢查多步進展；固定 state／transition 上限，超界為 unknown。 | 未採用研究 checkpoint；1,800 cases 僅多一件滿品質，時間幾乎不變；[v1.7 結果](../reports/generic-cosmic-overnight/v170-development/results.md) |
| v1.8 | `generic-craft-route-portfolio-v1.8.0` | 回到 v1.3；以樂觀品質／進展上界剪去不可能達標的查詢或支線。只讀 mechanics、state 與剩餘步數；品質預查保持 witness，進展剪枝會改變固定預算內的路線。 | 未採用研究 checkpoint；broad 品質／交貨退步，成本不足；[v1.8 結果](../reports/generic-cosmic-overnight/v180-development/results.md) |
| v1.9 | `generic-craft-route-portfolio-v1.9.0` | 回到 v1.3，單獨依 Semantic 的五個 context 依賴合併 forecast／決選名額；不同 consumer／suffix／engine 及 Budgeted 歷史保留。 | 未採用研究 checkpoint；兩批共少完成三件且成本略增；[v1.9 結果](../reports/generic-cosmic-overnight/v190-development/results.md) |
| v1.10 | `generic-craft-route-portfolio-v1.10.0` | 依必要品質與 objective kind 分工：hard-quality／HQ 保留 v1.1，其餘一般／連續品質收藏品使用 v1.3；不讀 recipe／equipment ID 或 seed。未包含 v1.4–v1.9 未採用變動。 | 未採用研究 checkpoint；新的 101000000 確認有一般收藏品品質收益，但連續品質／交貨退步且成本超界，不交付 overnight；[結案](../reports/generic-cosmic-overnight/v1100-development/results.md) |
| v1.11 | `generic-craft-route-portfolio-v1.11.0` | Stable 與 hard-quality 精確保留 v1.1；Balanced／Aggressive 的 optional-quality 目標使用全九球色共同提案與 funded route 比較，Aggressive 非 HQ 的 endgame beam 再用 mechanics 尺度的 CP／耐久／進展 reserve／IQ／buff 資源排序。Selector 只讀 objective、risk、recipe／crafter mechanics 與 state，不讀 ID、seed 或未來 RNG；不增加 beam 預算。 | v1.12 的直接能力前身；完整 overnight 證明一般收藏品有明顯品質收益，也揭露 completion-aware 保護前的交貨交換。見 [v1.11 bounded 結果](../reports/generic-cosmic-overnight/v111-development/results.md)、[完整四表](../reports/generic-cosmic-overnight/generic-native-v111-checkpoint-vs-v110-history-64seed-20260829.md) 與 [completion-aware review](../reports/generic-cosmic-overnight/v111-completion-aware-bounded-review-20260829.md)。 |
| v1.12 | `generic-craft-route-portfolio-v1.12.0` | 將 completion-aware 實驗原樣升為正式 identity：Stable／hard-quality 沿用 v1.1；HQ／Master 也回到 v1.1；Balanced 一般收藏品保留 v1.11 九球色提案與 funded routes，當前 state 已有 bounded deterministic finish 時，只保留成功／失敗分支都仍可完工的提案，並讓 finish suffix 參與決選。Selector 只讀 objective、risk、mechanics、condition、state 與 action budget。 | 目前 Rust 採用基礎；implementation commit `44031e2`。正式支援 Balanced 一般收藏品 full run 保留 v1.11 超過 96% 的檔位／滿品質收益並改善相對 v1.1 的完成；0 illegal、0 policy-null、0 新增 action-limit。見 [採納報告](../reports/generic-cosmic-overnight/v112-adoption-review-20260829.md) 與 [完整四表](../reports/generic-cosmic-overnight/generic-native-completion-aware-vs-v110-history-64seed-20260829.md)。 |

## v1.13 球色工作排程 candidate

`generic-craft-route-portfolio-v1.13.0` 移除候選內 v1.12 依 objective／risk 回到 v1.1 的頂層路由，讓全部目標共用同一套 route portfolio；每步依 mechanics 動態提出可靠／風險作業、可靠／風險品質、混合、作業準備、品質準備與資源工作，不以 recipe／equipment ID 或技能白名單選路。球色可以中斷已投入的工作，球色工作完成後再恢復原 route；若已支付 setup 且 consumer 可用，無球色收益、無完整 funded continuation、也不會立即完工的工作不得棄置該投資。

這套策略把「現在做同一工作相對 Normal 得到多少收益」記為 `capture`，並以配方宣告的 condition mask 計算同一工作在其他球色的最佳 `reservation`。若當前特殊球已有工作能實際吃到收益，未投入、現在 `capture = 0`、卻明確保留給另一顆球的準備／資源工作會在共同決選前讓位；未來球色的 `reservation` 只作可解釋的工作錯配判斷與 dataset 診斷，不直接加減 outcome 分數，也不假裝預知 RNG。

原頂層分流曾有效，不代表 objective 應綁定版本；它間接避免昂貴 setup 被短視換路。直接把所有目標改為舊基礎路線再疊球色的 ablation，反而把完成／滿品質降到 243／162，證明 coordinated portfolio 本身保有重要勝場；目前改以「funded work ownership」直接表達原本有意義的策略因果。

相同行為先以 `generic-craft-route-portfolio-exp-condition-work-scheduler` 完成 50 families × 三風險 × E02／E09 × `balanced-iid`／`opportunity-scarce-iid` × 4 seeds 的 2,400 paired gate，fresh v1.12→candidate 為完成 1,954→1,984、滿品質 1,162→1,261、utility total 1,555.176→1,654.037；配對完成 62 勝／32 敗、滿品質 181 勝／82 敗。三風險、兩 worlds、兩裝備與四個 seeds 的 utility delta 都為正，hard-quality 完成／滿品質 59 勝／22 敗；0 illegal、0 policy-null、0 action-limit。single-recommendation p95 29.157→63.992 ms、p99 54.905→119.352 ms、max 148.371→503.552 ms，150／150 shards 在 6 分 18 秒完成且 0 timeout。一般收藏品完成 2 勝／8 敗與 HQ 0 勝／2 敗留作 full-run 明示風險。這份可解釋、跨軸且具玩家價值的淨改善足以取得 v1.13 candidate 版號；但後續 Balanced-only 64-seed run 雖把總完成 27,338→27,548、滿品質 18,640→19,168，仍有 paired completion 1,046 勝／836 敗且步數廣泛增加，未守住完工契約，因此未採用並由 v1.14 取代。見 [readiness gate 四表](../reports/generic-cosmic-overnight/condition-work-readiness-gate-50f-3risk-2world-4seed-20260902.md) 與 [完整 overnight 四表](../reports/generic-cosmic-overnight/generic-native-v113-vs-v112-balanced-e02-e03-e07-e09-e10-2world-64seed-20260902.md)。

## v1.14 完工契約 candidate

`generic-craft-route-portfolio-v1.14.0` 保留 v1.13 的球色工作排程與 funded work ownership，但把彈性插隊放在一條可獨立說明的交易邊界之後：只有目前 state 已存在剩餘 action budget 內的完整完工 witness，才啟用特殊球的工作預付；否則沿用 v1.12 completion-aware route。Hard-quality 的 witness 必須同時支付 required quality 與 progress，progress-only 則支付 progress。契約付清後，每個提案仍須讓成功／失敗分支都保有完整收尾。Selector 只讀 mechanics、objective、condition、state 與 budget，不讀 recipe／equipment ID、seed、未來 RNG 或評測結果。

這不是要求球色永遠不得改路，也不是對已知敗場逐一補規則。特殊球仍可用更便宜的 CP、耐久、成功率或 potency，提前兌現目前或後續階段本來就要做的工作；完工契約只是先確保這筆預付不拿交貨能力作隱性融資。取得契約後的品質交換可以有輸有贏，再依滿品質與有意義檔位的數量判讀。

最終 50 families × Balanced × E02／E03／E07／E09／E10 × `balanced-iid`／`normal-heavy-iid` × 4 seeds gate 有 2,000 paired cases。Fresh v1.12→v1.14 完成 1,701→1,704，paired completion `3 勝／0 敗`；滿品質 1,155→1,177，`83 勝／61 敗`；utility total `+25.386063`。560 個 hard-quality cases 的完成、滿品質與 utility 逐 case相同，五套裝備及兩 worlds 都是 0 completion loss；0 illegal、0 policy-null、0 action-limit，推薦 p95 42.533 ms、max 138.133 ms。v1.14 witness 檢查與 v1.12 舊 guard 已明確隔離，v1.12 在 2,000 個交集案例的 outcome／步數／planner context 與既有 64-seed evidence 0 drift。這足以標成 v1.14 並進入完整 overnight，尚未取代 v1.12。第三臂 `artisan-expert-default@882202ce04fcd4fe405812ea24d78b660d8ff64e` 是 Artisan Expert 預設 decision tree 的固定來源移植，只提供外部效果與速度座標，不是本產品數字版本或 promotion floor。見 [v1.14 三臂 gate](../reports/generic-cosmic-overnight/v114-isolated-contract-vs-v112-vs-artisan-50f-5equipment-2world-s4.md) 與 [active brief](overnight_review_brief.md)。

## 2026-08-31 撤回的描述性實驗

`generic-craft-route-portfolio-exp-normal-route-certificate` 與 `generic-craft-route-portfolio-exp-condition-option-planning` 曾以 all-Normal continuation certificate、declared condition-set option preparation 與 Balanced Master objective extension 尋找 v1.12 之後的泛化收益。400-case bounded gate 有完成 `+1`、檔位 `+22`、滿品質 `+11`，但 337 cases 完全持平，wall time 約為 v1.12 的 4.4 倍；實際 unattended 嘗試只有 2／50 shards 完成，另有 7 次整段 30 分鐘 timeout。這兩個 identity、策略路線與候選專屬效能調整均已從 binary 移除，未升為 v1.13，也不可續跑原 run。

仍保留的研究假說只有證據，不是 runtime identity：Master objective extension 的 960 paired cases 完成 945→960，但滿品質尾端淨 `−8`；若重開必須單獨驗證。完整負面結果、ablation 與成本見 [球色資訊邊界與撤回報告](../reports/generic-cosmic-overnight/condition-information-boundary-and-option-planning-20260831.md)。

同一輪發現的資訊邊界修正屬產品正確性，沒有隨實驗撤回：v0.10–v0.17 歷史 MPC 不再接收 evaluator-private condition weights，只由 declared mask 建立等權重內部 model；recipe ID 也已移出 planning seed 與 semantic cache。修正前 v1.12 full-run 只能當舊 binary 的歷史 outcome snapshot，不能沿用成目前 binary 的 policy baseline。

## 維護規則

只有符合 [升版規則](skills/professional/development_standards.md) 的實質推進才新增數字版本列；未通過的試驗留在其研究文件，不再逐一占用版號。新版本同列記錄：

1. 相對上一版唯一新增或移除的策略能力。
2. selector 可讀取的 mechanics／objective／condition／state signal。
3. 實際改善的證據、重要代價與目前採用狀態；後續撤回則如實更新。
4. commit 與可重播 evaluation output；尚未升版的實驗由 current state 指向研究文件。

不得把 seed 數、單次勝負或暫時 tuning weight 寫成版本定義；這些是 evidence，不是 identity 語意。
