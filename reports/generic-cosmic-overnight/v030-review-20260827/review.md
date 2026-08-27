# 第六批 v0.30 徹夜結果分析

分析日期：2026-08-27。Comparison：v0.30 對 v0.22；實作 checkpoint `59988e2`，分析開始時 checkout `f0ef30e`。

## 結論

**0.30 已完成第六批檢測與分析，在專注區域有足夠改善幅度，仍保留局部小幅缺陷；使用者於 2026-08-27 接受它作為下一階段求解器架構研究的參考 baseline。**

完整 384,000 pairs 中，完成 `+276/-12`、滿品質 `+518/-14`；淨增 264 次完成、504 次滿品質，品質效用平均增加 0.291 個百分點。最明顯的收益是低品質提前完工的改善，以及專家 hard-quality 的品質機會。已知損失與長尾成本保留在下方診斷，供後續可泛化的改善使用。

專家 hard-quality 的 21,504 pairs 有 `235/9` 次完成 win/loss，樣本完成率由 30.683% 升至 31.734%（+1.051 pp）。全部 hard-quality 的 1,680 個 family × equipment × risk × world cells 中，140 格完成率上升、1,540 格持平、0 格下降；含有那 9 次個別損失的 8 格也都持平或上升。這支持接受本輪取捨，不等於已證明每個未來情境或自然遊戲分布都改善。

下一步依 [roadmap](../../../.agents/roadmaps/broad_solver_implementation_plan.md) 嘗試基礎架構改動，保留 0.30 能力與離線證據。收益和反例都可重播；已知損失的逐案修補不是開始新架構的前置門檻。[風險評估](migration-risk-assessment.md) 說明如何分開驗收結構搬移與新策略。本次決定的是研究 baseline；Web 採用與正式發布另行驗證。

## 1. 找到並核對了哪些文件

| 文件 | 本次用途 |
| --- | --- |
| [第六批原始 brief](../../../.agents/archive/handoffs/overnight-v030-review-2026-08-27.md) | 看結果之前固定的改動假說、受益面、讀表順序及原接受條件；文末另記結案更正 |
| [solver_version_history.md](../../../.agents/solver_version_history.md) | 分清 v0.24–v0.30 各自改了什麼 |
| [roadmap](../../../.agents/roadmaps/broad_solver_implementation_plan.md) | 新 candidate portfolio 的實施順序與停止條件 |
| [current_state.md](../../../.agents/current_state.md) | 當時 baseline／candidate、執行狀態與產品邊界 |
| [generic_solver.rs](../../../native/craft-kernel/src/generic_solver.rs) | 驗證護欄、專家機會、進展 bank、共用續作及 context 的實際實作 |
| [ts_migration_port.rs](../../../native/craft-kernel/src/ts_migration_port.rs) | 核對 Rust Semantic Port 的順序規則、資源計數與有限搜尋依賴 |

**版本歸因限制：** 完整 run 是 v0.22→v0.30，包含共用續作、objective 和 v0.26–v0.28 的能力，不是只測 v0.30 最後那一行資源修正。以下用有限版本重播定位代表案例的起始版本；沒有宣稱取得各模組在完整矩陣中的獨立因果效果。

## 2. 先看合理裝備的固定切片

以下維持既定入口：Balanced × `balanced-iid`，每格 64 seeds。E02 是玩家 720＋690 滿鑲嵌食藥非專家；E09 是 i750 五鑲嵌食藥非專家。Candidate 在前，括號是 Candidate−Baseline 的百分點差。

完整 50 families 的固定四表見 [自動四表](../generic-native-v030-vs-v022-64seed-w3-20260826.md)。本次重新生成後與原檔逐字相同。

| 受益／問題家族 | 量尺 | E02 | E09 |
| --- | --- | --- | --- |
| F02 室外活動用的木炭 | 700 分檔達成率 | 90.6% (+17.2) | 79.7% (+21.9) |
| F02 室外活動用的木炭 | 滿品質率 | 34.4% (+12.5) | 57.8% (+20.3) |
| F37 護盾板材的方形貨板 | 700 分檔達成率 | 28.1% (+6.3) | 56.3% (+17.2) |
| F37 護盾板材的方形貨板 | 100／300 分檔達成率 | 各 100.0% (0.0) | 各 100.0% (+32.8) |
| F29 宇宙素材的室內燈 | 700 分檔達成率 | 62.5% (+3.1) | 93.8% (+7.8) |
| F35 強化素材組合C | hard-quality 完成率 | 73.4% (+3.1) | 87.5% (+1.6) |
| F19 宇宙探索用的生物燃料 | hard-quality 完成率 | 21.9% (+1.6) | 48.4% (+1.6) |
| F36 宇宙素材的樹脂球 | hard-quality 完成率 | 4.7% (0.0) | 21.9% (+1.6) |
| F46 俄匊斯生物焦炭 | hard-quality 完成率 | 0.0% (0.0) | 0.0% (0.0) |

