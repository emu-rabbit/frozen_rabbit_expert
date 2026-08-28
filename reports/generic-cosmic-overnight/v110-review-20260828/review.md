# v1.1 Overnight 結果與下一步改進盤點

日期：2026-08-28。比較 v1.1 candidate 與 v0.30 baseline；本報告是研究建議，尚未替使用者決定升格 baseline 或 Web 採用。

## 結論

**v1.1 值得繼續作為改進底座。** 事前主要切面的三項量尺都守住約定下界，必要品質與交付品質效用達到值得延續的點估計幅度；本機 native 延遲也有餘裕。現階段最值得投入的是收尾路線的風險估計與保留、無效資源消耗，以及接近同分時的換路線判斷。

這不等於全部配方已足夠可靠：F36／F46 的必要品質能力仍薄弱，HQ 切片有品質與交貨雙重代價；主要交貨差的區間下緣也只略高於容忍線。共同 benchmark 已多次參與研究，下一次採用判斷仍需要真正不重疊的保留集。

## 1. 本輪身份與資料完整性

- 最新完整 run：`generic-native-v110-perf-vs-v030-64seed-20260827`。
- Baseline：`generic-craft-specialist-resource-guard-v0.30.0`；candidate：`generic-craft-route-portfolio-v1.1.0`。
- 50 families × 10 equipment × 3 risk × 4 assumed worlds × 64 seeds，150/150 completed shards、384,000 pairs、768,000 arm rows、6,000 cells；每格確實有 64 pairs。
- Config fingerprint：`1b763eca4b7c77a5b893c8f81769e43bf817eda312b90452c0d76ec5cd4f4a3e`。
- Binary SHA-256：`9cb804d6ac4d392bfb2da0013163dc70516eb9d8ea5a50de935b0760981b1ec6`；protocol／ABI v7、paired report v4。
- 已驗證 config hash、manifest、封存 binary、evaluator bundle、兩臂 row identity、paired seeds、完成契約與逐次 timing 樣本。既有四表重算後逐字相同，沒有改寫它。
- 原始 overnight 沒保存 trace；以下逐步證據來自同一封存 binary 的 bounded replay：21 pairs／42 episodes，兩臂 11 個非計時欄位全部對回原始資料。另有 8 個 observer episodes，終局與完整技能序列均對齊 replay。
- 全矩陣 candidate：0 illegal、0 policy-null、9 action-limit。9 件 action-limit 全為必要品質家族：F19 三件、F36 六件；其中 F36／E10／Balanced 與 Aggressive／seed index 54 是 baseline 完成、candidate 觸限。

所有結果均是合成裝備與假設球色模型下的 benchmark，不是遊戲自然成功率。缺少熱校準不影響上述結果身份，但不能據此宣稱任何 worker 配置的長時間硬體安全性。

## 2. 先看固定四表切面

完整 50-family 四表見 [自動四表](../generic-native-v110-perf-vs-v030-64seed-20260827.md)。固定為 Balanced × balanced-iid，每格 64 seeds：

- E02：作業 5,408／加工 5,237／CP 749，720＋690 滿鑲嵌食藥非專家。
- E09：作業 5,811／加工 5,500／CP 776，i750 五鑲嵌食藥非專家。
- 表格以 candidate 為主，括號是 candidate−baseline；pp 是百分點。U 是 0–1 的交付品質效用，未交貨算零，不只取完成品平均。

| 主要量尺 | E02 | E09 | 兩組等權合併 | 合併差的 95% 配對群集區間 |
| --- | --- | --- | --- | --- |
| 必要品質完成率 | 59.82% (+4.58 pp) | 73.77% (+3.46 pp) | 66.80% (+4.02 pp) | +1.23 ～ +6.81 pp |
| Progress-only 交貨率 | 99.74% (−0.22 pp) | 99.83% (−0.17 pp) | 99.78% (−0.20 pp) | −0.477 ～ 0.000 pp |
| Progress-only 平均 U | 0.8575 (+0.0201) | 0.8917 (+0.0140) | 0.8746 (+0.0171) | +0.0094 ～ +0.0259 |

