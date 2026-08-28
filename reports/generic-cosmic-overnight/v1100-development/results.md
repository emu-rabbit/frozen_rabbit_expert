# v1.10 與本夜迭代結案

2026-08-29。**不交付完整 overnight 候選。** 一般收藏品確有跨家族品質收益，但最後新種子確認仍出現交貨退步，且成本超過開發計畫的 110% 護欄。沒有以放寬門檻、隱藏失敗類型或重用調整過的 seeds 宣稱成功。

## 實作與限制

`generic-craft-route-portfolio-v1.10.0` 只按產品目標分工：有必要品質或 HardQualityMaximum／HqChance 使用 v1.1，其餘一般／連續品質收藏品使用 v1.3。選擇不讀 recipe ID、equipment ID、seed 或未來 RNG；真實事件的完整狀態回饋仍保留。

v1.3 提供九種球色的獨立機會比較與多步完整收尾搜尋，可連續安排準備、品質和進展。v1.10 的 hard-quality／HQ 保留 v1.1 原有球色能力，**沒有取得新的品質提升，也沒有啟用新擴展候選層**。因此不能稱為所有產品目標都全面升級。

v1.4–v1.9 的起手、精確查詢快取、縮減比較、全球色收尾證明、樂觀上界剪枝、預測等價分組各有獨立 identity 與 checkpoint；未取得採用證據的變動沒有混入 v1.10。

## 最後新種子確認

v1.3 的 81000000 確認在主要 hard-quality 從 81/112 降到 76/112，退步 4.464 個百分點，未通過。看過此結果才設計 v1.10，因此該批已歸為開發資料。v1.10 使用此前未參與調整的 **101000000**，每格 4 條 stream，focus 1,200 pairs 與 broad 2,400 pairs 分開判讀；兩批部分案例重疊，不能相加宣稱 3,600 個獨立案例。

主要切片固定為 **Balanced × balanced-iid × E02/E09**：

| 品質目標 | v1.10 交貨（相對 v1.1 件數差） | 平均 U 差 | 滿品質率差 | 判讀 |
| --- | ---: | ---: | ---: | --- |
| Hard-quality，112 pairs | 75（0） | 0 | 0 pp | 保留原版，未改善 |
| 一般收藏品，248 pairs | 248（0） | +0.03959 | +8.065 pp | 有明顯研究收益 |
| HQ，16 pairs | 16（0） | 0 | 0 pp | 保留原版，未改善 |
| 連續品質，24 pairs | 22（−2） | −0.06463 | −8.333 pp | 品質及交貨退步 |
| 全部 progress-only，288 pairs | 286（−2） | +0.02871 | +6.250 pp | 交貨 −0.694 pp，跌破 −0.5 pp 護欄 |

U 是無單位、0–1 的交付品質效用；交貨失敗計零，一般收藏品依四檔門檻插值，HQ 依機率，連續品質依品質／品質上限。不同目標分開報告，不能把 U 當品質點數。

一般收藏品主要切片的 U 增益 95% family／sample bootstrap 區間為 +0.01430～+0.06650，滿品質率增益 +1.613～+16.129 pp。連續品質只有 24 pairs，估計不穩定；這是未能排除重要退步，不是已證明真實玩家必然退步相同比例。

Focus 全部 1,200 pairs：交貨 1,080 → 1,076，平均 U +0.03208、滿品質率 +4.417 pp；總 native 推薦計算 1.298 倍。推薦 p95 30.314ms、max 170.516ms；單步沒有暴漲，但累積運算成本仍增加約 30%。這不是目標裝置延遲或完整 overnight 時間實測。

逐類別、17 球色集與家族摘要見 [focus](../v120-development/confirm-v1100-focus-summary.md)。原始輸入／輸出、案例 digest 和執行順序保存在 `evaluation-runs/v120-development/confirm-v1100-*/`。凍結 binary SHA-256：`126227ed36a58fe77283f8284b009718a8c9918d946099a110ac96e69d1deaf2`。