固定切片中，一般配方沒有新增交貨損失；hard-quality E02 增加 4/896 次完成，E09 增加 3/896 次。這也顯示專家改動不能從四表單獨判斷：E02／E09 都不是專家。

合理 E09 下 F41 仍為 53.1%、F45 64.1%、F19 48.4%、F36 21.9%，F46 仍無完成樣本。這些是模型內當前策略效果，不能據此宣稱裝備理論上無法成功。

## 3. 四項假說實際成立到哪裡

| 原先專注區域 | 本次結果 | 判讀 |
| --- | --- | --- |
| v0.26 低耐久、低品質提前完工護欄 | F02 E09／Balanced／balanced-iid／s0：v0.25 品質 4,343、5 actions；v0.26 起品質 15,317、22 actions，仍完成 | 有明確因果範例與跨切片品質收益，但護欄缺乏完整後續保證，F44 出現交貨損失 |
| v0.28 避免過早完工的進展 bank | F37 同切片／s1：v0.25–v0.27 品質 1,020、5 actions；v0.28 起品質 15,895、22 actions | 明確避免低品質收工；也會改變後續路線，另有 5 次 progress-only 滿品質退步 |
| v0.27／v0.30 專家品質資源 | 專家 hard-quality `+235/-9` 完成，淨增 226；F28 範例由無建議轉滿品質 | 收益跨全部 14 個 hard-quality families、兩種專家裝備及三種有機會球色的 worlds；9 次損失也都出自這個區域 |
| base-null 專家恢復 | hard-quality 專家 policy-null 淨減 232；重播可看到恢復續作，也有恢復後仍失敗的路線 | 整體恢復有改善，但 raw run 沒有模組命中紀錄，不能把淨減 232 全算成專心致志的獨立貢獻 |

非專家 hard-quality 額外得到 `+41/-0` 完成，全部在 Balanced-IID，來自既有共用續作區域；其他三種 worlds 的這個切片沒有完成收益。F36 E09／Balanced／balanced-iid／s2 在 v0.25 已能用 79 actions 滿品質完成，v0.30 保留它；這不是 v0.30 專家修正的新能力。

一般配方的品質效用淨增中，**67.1% 集中在 F02 和 F37**。其餘家族仍有收益，但不能把兩個大受益家族的幅度外推給全部配方。全矩陣 6,000 cells 中，1,386 格平均效用上升、25 格下降、4,589 格持平；有平均上升的格內仍可能包含個別損失。

### 一般收藏品、HQ 與 Master 分開看

| 類型 | Pairs | 完成 win/loss | 滿品質 win/loss | 平均品質效用差 |
| --- | ---: | ---: | ---: | ---: |
| 31 個一般收藏品 families | 238,080 | 0/3 | 223/3 | +0.339 pp |
| 2 個 HQ families | 15,360 | 0/0 | 7/2 | +0.170 pp |
| 3 個 Master families | 23,040 | 0/0 | 12/0 | +0.078 pp |

一般配方合計有 4,852 次品質效用上升、99 次下降，滿品質淨增 237；不是只有交貨率好看。HQ／Master 的提升遠小於兩個提前完工大受益家族。HQ 的完整機率與 50／75／100% 檔位，以及收藏品各門檻計數保存在 cells／metrics；不把它們套成同一種「700 分」。

## 4. 專家收益與風險切片

E03 是玩家食藥專家，E10 是 i750 五鑲嵌食藥專家；兩者面板不同，不能把兩個裝備的差別當成單獨的專家技能消融。

| Hard-quality 裝備範圍 | Pairs | 完成 win/loss | 完成率淨差 |
| --- | ---: | ---: | ---: |
| E03 | 10,752 | 124/9 | +1.070 pp |
| E10 | 10,752 | 111/0 | +1.032 pp |
| 全部非專家裝備 | 86,016 | 41/0 | +0.048 pp |

| 專家 hard-quality 的 world | Pairs | 完成 win/loss | 完成率淨差 |
| --- | ---: | ---: | ---: |
| balanced-iid | 5,376 | 131/2 | +2.400 pp |
| normal-heavy-iid | 5,376 | 90/7 | +1.544 pp |
| opportunity-scarce-iid | 5,376 | 14/0 | +0.260 pp |
| all-normal | 5,376 | 0/0 | 0.000 pp |