必要品質為 1,197/1,792 完成，配對勝／負 175／103；progress-only 為 4,598/4,608 交貨，配對勝／負 1／10。不能把後者的九件淨交貨損失藏在前者的收益裡。

事前 brief 的下界依序為 −2 pp、−0.5 pp、−0.01；值得延續的幅度為必要品質 +2 pp 或 U +0.01。**本輪符合「值得延續研究」的界線**；交貨區間貼近 −0.5 pp，證據不支持宣稱完全沒有交貨代價。

區間依 brief 使用 family 外層、seed index 內層的兩階段配對 bootstrap，保留同 seed 的 E02／E09 區塊；seed 1101、2,000 次、mulberry32。此處只有預先指定的 Balanced／balanced-iid，因此不另混入 risk／world。其他格的比較屬探索性診斷，沒有作多重比較後的顯著性宣稱。

### 必要品質：收益不是最難家族都解決了

| Family／配方 | E02 完成率 | E09 完成率 | 解讀 |
| --- | --- | --- | --- |
| F28 輕量樹脂纖維 | 50.0% (+4.7 pp) | 76.6% (+17.2 pp) | 主要收益之一，仍有明顯失敗 |
| F35 強化素材組合C | 89.1% (+15.6 pp) | 87.5% (0.0 pp) | E02 改善；E09 不是同幅提升 |
| F33 強化素材組合B | 67.2% (−4.7 pp) | 87.5% (−1.6 pp) | 合理球色下局部退步，應看換路線證據 |
| F19 宇宙探索用的生物燃料 | 29.7% (+7.8 pp) | 56.3% (+7.8 pp) | 已改善，絕對完成率仍不足 |
| F41 俄匊斯基礎素材套裝 | 26.6% (+9.4 pp) | 51.6% (−1.6 pp) | 品質／作業資源分配仍不穩 |
| F45 俄匊斯特級素材套裝 | 40.6% (+12.5 pp) | 67.2% (+3.1 pp) | 尚有較大可用改善空間 |
| F36 宇宙素材的樹脂球 | 4.7% (0.0 pp) | 20.3% (−1.6 pp) | 最難層仍未突破 |
| F46 俄匊斯生物焦炭 | 0.0% (0.0 pp) | 1.6% (+1.6 pp) | 不能視為已具可靠能力 |

以上每格只有 64 seeds，一件約 1.56 pp；小幅正負不能直接當作穩定機率差。全部 14 個 hard-quality 家族在混合全軸索引中均淨改善，但這不會抹去表中的局部退步。

### 一般收藏品、HQ、Master 分開看

| 類型 | 交貨率 | 平均 U | 滿品質率 |
| --- | --- | --- | --- |
| 31 個一般收藏品 | 99.80% (−0.18 pp) | 0.8689 (+0.0183) | 67.77% (+3.83 pp) |
| 2 個 HQ 家族 | 99.22% (−0.78 pp) | 0.9211 (−0.0093) | 71.48% (−3.13 pp) |
| 3 個 Master 家族 | 100.00% (0.00 pp) | 0.9027 (+0.0220) | 49.48% (+7.29 pp) |

- 一般收藏品收益涵蓋多個家族，但 EX+ 高檔品質仍弱。例如 F17／E09 的 700 分檔僅 9.4%，F42／E09 僅 4.7%；100% 附近的交貨率不能代表高價值成果可靠。
- HQ 不能被一般收藏品的收益沖淡。F12／E02 交貨 62/64（−2 件）、完成品平均 HQ 機率 83.9%（−2.2 pp），把失敗也算零後 U 下降 0.0480；F13／E09 的完成品平均 HQ 機率也下降 1.3 pp。
- F50 的滿品質收益很強：E02 +23.4 pp、E09 +21.9 pp。F49 的滿品質卻下降 7.8／3.1 pp，但平均收藏價值增加 29／3；這是分布改變，不能只用滿品質一項判定全面退步。

## 3. 全矩陣如何改變結論

完整資料入口：

- [50 家族逐一展開 E02／E09 × risk × world](family-details.md)：600 列，包含完成、交付 U、滿品質。
- [跨 risk／world 與全部裝備切片](slices.md)：各 world 分列，附 E01–E10 映射。
- [逐家族索引](family-summary.md) 與 [全部 6,000 cells](cells.jsonl)：前者僅供定位，不能替代後者。

