# v1.1 保留效果的效能優化

日期：2026-08-27。效能 checkpoint：`c3ff358`。完整長跑由使用者啟動，命令見 [commands.md](commands.md)。

## 判斷

目前值得進入完整 64-seed overnight。這輪保留 v1.1 的候選、搜尋順序、節點預算、共同抽樣及評分，透過省去無用的路線排名與重複續算降低成本。既有 332 組配對案例的 664 筆非計時結果全部一致。

涵蓋全部軸的 600 組分層成本樣本，2 workers 實測 27.55 秒；先前同組短測為 30.59 秒，線性外推完整 384,000 pairs 約 4.9–5.4 小時。作業規劃保守抓 **6–8 小時**，交付 10 小時 invocation 上限及續跑。此範圍是短測加上操作餘裕，不是統計信賴區間或完成保證；64 seeds 的長尾、長時間降頻及背景負載仍需完整執行確認。

## 計算責任

| 用途 | 實作 | 保持的條件 |
| --- | --- | --- |
| 是否有完工路線 | 可行性查詢在找到 witness 時返回 | 與排名搜尋相同的動作順序及新建節點預算 |
| 挑選最佳完工路線 | 以目前最佳耐久需求限制下一條路線的測量區間 | 完整搜尋節點、耐久／CP／長度／技能字串比較順序 |
| 同次推薦的模擬續算 | 完整 state、planner context、engine 作快取 key；最多 4,096 筆 | recipe、crafter、objective、risk、world 綁定該次推薦；容量滿時繼續正常求解 |
| 耐久二分 | 重用呼叫端已重播成功的上界 | debug assertion 及有效 suffix 的窮舉對照 |

快取只存在單次推薦內，也保存確定的 `None` 結果；沒有跨製作、跨 seed 或預知實際未來球色的狀態。政策 identity 維持 v1.1；ABI 與 report identity 隨逐次計時欄位更新。

## 效果與成本回歸

使用原 readiness 的全部 50 families、E02／E09、`balanced-iid`、seed `20260827`；各 risk 100 pairs。以下時間是 candidate 累計推薦時間。

| Risk | 原 v1.1 | 優化後 | Candidate 完成／滿品質 | 相對原 v1.1 非計時差異 |
| --- | ---: | ---: | ---: | ---: |
| Stable | 101.19s | 20.41s | 92／64 | 0 |
| Balanced | 87.53s | 19.77s | 91／68 | 0 |
| Aggressive | 90.13s | 19.25s | 93／75 | 0 |
| 合計 | 278.85s | 59.43s | 276／207 | 0 |

此切片節省約 78.7% 計算時間，約 4.7 倍加速。兩臂的終局、品質、CP、耐久、技能數及 planner fingerprint 均依原報告逐欄比對；時間欄位另行驗證。原報告沒有保存的 trace 不列為已核對欄位。

可直接比較的加速幅度以這組相同案例為準。新的總時間估算另外納入全部裝備與四個 worlds 的分層成本；先前 40–60 小時的估算主要來自 E02／E09 × balanced-iid，因此總估時的縮短同時反映程式加速與較完整的成本取樣。

既有四組壓力補測共 32 pairs 也全部保持結果：36195、36206、37005、38200，涵蓋 E02／E03／E09／E10 與 `all-normal`／`opportunity-scarce-iid`。37005 的兩臂 0/8 完成依然是已知缺口；36227／Balanced／E02 與 37528／Aggressive／E09 的既有 v0.30 配對代價也保持可見。原始能力解讀見 [v1.1 開發結果](../v110-development/results.md)。

加速幅度依情境不同；37005 的小批次時間約 0.46→0.49 秒，沒有宣稱每個案例都變快。

## 雙 worker 成本及一致性