專家 hard-quality 的 Stable／Balanced／Aggressive 分別為 `83/3`、`78/3`、`74/3` 完成 win/loss，三者皆淨正。Normal-heavy 與 E03 保留為後續交互作用診斷的重點。

最顯著的 hard-quality 家族收益是 F28 `+57/-0`，其次 F35 `+35/-0`、F19 `+25/-0`。同時列出含損失的 families：F18 `+22/-2`、F33 `+23/-3`、F36 `+19/-2`、F45 `+18/-2`。E03 合計 `+124/-9`，九次損失所在的 8 個 cells 樣本完成率也皆持平或上升；本次未觀察到這些切片的完成率淨下降。

全部 50 families 的完成／滿品質／效用勝負見 [逐家族索引](family-summary.md)；每一個 equipment × risk × world 的 64-pair cell 見 [cells.jsonl](cells.jsonl)。

## 5. 已知代價與因果診斷

### 5.1 九次 hard-quality 完成損失

所有案例均是 E03；s 為原 run 的 seedIndex。

| Family | World | Risk／seed | 損失數 | 版本重播定位 |
| --- | --- | --- | ---: | --- |
| F18 宇宙加工品 | normal-heavy-iid | Stable s20、s59 | 2 | v0.25／v0.26 完成；v0.27 起無建議 |
| F33 強化素材組合B | normal-heavy-iid | 三種 risk 均 s14 | 3 | v0.25／v0.26 完成；v0.27 起無建議 |
| F36 宇宙素材的樹脂球 | balanced-iid | Balanced／Aggressive s23 | 2 | v0.25／v0.26 完成；v0.27 起無建議 |
| F45 俄匊斯特級素材套裝 | normal-heavy-iid | Balanced／Aggressive s15 | 2 | v0.25／v0.26 完成；v0.27 起無建議 |

第一次 action 分歧都是插入**快速改革（Quick Innovation，`quickInnovation`）**。例如 F33 在 CP 62、耐久 25、掌握還有 9 回合且當前高品質時插入，最後從原本 19,200 滿品質完成，變成品質 18,207、進展 5,847、無建議。

v0.30 的修正只處理「CP 充足、掌握仍覆蓋低耐久」的誤判；這些反例仍符合它留下的低 CP 或沒有掌握覆蓋的條件，所以修正沒有擋住它們。**不是 v0.30 修正失效，而是 v0.27 的單步機會判斷仍未充分評估後續路線。** 插入後原 base 重新決策，也未保證沿用原先預期的品質 consumer。

### 5.2 三次一般配方交貨損失

F44 俄匊斯壓縮木材，E01、normal-heavy-iid、s22，在三種 risk 都重現。v0.25 能完成；v0.26 起轉成無建議。

分歧前剩 CP 10、耐久 5，當前高品質，原本可用**集中製作（Intensive Synthesis，`intensiveSynthesis`）**立即交貨。護欄先插入**工匠的絕技（Trained Perfection，`trainedPerfection`）**，後續 base 追品質並花光資源，最後進展停在 9,995／11,000。

這是護欄創造了追品質空間，卻沒有讓整條後續策略持續保住完工退路。品質只多了 320，成品卻沒交出去。弱裝備有壓力，但同一裝備、同一亂數基準能完成，因此不能把這個差異歸因成單純裝備不足。

### 5.3 另五次滿品質損失

F12 E08／Balanced-IID／s44（Balanced、Aggressive）、F22 E06／Normal-heavy／Aggressive s38、F24 E01／Opportunity-scarce／Aggressive s50、F29 E10／Normal-heavy／Aggressive s43。

全部仍有完成，但由滿品質降為未滿；版本重播定位為 v0.28 進展 bank。F12 的成品從 100% HQ 降為 90% HQ。這不是進展 bank 沒有價值，而是「替代後還有完工證明」只能保護完工可能性，不能保證原本的品質路線不退步。

### 5.4 增加的 terminal failure 如何解讀

全體 terminal failed 由 118 增至 126。配對拆開後是：14 次原本無建議→實際失敗，5 次原本失敗→完成，1 次原本失敗→無建議；**沒有完成→terminal failed**。

14 個新 terminal failed 都已重播，最後是**高速製作（Rapid Synthesis，`rapidSynthesis`）**失敗。它們屬原本未完成案例繼續嘗試後的失敗類別轉移，不能再多算成 14 次新交貨損失，也不能把它們說成恢復成功。是否接受這類 best-effort 成本，與前述 12 次原完成案例的 regression 是不同決策。