### 球色與風險

以下為 Balanced、10 裝備等權的索引；不是玩家分布：

| World | 必要品質完成率 | Progress-only 交貨率 | Progress-only U 差 |
| --- | --- | --- | --- |
| balanced-iid | 42.57% (+3.54 pp) | 99.58% (−0.34 pp) | +0.0211 |
| normal-heavy-iid | 20.04% (+2.54 pp) | 99.69% (−0.22 pp) | +0.0184 |
| opportunity-scarce-iid | 4.74% (+0.56 pp) | 99.93% (−0.03 pp) | +0.0114 |
| all-normal | 1.77% (+0.11 pp) | 99.98% (+0.01 pp) | +0.0058 |

- 機會球色減少後，hard-quality 絕對完成率急降。F36 在 opportunity-scarce／all-normal 各 0/1,920；F46 除 balanced-iid 的 17/1,920 外，其餘三個 world 各 0/1,920。這表示目前能力高度依賴機會，**沒有證明裝備或模型理論上不可能完成**。
- balanced-iid 下，Stable／Balanced／Aggressive 的 hard-quality 淨提升分別 +3.19／+3.54／+4.16 pp；一般交貨卻分別 −0.25／−0.34／−0.23 pp。退步並非只發生在 Aggressive，因此不適合只調整 Aggressive 權重。
- 全部 progress-only 有 127 次救回、446 次新失敗，淨少交貨 319 件；U 仍 +0.0151。這是一個跨家族的少量風險代價，不是單一 HQ 配方特例。

### 裝備與局部弱格

- 弱裝備不能省略：E04／E06 在全部 risk／world 中的 hard-quality 完成率分別只有 1.12%／1.98%；E09／E10 為 33.69%／39.96%。這些不同能力的裝備不能混成玩家預期成功率。
- E02／E09 的所有 family × risk × world 格，沒有觸及 brief 的淨完成 −25 pp 或 U −0.10 優先診斷線；但這是「大幅退步」觸發線，並不表示較小代價不必處理。
- 主要裝備最差完成變化是 F18／E02／Stable／balanced-iid 與 F28／E09／Aggressive／normal-heavy-iid，各 −6.25 pp。
- 專家裝備也有局部損失：F16／E03／Balanced／balanced-iid、F28／E03／Aggressive／balanced-iid、F43／E03／Balanced／normal-heavy-iid，各 −7.81 pp。此處是探索性 worst-cell 篩選，不據此宣稱穩定的專家退化。

## 4. 具體重播指出的改進方向

以下是可重播觀察與研究假說；尚未實作修正，也未用反事實實驗證明任何建議的整體提升。

### 優先 1：讓收尾證據真正約束追品質風險

**F12／E02／Balanced／balanced-iid／seed index 28**，第 29 次技能前：

- 作業 7,761/9,500，品質 19,565/24,000，CP 66、耐久 20，當前高品質。
- 集中製作（Intensive Synthesis，`intensiveSynthesis`）候選有接模範製作（Careful Synthesis，`carefulSynthesis`）的 NormalRoute 完工證據。
- 集中加工（Precise Touch，`preciseTouch`）的收尾證據是 Unknown，但四個續作樣本也全都預測完成；selection score 2.87409 高於安全收尾的 2.81750，因此選追品質。
- 實際下一步轉為高效，接掌握（Manipulation，`manipulation`）後 CP 歸零；最終高速製作（Rapid Synthesis，`rapidSynthesis`）失敗。品質雖升至 22,124，整件未交貨。這證明該狀態存在具體的收尾／追品風險取捨，不是裝備本身沒有收尾能力。

對應 owner：[scoring.rs](../../../native/craft-kernel/src/generic_solver/portfolio/scoring.rs)、[selection.rs](../../../native/craft-kernel/src/generic_solver/portfolio/selection.rs)。目前 comparator 排除立即確定失敗，之後主要按抽樣分數比較；多步完工 witness 不會自動變成明示的風險成本。

**建議實驗**：把有限、可支付的多步收尾路線保留為獨立候選，對放棄已知完工路線的追品方案表達下行成本；只在這類有實質取捨的近分比較追加共同樣本。不要直接把所有情況改成先完工，也不要把四樣本全部成功解讀成保證完成。

