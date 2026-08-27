<!-- doc-status: archived -->

> 歷史用途：保存第六批 v0.30 跑前假說、原接受條件與交付身份，供重播及決策追溯。原文中的待辦與逐案否決規則不再指揮目前工作；2026-08-27 結案決策見文末，現行判準見 [驗證規範](../../skills/domain/algorithm_verification.md)。

# Overnight 評測交接簡報

## 文件角色

本檔是下一個結果檢視 task 的 active handoff。它固定本輪完整 overnight 的身份、假說、日間 evidence、判讀順序與撤回條件；不把 run 完成誤寫成 candidate 已採用。下一個 task 先讀 `AGENTS.md`、`operating_contract.md`、`current_state.md` 與本檔，再讀自動四表及完整 raw evidence。

## 本輪身份與核心問題

| 項目 | 本輪值 |
| --- | --- |
| Baseline | `generic-craft-condition-set-portfolio-v0.22.0` |
| Candidate | `generic-craft-specialist-resource-guard-v0.30.0` |
| 比較目的 | 檢查四個可泛化能力是否共同形成有 practical value 的提升：progress-only 品質續作、避免過早完工、hard-quality 專家資源使用、policy-null 專家恢復。 |
| 主要受益面 | progress-only 低品質提前完工；hard-quality 專家在成熟品質機會與低 CP 尾端；v0.25 shared continuation 的既有窄收益。 |
| Evidence boundary | Assumed worlds 不外推成遊戲真實成功率；native latency 與 WASM／目標裝置 latency 分開；3 workers smoke 只驗證執行路徑。 |

精確 protocol、ABI、binary hash、evaluator hash、run ID 與 workload 以本檔交付區及 runner immutable config／manifest 為準。

## Candidate 的實際改動

1. v0.25：統一 objective／risk 契約並保留 bounded shared continuation。
2. v0.26：progress-only 即將以必成進展低品質完工且耐久緊張時，使用工匠的絕技保留續作空間。
3. v0.27：hard-quality 專家可在有價值的必成品質技能前使用快速改革；base-null 時可用專心致志打開資源恢復。
4. v0.28：progress-only 未達 protected floor 且 base 將提前完工時，改選不完工的必成技能；替代後必須仍有 7 actions 內確定完工路線，90% 滿品質以上不介入。
5. v0.29：移除 v0.26→v0.28 的遞迴 wrapper，單次取得 v0.25 base 後依固定順序處理上述機會。
6. v0.30：CP 充足且掌握仍提供耐久覆蓋時，不把表面耐久 10 誤判為需要提前花快速改革的資源壓力。

所有選擇只讀 mechanics、objective、condition、crafter capability、state、planner context 與 action preview，不讀 recipe／equipment ID 或 future RNG。

## Base 結構與下一個里程碑

base 是 condition-set router、`BudgetedCondition` ordered rule engine、Rust `Semantic Port` ordered rule engine，以及 budgeted branch 回 null 後的 bounded shared continuation。

### 尚未實作的 route-aware candidate proposal

本節是下一輪 Rust 重構的交接設計，不是 v0.30 現況或已生效的共通 solver contract。實作、parity 與量測通過後，才同步 `solver_policy_and_safety.md`、`algorithm_verification.md`、`technical_architecture.md` 與 `current_state.md`。

候選產生器不是同權投票的 selectors。Budgeted、Semantic、progress、quality、condition、resource 與 specialist modules 只提交 action 與共同證據；相同 action 先合併，多個來源只補充證據，不因票數增加而加權。單一 comparator 先套用合法性、terminal、必要品質與完工退路，再比較完整品質 utility、下行風險、資源、工序與有限 continuation。

比較器上方需要保留跨步 route intent，初始至少能表達：進展準備、品質累積、爆發準備、爆發執行、收尾與恢復。Route intent 記錄進入／退出條件、已投入 setup、預期 consumer 與切換原因；它提供比較脈絡，不把其他階段的技能改成 illegal。原路線仍有效時，替代方案必須在計入放棄 buff、資源、完工退路與額外工序後仍有實質優勢，才正式切換。

Condition／specialist 機會要區分暫時 interrupt 與正式 route 切換。暫時插入後若原路線仍有效，應返回先前 intent；玩家偏離、forced outcome 或原路線失效時，才依實際 state 重建。Teamcraft、既有 guide 與常見玩家階段只作初始 route hypotheses，由跨 family／裝備／risk／world 的 paired evidence 決定保留或改寫。

實施順序固定為：

1. Shadow 收集 candidates、route intent 與 evidence，但仍回傳 v0.30 action，要求 deterministic exact parity。
2. 把現有行為映射成 route intent，記錄切換、暫時 interrupt、返回與 setup 放棄，不改 action。
3. 分批把兩個 base engines 與各領域 ordered rules 改成 producers；每批保留 overlap telemetry 與 holdout gate。
4. 相同 action 合併後，先用 constraints／dominance 淘汰明顯劣勢，只讓少數候選進入 bounded continuation。
5. 新 comparator 通過 outcome、route continuity 與 latency gate 後，刪除舊 ordered Base；shadow／雙路徑不是永久相容層。

