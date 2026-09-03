# v2.1 採納判讀：四步滿品質證明對 v1.12

`reviewed: 2026-09-07`

## 結論

採用 `generic-craft-external-reference-v2.1.0` 作 Rust 與 Web 主策略。v2.1 相對 v2.0 的唯一策略差異，是把 mechanics-derived 滿品質完工 certificate 的最大深度由三步提高到四步；Artisan fallback 與其餘契約不變。

這次 full run 支持「用顯著品質收益接受有限 aggregate 完成交換」，不支持「v2.1 在每個 family、裝備與 world 都優於 v1.12」。64,000 paired cases 中，滿品質增加 11,583 件（+18.0984 percentage points），完成減少 437 件（−0.6828 points）；負向完成主要集中在 `normal-heavy-iid` 和較弱裝備。使用者已看過四表並明確接受這個跨維度交換，因此升為 v2.1；後續文件與對外敘述必須保留限制。

## Evidence identity

- Run：`generic-native-depth4-vs-v112-balanced-all10-2world-64seed-20260907`，50／50 shards completed。
- Baseline：`generic-craft-route-portfolio-v1.12.0`；Candidate：`generic-craft-external-reference-exp-expanded-full-quality-certificate`。
- 軸：50 families × Balanced × E01–E10 × `balanced-iid`／`normal-heavy-iid` × 64 seeds。
- 規模：64,000 paired cases／128,000 fresh episodes；沒有 baseline reuse。
- Config fingerprint：`2f2ebd8bce121156ac4b8332aa3019c5efdddc5a400a0d760abf5f38a9d216e6`。
- Binary SHA-256：`ef2f73e74a12e24eaae6cac1f9a2642f3fa2a444bd028e38a4d069f985b635a3`。
- 固定 E02／E09 四表見 [自動報告](generic-native-depth4-vs-v112-balanced-all10-2world-64seed-20260907.md)；本報告另讀 raw shards 的全部 1,000 個 family × equipment × world cells。

這是 synthetic／assumed-world development evidence，不是真實遊戲自然成功率。

## 玩家成果

| 量尺 | v1.12 | 四步版 | Delta |
| --- | ---: | ---: | ---: |
| 完成 | 51,445／64,000（80.3828%） | 51,008（79.7000%） | −437（−0.6828 pp） |
| 滿品質 | 27,649／64,000（43.2016%） | 39,232（61.3000%） | +11,583（+18.0984 pp） |
| 完成 paired 勝／敗 | — | 3,922／4,359 | 淨 −437 |
| 滿品質 paired 勝／敗 | — | 13,617／2,034 | 淨 +11,583 |
| Objective utility paired 勝／敗 | — | 23,114／6,632 | total +5,897.874 |

各 objective 不能用 aggregate 互相遮蔽：

| Objective | Cases | 完成 delta | 滿品質 delta | 其他玩家量尺 |
| --- | ---: | ---: | ---: | --- |
| Hard-quality | 17,920 | +3,055（+17.0480 pp） | +3,055（+17.0480 pp） | full progress + required quality 同時達成 |
| 一般收藏品 | 39,680 | −2,933（−7.3916 pp） | +6,262（+15.7813 pp） | 100／300／700 分檔分別 +707／+1,734／+3,783 |
| 一般 HQ 成品 | 2,560 | −196（−7.6563 pp） | +1,081（+42.2266 pp） | 50%／75%／100% HQ floor 分別 +834／+917／+1,081 |
| Master | 3,840 | −363（−9.4531 pp） | +1,185（+30.8594 pp） | 已完成平均收藏價值 1,683.678→2,154.758（+471.080） |

因此這不是拿少量平均品質換完工，而是大量案例真正跨過 100／300／700、HQ floor 或滿品質；代價也不是零，尤其 progress-only、HQ 與 Master 的交貨率下降約 7–9.5 points。

## 跨維度判讀

兩個 world 的方向相反：

| World | 完成 delta | 滿品質 delta |
| --- | ---: | ---: |
| `balanced-iid` | +1,800（+5.6250 pp） | +7,183（+22.4469 pp） |
| `normal-heavy-iid` | −2,237（−6.9906 pp） | +4,400（+13.7500 pp） |

10 套裝備的滿品質全部為正，介於 +14.2188 至 +20.7188 points。完成則 E02（+1.3750）、E03（+0.3438）、E07（+0.9062）、E08（+0.8750）、E09（+1.1406）為正；E01（−0.1719）、E05（−0.4375）、E10（−0.1250）接近持平，E04（−6.6250）與 E06（−4.1094）有明顯退步。主戰正式支援的 E02／E09 aggregate 都同時提升完成與滿品質；較弱、未食藥壓力裝備的代價不能外推為主戰結果，也不能從報告刪除。

50 families 中，滿品質 44 正／0 平／6 負；完成 14 正／2 平／34 負。滿品質為負的六個 family 是 F26 −137、F09 −130、F27 −58、F25 −53、F10 −46、F08 −13；最大負值都集中在 `normal-heavy-iid`。1,000 個 family × equipment × world cells 中，滿品質 653 正／245 平／102 負，完成 219 正／391 平／390 負，utility 662 正／162 平／176 負。

最嚴重的滿品質 cell 是 F26／E02／`normal-heavy-iid`（−36／64，−56.25 pp），其次為 F26／E03（−31）、F09／E02（−30）、F09／E03（−27）與 F27／E07（−26），全部都在 `normal-heavy-iid`。這些幅度遠大於 64 seeds 的單格解析度，不能解讀成抽樣微噪音。

## 到底做了什麼、哪些建立在 Artisan 上

執行時路徑是：