完整例外身份、原／候選結果保存在 [exceptions.json](exceptions.json)；版本與 trace 見 [replays.json](replays.json)。12 次完成損失其實對應 6 組 family／equipment／world／seed；同一案例在不同 risk 重現，不應當成 12 個獨立隨機證據。

## 6. 三種風險、world 與成本

| Risk | Pairs | 完成 win/loss | 滿品質 win/loss | 平均品質效用差 |
| --- | ---: | ---: | ---: | ---: |
| Stable | 128,000 | 83/4 | 110/3 | +0.164 pp |
| Balanced | 128,000 | 99/4 | 207/4 | +0.339 pp |
| Aggressive | 128,000 | 94/4 | 201/7 | +0.371 pp |

按每個 risk 的 paired-case 近似標準誤計算，描述性 95% 區間分別約為 `[+0.146,+0.181]`、`[+0.314,+0.364]`、`[+0.345,+0.396]` pp。這些區間僅描述本矩陣的樣本差異；跨 family 泛化、多重比較、群集相關與自然遊戲概率仍需各自處理，接受決策另結合重要切片及成本。

跑前 6,000 pairs 的門檻比較對象是 v0.25，只含兩個 worlds；本次比較 v0.22 並含四個 worlds。不能直接把這張表與跑前 +0.5 pp 門檻作同口徑通過／失敗判斷。不過，「跑前零 paired loss，完整 run 出現 loss」是明確的新證據。

| World | Progress-only 平均品質效用差 | Hard-quality 完成 win/loss |
| --- | ---: | ---: |
| balanced-iid | +0.734 pp | 172/2 |
| normal-heavy-iid | +0.336 pp | 90/7 |
| opportunity-scarce-iid | +0.122 pp | 14/0 |
| all-normal | +0.039 pp | 0/0 |

機會稀少時收益快速縮小。這是對假設 world 的敏感性，不是已查明的遊戲自然球色分布。

### 工序長度

表格數字為 `p50 / p90 / p95 / max`，先 Baseline，再 Candidate；A 是全部技能使用數，S 是實際推進工序。

| 類型 | 完成 A | 完成 S | 未完成 A | 未完成 S |
| --- | --- | --- | --- | --- |
| Progress-only baseline | 27/36/38/80 | 27/35/38/80 | 36/80/80/80 | 35/80/80/80 |
| Progress-only candidate | 27/36/38/80 | 27/35/38/80 | 37/80/80/80 | 36/80/80/80 |
| Hard-quality baseline | 29/37/40/70 | 29/36/39/70 | 31/40/43/80 | 31/39/43/80 |
| Hard-quality candidate | 30/37/40/79 | 29/36/39/79 | 31/41/45/80 | 31/40/44/80 |

全部完成案例平均 A 從 27.720 增至 27.885；未完成案例平均 A 從 31.625 增至 32.096。Hard-quality 的 70 actions 以上案例由 25 增至 34，一般配方維持 90。Action-limit 仍是同一批 42 案，沒有新增或消除；長尾未失控，但部分收益確實依賴很長續作。

不同版本的完成／未完成集合並不完全相同，上述條件分布差不是同一批案例的純 paired 長度變化。它們也不能換算成真實任務是否來得及。

### 資源與延遲

Hard-quality 全部終局／停止案例的平均剩餘 CP 由 23.19 降至 19.18、耐久由 6.87 降至 6.70；progress-only 剩餘 CP 由 45.50 降至 43.19。它更願意花資源，是否花得有用要看上面的完成／品質結果，不能只用餘量判優劣。

Candidate 共 11,184,896 次推薦，單步加權平均約 0.612ms、觀察到的單步 max 56.266ms；Baseline 約 0.630ms、max 65.058ms。這是競爭 worker 的 native throughput run，不能據小幅差值宣稱演算法變快。Raw rows 只有每 episode 的總時間與最大值，**無法還原真正的單步 p50／p95／p99**；更不是 WASM／手機驗證。

## 7. 評測結案與決策

2026-08-27，使用者在看過結果後明確選擇：接受 0.30 的實質收益與局部代價，以它作為架構研究 baseline，接下來嘗試新架構。