Broad 2,400 pairs 的交貨 1,817 → 1,813，平均 U +0.04940、滿品質率 +4.750 pp；總運算 1.239 倍，推薦 p95 14.767ms、max 127.973ms。一般收藏品交貨 1,486 → 1,485，U +0.07811、滿品質率 +7.728 pp；連續品質交貨 144 → 141，U +0.01620。即使整體 U 上升，也不能掩蓋交貨退步。詳見 [broad 摘要](../v120-development/confirm-v1100-broad-summary.md)。

全部 family × equipment × risk × world 保存在 [focus cells](confirm-v1100-focus-cells.md)、[broad cells](confirm-v1100-broad-cells.md)；逐案與完整核算見同目錄 `*-rows.jsonl` 及 `audit.json`。Focus 退步包括 F47/E02/Stable，以及 F48、F50/E02/Balanced 的連續品質；broad 又出現 F25 一般收藏品及 F49 連續品質失敗。這些是診斷入口，不是可硬編碼的例外。Stable 也有失敗，不能把風險問題歸給 Aggressive。

兩批全部輸出均核對案例／binary hash、完成規則、逐次 timing 數量及總和，0 illegal、0 policy-null、0 action-limit。Hard-quality／HQ 的 384 與 768 個 paired records（兩批分開）除 solver identity 和計時外，逐招、結果、RNG cursor、state、planner context 等所有輸出欄位與 v1.1 完全相同，見 [精確一致性](preserved-objective-parity.json)。

## 接下來優先修什麼

1. **可交貨路線與品質投資共同決策。** 擴大候選後，有限樣本可能偏好高品質但資源脆弱的路線。優先重播最後連續品質的失敗，核對哪一步失去可支付退路；把風險證據接入共同比較，而不是加某個 family 的保護例外。
2. **跨球色、跨步的投資價值。** 新候選已能提出高耗 CP 技能和連續準備，但有限續作是否真正用到增益、能否保留 CP／耐久供收尾，仍需要改善。應比較完整計畫的成功／失敗分支，不只看當球折扣或首招品質。
3. **以結果差異分配計算。** 查詢快取命中偏低、縮減抽樣會漏掉有效路線，已有失敗證據。下一輪應先定位真正造成候選排序不確定的分支，再追加計算；精確相同的路線合併仍需完整政策驗證。
4. **必要品質與 HQ 尚未突破。** 不應把 v1.10 保留原版誤稱解決；必須在各自效用及失敗代價下驗證新續作能力，並持續揭露最難與弱裝備家族。

上述為待驗證假說，不是已確認因果。101000000 已揭露結果，若再修改策略也必須歸為開發資料，下一版另用新 seed block。

## 驗證與交付邊界

- Release Rust 測試 99 個通過；whole-episode release binary 已建置。九球色 × 四目標測試保留；v1.10 另檢查目標分流與完整 episode 對 v1.1 的一致性。
- 兩批各自的全部保存技能序列均以 mechanics 重播，終局、技能、RNG cursor 與最終 state 完全一致，且九種球色都有實際觀測；[重播摘要](mechanics-replay.json) 保存各臂技能步數與球色計數，包含不推進工序的技能。這不代表每種球色各自都有因果收益。
- 歷史 v1.1 沿用 runner 已通過 39 個測試、TypeScript typecheck，以及 40 新執行＋40 歷史沿用的 run／resume／status／cutoff 整合；證據見 [history smoke](../v120-development/history-smoke.json)。
- 因 solver 效果未過，沒有建立 v1.10 的正式長跑命令或執行最終 full-matrix preflight；先前 v1.2 runner smoke 不冒充 v1.10 交付驗證。
- 未啟動完整 overnight、未採用到 Web、未 push；遊戲自然分布、遊戲實戰與目標裝置／持續熱負載均未驗證。

到使用者指定的 03:00 開始收尾，保存證據與各研究版本；這一夜找到可用的收藏品品質方向，但未得到可誠實宣稱全面突破、已值得按既定條件執行 overnight 的新求解器。