1. 本專案依玩家完整 history 重建 Craft state，使用自己的 FFXIV mechanics、合法性與 recipe 宣告的 condition set。
2. 本專案的 AND／OR certificate 搜尋成功率 100% 的技能，要求對每個可能下一球色都能在最多四步內重新選擇一條同時滿作業、滿品質的 continuation；每個實際回報後重新證明。
3. 若 certificate 找不到證明，呼叫固定的 Artisan Expert decision tree fallback。

直接建立在 Artisan 上的是第 3 步：`native/craft-kernel/src/artisan_expert.rs` 從 PunishXIV/Artisan commit `882202ce04fcd4fe405812ea24d78b660d8ff64e` 的 `ExpertSolver.cs` 與預設設定翻譯、修改而來。BSD-3-Clause 允許修改與 source／binary redistribution，但必須保留 copyright、條款與免責；本專案已在 source header 和 `THIRD_PARTY_NOTICES.md` 保存 notice，Web build 也保留第三方告知。聯絡開發者是關係與透明度選擇，不是現有授權成立的前提。

本專案自行擁有的是 mechanics、state/history replay、condition mask、certificate 搜尋與四步深度、逐步重證、Rust／WASM 整合、3 秒 watchdog、評測、UI 與玩家輸入流程。Thal's Expert 沒有任何 source、binary、model、網路呼叫或 runtime dependency；只把其公開產品概念「找到完整解後採用」轉成可驗證假說。v1.12 完全不在 v2.1 runtime 中，只是這次 fresh evaluation baseline。

本次 raw evidence 沒記錄每個 decision 是 certificate 還是 Artisan fallback，不能捏造兩者呼叫占比。若要回答產品在實際 envelope 有多少決策仍依賴 Artisan，需另加 source telemetry 後做描述性 run。

## v2.1 的增量歸因

這次 +11,583 滿品質不能全部歸因於「第四步」：full run 比的是整個 Artisan-based v2 架構和 v1.12。第四步相對 v2.0 三步版的獨立 evidence，來自兩個不同 seed、合計 8,000 paired cases 的 bounded gates：滿品質 +21／0、完成 +10／0。v2.1 採用的是這個已隔離的小幅無負向增量；64-seed full run 則用來盤點整體產品相對歷史線上版的能力與代價。

## 單純屬於四步 Candidate 的時間

雙臂 runner 把 v1.12 與 Candidate 交錯排程，所以 `activeWallClockMs` 4,944,347.3923 ms（1:22:24.347）是整個雙臂 run，不能當 Candidate 單獨時間。可從 50 個 completed shards 精確剝離的是：

| Candidate-only 量尺 | 時間 | 性質 |
| --- | ---: | --- |
| 50 個 Candidate subprocess wall 加總 | 5,144.289 秒（1:25:44.289） | 精確；單 worker serial-equivalent，不是實際四 worker elapsed |
| Native summary compute 加總 | 5,142.150 秒（1:25:42.150） | 精確；binary 內批次計時 |
| 3,035,961 次 recommendation 加總 | 5,139.289 秒（1:25:39.289） | 精確；只含 recommendation calls |
| 依已錄 shard durations 重播四 worker queue | 約 21.774 分（0:21:46） | 估算；最接近 candidate-only host elapsed |
| 理想四 worker 下限 | 約 21.435 分（0:21:26） | 算術下限，不含排程不均 |

Candidate shard median 97.733 秒、p95 181.751 秒、max 186.436 秒；單次 recommendation p50 0.917 ms、p95 5.414 ms、p99 6.409 ms、max 34.700 ms。這些是在四 workers 與另一臂競爭資源時取得；要得到「實測而非估算」的 candidate-only host elapsed，必須另跑單臂。

## 是否擴到 256 seeds

現在不需要靠 256 seeds 才決定升版：+18.10 pp 滿品質、`normal-heavy-iid` −6.99 pp 完成與最差 cells 的 −40 至 −56 pp 都已大到足以判斷方向。256 seeds 的價值是把單格解析度由 1.5625 pp 提高到 0.390625 pp，並把抽樣標準誤約減半，用來確認 E01／E05／E10 這類接近零的完成差、或更精確界定 102 個負向滿品質 cells。

若原樣重跑 v1.12 對 v2.1 的全矩陣，規模會成為 256,000 paired cases／512,000 episodes；runner 的 immutable seed axes 代表前 64 seeds 也要 fresh 重跑，不能直接把本次 baseline 拼接進去。按本次線性外推，雙臂約 5 小時 30 分；candidate-only 四 worker 約 1 小時 27 分，但兩者都只是容量估算，仍受熱控與排程影響。

若目的是驗證這次小版本的純增量，較有資訊價值的 256-seed 設計是 fresh v2.0 vs v2.1，而不是再次比較 v1.12；那會直接量到第四步新增的 +21／0、+10／0 是否在更細 seed 網格保持。長跑啟動前仍應先固定 axes 與接受條件。

## 採用後限制

- v2.1 不宣稱全面支配 v1.12；它是使用者明確接受品質優先交換後的主版本。
- 0 illegal、0 policy-null；Candidate 有 4,099 個 action-limit。這是 80-step envelope 下的長路線／未收尾診斷，不是採用優勢，也不能抵銷品質或完成結果。
- 五步雖在 bounded native sweep 再增加滿品質 +13／0、完成 +9／0，p95 76.378 ms，仍未通過本次相同廣度與 target-device WASM gate；v2.1 不偷偷包含五步。
- Fallback 替換與 Artisan 蒸餾仍暫停；v2.1 是 Artisan decision tree 加本專案四步 certificate 的混合，不冒充完全獨立核心。