| 檢查面向 | 結案判讀 |
| --- | --- |
| 目標能力的實際收益 | 多 family／equipment／world 的品質與恢復改善成立；幅度集中，all-normal hard-quality 持平 |
| 專家 hard-quality | 235 次改善、9 次損失，淨增 226 次完成；本次重要切片檢查支持接受取捨 |
| 已知局部代價 | 保留 12 次完成損失、另 5 次一般配方滿品質損失及長尾，作後續診斷；未宣稱它們不可避免 |
| 合法性與 action-limit | 兩臂 illegal 皆 0；action-limit 仍為同一批 42 案 |
| Terminal failure | 增量來自原未完成案例的失敗類別轉移；和成功機率及製作成本一起分析 |
| 版本用途 | 第六批已結案；0.30 成為下一階段研究參考，Web 與正式發布保持各自的驗收 |

原始跑前 brief 的逐案零損失／paired-loss veto 是先前 agent 制定的規則，並非使用者要求；本報告最初據此拒絕升格的結論已由上述決策取代。原條件完整保存在 [歷史 handoff](../../../.agents/archive/handoffs/overnight-v030-review-2026-08-27.md)，現行標準由 [algorithm_verification.md](../../../.agents/skills/domain/algorithm_verification.md) 擁有。這是使用者看過 evidence 後對產品取捨的明確修正，不改寫跑前標準，也不把同一資料當成新的保留集驗證。

## 8. 資料完整性、重算與限制

本次直接讀取 [原始 run](../../../evaluation-runs/generic-cosmic-overnight-native/generic-native-v030-vs-v022-64seed-w3-20260826)：

- 150/150 completed shards，384,000 pairs／768,000 arm rows，6,000 個各 64 seeds 的完整 cells。
- 驗證 config fingerprint、每個 report content fingerprint、binary SHA-256、ABI、evaluator bundle SHA-256、solver identity、case pairing、paired seed 與 axes；兩臂 objective metadata 相同。
- 重新彙整勝負，與 native reports 的 pairedComparison 合計交叉核對；自動四表重算逐字相同。
- Manifest 為 0 failed shards；實際完成 invocation 使用 4 workers，run ID 的 `w3` 不是實際 worker truth。
- 完成 invocation 約 57 分 02 秒，153 attempts 中有 3 次 interrupted 後續跑；不是 153 個獨立 shards，也不是全程跨 invocation 的總時間。
- 本次沒有啟動新的 overnight、修改原 run、build 新 binary 或改 solver。診斷重播使用保存的 binary，只跑 37 個選定案例、304 arm episodes；這些是因果追查，不是新的無偏效果估計。

| Identity | 已核對值 |
| --- | --- |
| Config | `68c9da5b930b43d8c6976487a91fb1ea35d766ef1d77b210ce8a801a95c29ca3` |
| Binary | `37d760814c8b42a3be5c9be7ea2ff563567655d64fd0a2fe8d0a5a3d8829f41f` |
| Evaluator bundle | `116ad0cc0701b551ef4c63e179daf9d4bf66d11dd55372e5201fa668977e2edb` |
| ABI／protocol | `native-generic-closed-loop-abi-v6`／`native-generic-episode-batch-v6` |

從 repository root 重算已保存資料，不啟動 solver episodes：

```powershell
node reports/generic-cosmic-overnight/v030-review-20260827/analyze.mjs
```

需要重播本次有限診斷案例時才執行；單一 process、每次子命令 30 秒上限，使用 `.tmp/v030-review-replays` 快取，重用前核對 solver／binary handshake／paired seed 及原非 timing 輸出：

```powershell
node reports/generic-cosmic-overnight/v030-review-20260827/replay.mjs
```

重播用 `originalBaseSeed XOR originalSeedIndex` 搭配 sample 0 還原同一 pairedSeed，因此重播 caseId 的 base/sample 字樣與原始不同；原身份另行保存，不把新 caseId 當作原始 cell。

`metrics.json` 是分組統計；`cells.jsonl` 一行一個完整切片；`exceptions.json` 保存全部 108 次品質效用下降及 14 次新增 terminal failed；`gain-examples.json` 是方便選取代表重播的例子，**不是完整命中清單**。原 run 沒有逐步 trace 或 selector telemetry，所以無法直接報完整矩陣的 v0.26／v0.28／v0.27 各自命中率、模組重疊率與非命中區回歸率。

所有成功率都只適用於這批 synthetic assumed worlds。機制真實性、自然球色概率、遊戲內任務時限、目標裝置 latency 和持續溫度安全，不在本次資料分析的已驗證範圍。

原分析階段已通過文件檢查、既有 overnight validator／overview 共 17 tests；兩個分析腳本通過 Node 語法檢查並實際執行。37 個診斷案例共 304 solver-arm episodes 與原兩臂的非 timing 輸出對上。後續結案更新只整理 Markdown 文件，solver／Web、分析腳本與原始 evidence 維持原樣；沒有 commit 或 push。
