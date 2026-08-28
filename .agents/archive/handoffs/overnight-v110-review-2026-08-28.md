<!-- doc-status: archived -->

# Overnight 評測交接簡報

此為 2026-08-27 跑前 brief；完整結果已於 2026-08-28 檢視。只用於重播原接受條件，不代表目前待跑版本。結果見 [v1.1 review](../../../reports/generic-cosmic-overnight/v110-review-20260828/review.md)。

本輪 brief 固定日期：2026-08-27。

## 本輪決策

評估新架構 v1.1 是否值得成為下一個研究 baseline，並定位跨裝備／球色的能力缺口。v0.30 為目前對照；Web 採用與正式發布由後續完整 evidence review 決定。

已完成的 300-pair readiness 與 32-pair 壓力補測見 [開發結果](../../../reports/generic-cosmic-overnight/v110-development/results.md)。主要訊號是必要品質完成及完整品質改善、progress-only 保持交貨；本輪擴大到全部裝備與 assumed worlds。

## 固定身份與資料用途

- Baseline：`generic-craft-specialist-resource-guard-v0.30.0`。
- Candidate：`generic-craft-route-portfolio-v1.1.0`。
- 50 families × 10 equipment × 3 risk × 4 assumed worlds × 64 seeds，共 384,000 pairs／768,000 solver episodes、150 shards。
- Run、binary、config 及操作命令由 [commands.md](../../../reports/generic-cosmic-overnight/v110-performance/commands.md) 擁有。完整 run 目前只做 status-only 預檢，待使用者啟動。
- 完整 run 使用與 v0.30 相同的 base seed `20260824` 及案例身份，作共同 benchmark。既有六批及部分 pilot 已使用這組資料，其用途為跨版本配對比較；獨立採用保留集留待後續研究另行確認。
- 開發 readiness／成本抽樣使用 `20260827`，本輪操作 smoke 使用 `20260828`。抽樣量與完整矩陣各自記錄，完整評測維持每格 64 seeds。

## 改動假說

1. 必要品質使用更多共同抽樣，配對增益的不確定性成本使換路線有更可靠的依據。
2. 未交付的預測以目標距離作同分比較，改善極弱 state 的 best-effort 選擇。
3. 單一候選保留首步證據；已證實可行的 suffix 耐久改用二分搜尋，將計算花在實際選擇上。
4. 保持候選、證據、比較與實際事件記憶的清楚責任，支持後續針對具體失敗改善能力。

本輪追加的效能優化保留 v1.1 搜尋順序、節點預算、共同 samples 與評分規則：存在性查詢找到證據即可返回，路線排名使用已證實的耐久上界，相同完整輸入的續算在單次推薦內共用。驗證及成本範圍見 [效能結果](../../../reports/generic-cosmic-overnight/v110-performance/results.md)。

可觀測訊號只有 mechanics、objective、裝備能力、state、實際 context 與宣告球色模型。範圍與預算見 [實作說明](../../../reports/generic-cosmic-overnight/v110-development/implementation.md)。

## 判讀順序

1. 驗證 binary、ABI、config、bundle、150 shards、兩臂 row identity 與 paired seeds；確認完整或如實標記 partial。
2. 先看自動四表的 Balanced × balanced-iid × E02／E09：hard-quality、一般收藏品、HQ、Master 各自判讀。
3. 再看 Stable／Aggressive、其餘裝備及每個 assumed world。兩臂、完成／未完成、製作長度 A／S、CP／耐久及 policy-null 各自保存。
4. 重播具體代價：readiness 的 36227／Balanced／E02、37528／Aggressive／E09，以及 37005 壓力 world 的兩臂失敗；用 state／route／候選證據判斷策略、裝備壓力或尚未辨明的原因。

每個 family × equipment × risk × world 等權表示 benchmark；各 world 分列。玩家平均體驗需要玩家分布及自然球色資料。

## 事前研究界線

主要切面為 Balanced × balanced-iid × E02／E09，將兩種完成契約分開。以下界線用於提出研究方向建議，最終採用仍由使用者 review：

| 量尺 | 可接受效果相當區間的下界 | 值得延續的改善幅度 |
| --- | ---: | ---: |
| Hard-quality 完成率差 | −2 percentage points | +2 percentage points |
| Progress-only 交貨率差 | −0.5 percentage points | 保持交貨，結合品質收益判斷 |
| Progress-only 平均完整品質效用差 | −0.01 | +0.01 |

建議延續需三項主要量尺的點估計守住下界，且至少一項達到改善幅度。報 95% 配對群集區間；區間跨越實質損失界線時列為 evidence 不足，先補最有辨識力的資料。這些探索性區間不作自動發布或多重比較後的顯著性宣稱。

區間以 family 為外層、同 family 的 seed index 為內層重抽樣，保留兩臂配對及跨 risk／equipment／world 的同一 seed index 區塊；使用固定 bootstrap seed `1101`、2,000 次重抽樣。比較前固定主要量尺；全矩陣額外切片屬診斷，清楚標示多重比較。

重要 E02／E09 切片若同一 family／risk／world 出現淨完成率下降至少 25 percentage points 或品質效用下降至少 0.10，列為優先診斷並呈現其他切面的收益。弱裝備與壓力 world 同樣保留完整失敗資料；個別 paired seed 的勝負交換可接受，系統性代價交使用者決定。

## 正確性與成本

- Gate：0 illegal、有效非終局有合法技能時 0 policy-null、必要品質如實計入完成、證據身份一致。
- 本機 native 成本目標：完整矩陣以 2 workers 在 10 小時內完成，推薦 p95 小於 1 秒、max 小於 3 秒。Raw report 保存每次推薦的 nanoseconds，按所需切片合併原始樣本計算 p50／p95／p99／max；worker 配置及兩臂各自保留。
- 效能改善優先維持完成率、完整品質與重要情境的表現；若成本目標需要明顯效果取捨，先交使用者決定。
- 正確性、identity 或可中止操作契約失敗時，先停止採用流程並修正。
- 下界外的可信損失、未約定代價或不充分區間，分別提出修正／取捨／補證據建議；品質與完成率依契約分開判讀。
- 獨立快速求解器、Web watchdog、目標裝置與遊戲實證依原 roadmap 後續驗收。

## 操作交付

使用既有 npm runner，預設 2 workers，每次 invocation 最多 10 小時，可用同一命令續跑。估時、程序樹中止、3 秒 budget cutoff、resume、status-only 與單／雙 worker 一致性證據集中於 [效能結果](../../../reports/generic-cosmic-overnight/v110-performance/results.md)。

本次沒有持續熱負載校準或自動溫控。使用者自行監看溫度及降頻，必要時中止並降低 workers。操作權限與資料完整性依 [長跑工作流](../../workflows/run-generic-overnight-evaluation.md)；長跑只由使用者啟動。