驗收先鎖定本輪主要切片的十件交貨損失，再涵蓋全矩陣 446 件新失敗、HQ F12／F13 與對應品質收益；以完成與 U 一起判斷，避免只靠保守化犧牲大量品質。

### 優先 2：消除沒有新機會的重複保命動作

**F17／E02／Balanced／seed index 29** 的尾端連續五次最終確認（Final Appraisal，`finalAppraisal`），CP 5→0，作業／品質／耐久與當前球色不變。第一次來自 Semantic，後四次來自 BestEffort。F12、F33、F36、F46 的選定重播也看到相同結構。

[producers.rs 的 best_effort](../../../native/craft-kernel/src/generic_solver/portfolio/producers.rs) 先偏好下一步不進入失敗的技能，再比較即時增益與回復。當剩餘技能都難以帶來成果時，沒有工序進展的最終確認仍可排在會失敗的技能前面，於是反覆消耗 CP。

**建議實驗**：讓 best-effort 的候選判斷納入「是否改善可達終局／帶來新球色機會／保留資源」；對不推進工序、沒有新效果且只降低資源的重複動作做支配淘汰。仍保留合法非終局不回空與必要品質 gate。已沒有可救路線時應誠實 best-effort，不能用空轉製造存活假象。

預期最直接的收益是減少徒勞技能與觸限；是否救回交貨要另外證明。9 件 action-limit 不能全部歸因於最終確認；其中兩件 baseline 成功的 F36／E10 值得單獨檢查。

### 優先 3：微小預測優勢不應輕易改變路線意圖

**F18／E02／Stable／seed index 0** 在第二次技能就從品質累積切到作業。兩個候選的八樣本完成估計都為 0.75；差異主要來自「未交付的目標距離」同分項。扣除配對不確定性後，集中製作只比集中加工高約 **0.00007786**，卻足以換路線；這一 seed 最終由完成變失敗。

這不是八樣本一定錯，也不能由一例宣稱所有換路線都不好。它指出一個可辨識實驗：評估「實質收益不足時維持有效意圖」與「接近同分才追加樣本」，不要讓未交付距離的小數差主導高代價的決定。selection 現在追蹤的持續性主要是 continuation engine，相同 engine 下仍可能從品質意圖換到作業意圖。

F33／E02／Balanced／seed index 0 則是另一種狀況：秘訣（Tricks of the Trade，`tricksOfTheTrade`）八樣本完成估計 1.0，原品質候選 0.75，差距不是微小同分項。這類需要校準續作估計，不能用同一條固定「不換路線」規則處理。

### 優先 4：擴充必要品質能力，先辨別候選缺口與裝備壓力

- 先選 F19／F41／F45：E09 已有約 52–67% 完成，較容易用成功／失敗對照定位進展儲備、品質爆發與恢復銜接；同時保留 F28／F35 現有收益。
- F36／F46 作最難壓力層，調查完整品質 route 在哪一段失去可達性。兩版一起失敗只證明目前兩個 policy 不足；需另有 causal 路線證據或放寬上界才能談裝備極限。
- F35／E09／opportunity-scarce 的重播雖把品質由 12,182 提至 19,303，仍未到 23,000 且未完成；這不是 hard-quality 成功。
- 本輪原始 seed index 3 與開發 readiness 的 base seed 20260827 對應。已重播 brief 點名的 F19／E02／Balanced、F43／E09／Aggressive 及 F35／E09 兩個壓力 world。兩個 readiness 損失在完整相同格分別仍淨 +7.81 pp、+1.56 pp，不能只追求消除那兩個 seed。

對應 owner 為 portfolio 的 producers／scoring／route memory，按 mechanics、objective、裝備數值、state 與可觀測歷史改善；不增加 recipe／equipment ID 特例。

## 5. 成本：現在不是首要阻塞

合併 **11,509,199 次 candidate 推薦原始樣本**，使用 nearest-rank：