新增量尺至少包括每場 route 切換數、相鄰來回切換、暫時 interrupt 返回率、已建立 buff／setup 的無效放棄、產生／合併／深入比較的候選數、展開狀態數，以及 native／未來 WASM p50／p95／p99／max。新增 latency 要和 completion、品質 utility、worst-cell 與工序長度改善一起判斷；只證明仍低於 3 秒不足以採用。

## 跑前 bounded evidence

### Wrapper 攤平 parity

v0.29 對 v0.28 在 50 families × E02／E09／E10 × Balanced-IID × 4 seeds 的 600 paired cases 中，completion、stop reason、final state、objective utility、技能數、推進工序數、recommendation calls 與 planner context 全部逐案相同。攤平沒有改寫策略結果。

### 外樣本反例與修正

初版 v0.29 在 Normal-heavy Stable 的 recipe 37005／E10 暴露 `completed+qualityMax -> policy-null`。因果是表面耐久 10 但尚有 6 回合掌握，快速改革被過早插入並改變後續 route。v0.30 用 buff／resource signal 修正；精準案例恢復為 v0.25 的滿品質完成，原專家收益案例 36990 仍由 policy-null 改善為滿品質完成。沒有 recipe-ID patch。

### 10 裝備廣篩

Behaviorally-final v0.30 對 v0.25 覆蓋 50 families × 10 equipment × Balanced-IID／Normal-heavy × 2 seeds。每種 risk 2,000 paired cases，共 6,000 pairs：

| Risk | Utility mean delta | Completion win/loss | 滿品質 win/loss | Candidate failed／action-limit |
| --- | ---: | ---: | ---: | ---: |
| Stable | +0.002478（+0.248 個百分點） | +1/-0 | +3/-0 | 0／0 |
| Balanced | +0.005045（+0.505 個百分點） | +2/-0 | +4/-0 | 4／0，與 baseline 相同 |
| Aggressive | +0.005837（+0.584 個百分點） | +2/-0 | +6/-0 | 2／0，與 baseline 相同 |

完成案例的技能數長度：Stable mean 27.92→28.10、p95 40→40、max 51→51；Balanced mean 28.33→28.60、p95 40→40、max 74→74；Aggressive mean 28.49→28.85、p95 40→41、max 74→74。這是觀察量尺，不是任務倒數 gate。

原始日間 outputs：

- `.tmp/v030-v025-wide-stable.json`，SHA-256 `021368ddc7fd9a53b75a9276996c83fd8bb303b01c81802aca662d1a180184a9`
- `.tmp/v030-v025-wide-balanced.json`，SHA-256 `ddef2409f8bb2e6bfd925ee88fb0805063cfb8e27af76ea44c42f45540d23b02`
- `.tmp/v030-v025-wide-aggressive.json`，SHA-256 `a8671e0ecfa988ccbd8286e71c4950aa13468e12e743771b735e980149f75771`

`.tmp` 是本機 development evidence，不是最終 Git 報告。這組結果通過事前 gate：Balanced／Aggressive 至少 +0.5 個百分點，其他 risk 不退化，且沒有新增 completion／滿品質 loss、illegal、failed 或 action-limit。

## 四表與完整 evidence 閱讀順序

自動四表固定是 Balanced × `balanced-iid` × E02／E09 的入口，不是完整結論：

1. 先看 completion、illegal、terminal failure、policy-null、action-limit。任何 candidate-only 確定失敗或 action-limit 都回 raw row看因果。
2. hard-quality 只承認 `qualityMax` 與完工退路；較高但未滿的品質不能冒充成功。
3. 一般收藏品分開看 100／300／700／滿品質；Master 看連續品質；HQ 看完整 HQ chance 與 50%／75%／100% protected floors。
4. 把差異切成 family × equipment × risk × world。特別檢查 v0.26／v0.28 的 progress-only hit、v0.27／v0.30 的 specialist hit 與非 hit cells。
5. 分開看全部技能數與推進工序數的完成／未完成 p50／p90／p95／max；確認沒有以接近 80 actions 的長尾換取少量平均品質。
6. 最後看 latency、timeout 與 worker throughput；它們不證明溫度安全，也不改寫策略效果。

## 接受與撤回條件

| 判斷 | 條件 |
| --- | --- |
| 可考慮採用 | 沒有新增 illegal／確定失敗；completion 與 hard-quality 滿品質沒有有意義 regression；progress-only 與 specialist uplift 能跨多個 families／equipment／world 重現；policy-null 下降沒有被 action-limit／timeout 抵銷。 |
| 繼續策略迭代 | 總體上升但有可泛化的 worst-cell regression，或 uplift 只集中在單一 family／equipment；下一步先做共同 candidate scorer，不增加串接 override。 |
| 撤回 candidate | 以更多確定失敗、action-limit、illegal 或 hard-quality paired loss 換平均品質；uplift 只靠事後挑選 recipe ID／seed；或完整矩陣無法重現 bounded 假說。 |