成本切片預先按 `equipmentIndex = (familyIndex + 3 × riskIndex + 7 × worldIndex) % 10` 選取，每個 family／risk／world 一組裝備；共 600 pairs。全部 50 families 各 12 pairs、10 組裝備各 60 pairs、3 種 risk 各 200 pairs、4 種 world 各 150 pairs，seed `20260827`。

- 單 worker：47.20 秒；雙 worker：27.55 秒。兩次共用 1,200 筆兩臂結果，非計時 native 欄位與完整動作序列的 digest 相同。
- 原格式與最終格式 build 的雙 worker 重播結果 digest 相同；最終封存 binary 為 commands 所列 SHA-256。
- 最終雙 worker 的 18,244 次 candidate 推薦：p50 **0.166ms**、p95 **16.266ms**、p99 **42.846ms**、max **213.677ms**。這是本機 native 及此成本切片的數值。
- readiness 的 9,024 次 candidate 推薦：p50 0.343ms、p95 33.040ms、p99 55.501ms、max 109.443ms。不同切片與 worker 數各自保留。
- 實際 npm runner 操作測試覆蓋 6 families × 全部裝備／risk／world × 1 seed：18 shards、720 pairs／1,440 solver episodes，首次測試約 32.7 秒，0 retry／timeout。它驗證 runner 開銷與資料落盤，不用其少數 families 外推全矩陣速度。

完整矩陣的 config axes 與上一輪 v0.30 完全相同；另外從目前 generator 重建 150 shards 的 384,000 個 case ID／fingerprint／paired seed，全部對齊。這項是純案例檢查，沒有執行 solver。

## 逐次耗時契約

Native protocol／ABI v7 追加每次推薦的 nanoseconds；輸出 51 欄，輸入仍是 141 欄。Paired report v4 的每個 episode 保存 `recommendationDurationsNs`，順序對應推薦呼叫，包含 policy-null 的最後一次呼叫；終局零次呼叫為空陣列。

Parser 與 shard validator 檢查每個樣本是非負安全整數、樣本數等於 calls、總和等於 total、最大值等於 max。各切片的 summary 合併原始 samples，以 nearest-rank 算 p50／p95／p99／max。全 run 後續分析同樣合併 raw samples；舊 v6／report v3 沒有這些資料時保持 unknown。

計時範圍是推薦函式，包含求解器配置與計算；不包含外部 Node 啟動、JSON／TSV 輸出及觀察 callback。這些外部成本由 process／attempt／invocation wall clock 另外記錄。每次 attempt 及 completed shard 保存 worker 配置，resume 改 worker 時仍能追溯原量測環境。

## 驗證與原始證據

- Rust release tests：92 passed；其中 1,280 組資源狀態／步數上限對照完整排名及存在性查詢，另保留耐久二分窮舉檢查、完整 key／容量滿／cached-null 測試。
- Overnight Node tests：19 passed；涵蓋計時資料破損、合併百分位、舊報告及程序樹中止。
- Vitest 466 passed、Typecheck、release build、16 項 debug library tests、文件檢查及 diff check 通過；Web build 與裝置測試不屬這輪修改範圍。
- 最終操作版本以 3 秒 global deadline 得到 exit 75、0 running；當時唯讀程序檢查未見殘留 Rust episode 程序。同一命令續跑至 18/18，重跑及 status-only 不增加 attempts；completed shards 保留原 worker 記錄。
- 完整 64-seed run 只完成 status-only，0/150、0 attempts，留待使用者啟動。

本機原始資料集中於 `evaluation-runs/v110-performance/`：`semantic-regression.json`、readiness／stress JSON、`cost-slice.json`、各 worker input/output TSV、`cost-w1.json`、`cost-w2.json`、`full-case-alignment.json` 與操作 logs。操作 run 為 `generic-native-v110-performance-operations-v2-20260827`。

本輪沒有 Web／WASM、目標裝置、遊戲內或持續熱負載驗證，也沒有自動溫控。完整結果 review 依 [active brief](../../../.agents/overnight_review_brief.md) 進行。