| Arm／執行範圍 | 推薦數 | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1.1 全部 | 11,509,199 | 0.170 ms | 16.929 ms | 43.783 ms | 278.747 ms |
| v1.1／2 workers 所完成 shards | 2,727,175 | 0.190 ms | 25.723 ms | 56.916 ms | 278.747 ms |
| v1.1／4 workers 所完成 shards | 8,782,024 | 0.161 ms | 14.539 ms | 37.509 ms | 264.451 ms |
| v0.30 全部 | 11,184,896 | 0.003 ms | 0.319 ms | 0.437 ms | 2.666 ms |

- 本機 native 的 p95 <1 秒、max <3 秒目標守住。v1.1 累計推薦計算時間約 8.71 小時，是 baseline 約 44.5 倍；這是多程序累計時間，不是玩家等待或全程 wall time。
- 完成 shards 中，37 個來自 2 workers、113 個來自 4 workers；另有 12 次 interrupted attempts，沒有 timeout／失敗 attempt。不同 worker 切片不是相同案例，不能據此斷言 4 workers 單步比較快。
- 全部已記錄 attempt 的活動區間聯集約 3 小時 9 分；並行 child 時間加總約 9 小時 27 分。最後一次 invocation 約 1 小時 28 分，均不等於從最初啟動到完成含停機的總經過時間。
- 因為混用 workers 並有續跑，本輪**沒有直接驗證完整矩陣 2 workers／10 小時**，也沒有提供持續溫度、功耗或降頻證據。
- 必要品質主要切片的完成工序 S p50/max 為 31/66（baseline 30/79）；未完成為 43/76（baseline 42/79），未完成全部技能 A p50 由 42 增到 46。工序與技能長度仍是觀察值，未建模任務倒數，不能直接換算是否來得及。
- 此為本機 native recommendation 函式成本；不是瀏覽器、手機、WASM 載入、boundary transfer、UI 或獨立快速求解器驗收。

## 6. 下一輪建議與驗收

1. **先改善收尾風險與空轉**，保留目前 v1.1 封存 binary 作直接對照、v0.30 作歷史參考；以已有案例做小範圍診斷，不先重跑完整 overnight。
2. 對「收尾證據／風險估計」、「無效重複動作」、「微小收益換意圖」分開作消融，避免同時改一批權重後無法分辨原因。新 sample 預算只花在能改變選擇的狀態。
3. 日間 gate 同時比較：主要三量尺、HQ F12／F13、EX+ 高品質、F19／F41／F45、F36／F46、三種 risk、專家 E03／E10 與壓力 world；報交貨勝負、U、技能長尾、policy-null／illegal／action-limit 及延遲。
4. 再固定新 brief 與獨立保留集。**不同 base seed 字串不保證不重疊**：本輪以 baseSeed XOR seedIndex 產生 paired seed，20260827 本來就在 20260824 的 64-seed 區塊裡。應驗證實際 paired seeds／案例集合不交疊，而不是只改日期。
5. 是否升格研究 baseline 由使用者 review；Web 採用、3 秒 watchdog、獨立快速求解器與遊戲實證仍按原 roadmap 各自驗收。

## 7. 本次交付與重算

2026-08-28 的初次分析只新增此目錄下的分析、可重算腳本、分組資料與 bounded replay 證據，沒有啟動長跑。2026-08-29 已重新驗證 derived reports 並依使用者要求保存 commit；後续 solver 迭代及目前版本由 current state 管理，這份報告保留原輪判讀。

~~~powershell
node --max-old-space-size=6144 reports/generic-cosmic-overnight/v110-review-20260828/analyze.mjs
node reports/generic-cosmic-overnight/v110-review-20260828/render-slices.mjs
node reports/generic-cosmic-overnight/v110-review-20260828/replay.mjs
~~~

前兩個命令只讀已完成資料並生成此目錄的 derived reports；第三個只重播明列的 21 pairs 與 8 個 observer episodes。需要原始 run、封存 binary、當次 evaluator bundle 及本機 observer executable；hash 或非計時結果不符會停止。

[metrics.json](metrics.json) 保存身份、群集區間、分組量尺、執行成本；[exceptions.json](exceptions.json) 保存全部交貨損失／action-limit 及主要切面的品質損失，並非全部弱品質案例；[replays.json](replays.json) 保存本次逐案 trace。這些輸出可由腳本重建，無需重新跑完整矩陣。