Stable／Balanced／Aggressive 都持續貪婪追求更高品質；差別只在保護退路與承擔下行風險，不把較低品質視為任務已滿足。

## 交付身份與三核心 smoke

| 項目 | 已驗證值 |
| --- | --- |
| Protocol／ABI | `native-generic-episode-batch-v6`／`native-generic-closed-loop-abi-v6` |
| Native report schema | `native-generic-cosmic-paired-matrix-v3` |
| Release binary SHA-256 | `37d760814c8b42a3be5c9be7ea2ff563567655d64fd0a2fe8d0a5a3d8829f41f` |
| Evaluator bundle SHA-256 | `116ad0cc0701b551ef4c63e179daf9d4bf66d11dd55372e5201fa668977e2edb` |
| Smoke config fingerprint | `a66114857767057efc8cabbd4dee25fa01030ff47ebba1cb8b0f6d62cb6c32e4` |
| Smoke 結果 | 3 workers、3/3 shards、120 episodes、0 failed；同命令續跑為 0 attempts，`status-only` 未啟動 worker。 |
| Smoke manifest | `evaluation-runs/generic-cosmic-overnight-native-smoke/v030-v022-3w-smoke-20260826/manifest.json` |
| Implementation checkpoint | `59988e2` |
| Evaluator／四表 checkpoint | `f44c333` |

Smoke 只證明三個 worker 的執行、驗證、atomic persistence、resume 與 status path；它不證明一小時持續負載的溫度安全。

## 已完成的完整 overnight

| 項目 | Manifest 真值 |
| --- | --- |
| Run ID | `generic-native-v030-vs-v022-64seed-w3-20260826` |
| Config fingerprint | `68c9da5b930b43d8c6976487a91fb1ea35d766ef1d77b210ce8a801a95c29ca3` |
| Workload | 50 families × 3 risk × 10 equipment × 4 assumed worlds × 64 seeds = 384,000 paired cases／768,000 solver-arm episodes |
| 完整性 | 150/150 shards、384,000 paired cases、0 failed shards |
| 實際 workers | 4；run ID 的 `w3` 只是原始名稱，不是 scheduling truth |
| 完成 invocation | 3,422,101ms（約 57 分 02 秒）；這不是整段跨 invocation 的總 wall clock |
| Attempts | 153；同一 family 的 Stable／Balanced／Aggressive 各有一次 `interrupted` 後成功續跑 |
| Raw evidence | `evaluation-runs/generic-cosmic-overnight-native/generic-native-v030-vs-v022-64seed-w3-20260826/` |
| 自動四表 | `reports/generic-cosmic-overnight/generic-native-v030-vs-v022-64seed-w3-20260826.md` |

Run 已完成，但本檔不先寫採用結論。下一個結果 task 仍依前述閱讀順序與接受／撤回條件檢查完整 raw evidence，而不是只讀四表。

只檢查已保存狀態，不啟動 episode：

~~~powershell
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=native/craft-kernel/target/release/craft-kernel-generic-episode.exe --native-baseline-solver=generic-craft-condition-set-portfolio-v0.22.0 --native-candidate-solver=generic-craft-specialist-resource-guard-v0.30.0 --risk=all --seed-count=64 --base-seed=20260824 --workers=4 --time-budget=2.5h --shard-timeout=30m --retries=2 --output=evaluation-runs/generic-cosmic-overnight-native --run-id=generic-native-v030-vs-v022-64seed-w3-20260826 --status-only
~~~

## 2026-08-27 結案摘要

第六批已完成完整性核對、結果分析與有限因果重播。使用者接受 v0.30 為有足夠改善幅度、仍有局部小幅缺陷的下一階段參考 baseline，接下來嘗試求解器基礎架構改動；這不是 Web 採用或正式發布批准。

原 brief 的逐 seed 零損失／paired-loss veto 由先前 agent 制定，並非使用者要求。使用者在結果討論後明確修正這項取捨：正確性仍嚴格檢查，純結構搬移另驗一致性，有意策略改變允許個別勝負交換，依機率效果、重要切片、成本及不確定性判斷。這是事後明示的決策更正，不聲稱 v0.30 通過原先零損失門檻，也不把已看過的資料當成新保留集。

完整數字、收益與損失因果見 [結果分析](../../../reports/generic-cosmic-overnight/v030-review-20260827/review.md)。新架構設計已移至 [目前 roadmap](../../roadmaps/broad_solver_implementation_plan.md)；[active brief](../../overnight_review_brief.md) 只保留下一輪交接入口。
