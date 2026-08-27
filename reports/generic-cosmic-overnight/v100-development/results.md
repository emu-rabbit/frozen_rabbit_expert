# v1.0 第一批實作與開發結果

日期：2026-08-27。比較範圍依 [開發 brief](brief.md)；架構與重用範圍見 [實作說明](implementation.md)。

## 目前判斷

新 Rust candidate 已能透過共同候選比較與路線記憶完成逐步求解。本批保留它作開發版本，v0.30 繼續作研究 baseline；接下來優先改善完成率與續作估值，再進入完整保留集。

Balanced × balanced-iid × 50 families × E02／E09 × 1 seed：v1.0 完成 86/100，v0.30 為 93/100；滿品質 66/100，v0.30 為 62/100。配對完成 1 勝／8 負，滿品質 12 勝／8 負。完整品質效用平均 0.774，差值 -0.047。這是開發資料的有限比較，採用所需的效果相當性仍待保留集驗證。

## 主要切片

以下顯示 Candidate，括號為 Candidate−Baseline。每格只有一個 seed；完成／滿品質用計數表達，品質效用為 0–1。

| 裝備 | 完成規則 | cases | 完成 | 滿品質 | 平均品質效用 | 失敗 | policy-null |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| E02 | 進展完成 | 36 | 36 (+0) | 23 (+3) | 0.851 (+0.018) | 0 (+0) | 0 (+0) |
| E02 | 進展＋必要品質 | 14 | 5 (-4) | 5 (-4) | 0.357 (-0.286) | 9 (+9) | 0 (-5) |
| E09 | 進展完成 | 36 | 34 (-2) | 27 (+6) | 0.853 (-0.010) | 2 (+2) | 0 (+0) |
| E09 | 進展＋必要品質 | 14 | 11 (-1) | 11 (-1) | 0.786 (-0.071) | 3 (+3) | 0 (-2) |

## Native 計算成本

| 指標 | v1.0 | v0.30 |
| --- | ---: | ---: |
| 推薦次數 | 3133 | 2975 |
| 累計 solver 時間 | 118.494 s | 1.603 s |
| 每次推薦平均 | 37.821 ms | 0.539 ms |
| 單次最慢 | 949.778 ms | 12.673 ms |

另外重播 36195、36206、37005、38200 × E02／E09 的 8 個相同 cases，observer 的完成／品質／工序與主報告逐一吻合。279 次推薦的 native p50／p95／p99／max 為 7.087／431.106／669.953／949.987 ms；單步最多 7 candidates、4 次 producer、574 次 continuation 呼叫、586 次外層轉移。這組百分位只描述這 8 個診斷 cases；全 100 pairs 保存平均與 max。

上述為本機 native 量測；目標裝置、瀏覽器、獨立快速求解器與持續熱負載各自驗證。

## 專家與其他風險 smoke

36195、36206、37005、38200 × E03／E10 × Stable／Aggressive × balanced-iid × 1 seed，共 16 pairs，與主比較使用同一 binary。

| Risk | 配方 | 裝備 | 完成 | 滿品質 | 品質效用 | stop |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| stable | 36195 | E03 | 1 (+0) | 0 (+0) | 0.417 (+0.249) | completed |
| stable | 36195 | E10 | 1 (+0) | 0 (+0) | 0.649 (+0.398) | completed |
| stable | 36206 | E03 | 1 (+0) | 0 (+0) | 0.580 (-0.060) | completed |
| stable | 36206 | E10 | 1 (+0) | 1 (+0) | 1.000 (+0.000) | completed |
| stable | 37005 | E03 | 1 (+1) | 1 (+1) | 1.000 (+1.000) | completed |
| stable | 37005 | E10 | 1 (+0) | 1 (+0) | 1.000 (+0.000) | completed |
| stable | 38200 | E03 | 1 (+0) | 1 (+1) | 1.000 (+0.165) | completed |
| stable | 38200 | E10 | 1 (+0) | 1 (+1) | 1.000 (+0.165) | completed |
| aggressive | 36195 | E03 | 1 (+0) | 0 (+0) | 0.940 (+0.771) | completed |
| aggressive | 36195 | E10 | 1 (+0) | 1 (+0) | 1.000 (+0.000) | completed |
| aggressive | 36206 | E03 | 1 (+0) | 1 (+1) | 1.000 (+0.360) | completed |
| aggressive | 36206 | E10 | 1 (+0) | 1 (+0) | 1.000 (+0.000) | completed |
| aggressive | 37005 | E03 | 1 (+0) | 1 (+0) | 1.000 (+0.000) | completed |
| aggressive | 37005 | E10 | 1 (+0) | 1 (+0) | 1.000 (+0.000) | completed |
| aggressive | 38200 | E03 | 1 (+0) | 1 (+0) | 1.000 (+0.000) | completed |
| aggressive | 38200 | E10 | 1 (+0) | 1 (+0) | 1.000 (+0.000) | completed |

## 本輪診斷與下一步

初版採較短續作視野，在部分資源充足的低進展配方提前交貨。延長至 64 actions、重配樣本並補足 setup consumer 用途檢查後，代表案例與主矩陣的滿品質表現改善。初版結果保留作 development 診斷，這些變動的獨立貢獻尚未分離。

37005／E02 的重播中，候選多次預測可完成，實際路線仍耗盡資源。下一輪先驗證有限樣本估值、風險失敗後的恢復能力，以及換路線時的進展／品質資源保留；以可觀測 state signal 修正，跨 family 檢查效果。

目前優先級：完成率及必要品質的恢復路線 → 提高續作估值可信度與路線延續性 → 降低重複 adapter 搜尋成本 → 固定未參與調整的保留集及接受界線。這一批的 policy-null、失敗、品質與成本分開列示。

## 逐 family 四表

Family 欄使用既有 mechanics family hash 後綴；每列同時給代表配方。S 是實際推進工序數，最後一欄為該 episode 的最慢推薦。各欄 Candidate 後的括號表示與 v0.30 的差值。

### E02 × 進展完成

| Family／配方 | 品質效用 | 完成 | 滿品質 | Utility | S | stop | max ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 260a7a37be0a／36194 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 32 (+3) | completed | 461.450 (+456.328) |
| 36f1d1ad2664／36195 | collectability-tiers | 1 (+0) | 0 (+0) | 0.789 (+0.026) | 21 (-3) | completed | 9.483 (+9.444) |
| d9261ad66637／36196 | collectability-tiers | 1 (+0) | 1 (+1) | 1.000 (+0.075) | 28 (+0) | completed | 350.154 (+346.905) |
| ead0930362e7／36197 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 27 (+0) | completed | 452.781 (+450.276) |
| 22e9f4de1874／36198 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 29 (-3) | completed | 400.363 (+394.137) |
| 60239c59e963／36200 | collectability-tiers | 1 (+0) | 1 (+1) | 1.000 (+0.162) | 32 (+2) | completed | 378.467 (+373.080) |
| f2cc79379dfc／36201 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 29 (+2) | completed | 430.269 (+425.921) |
| d9c2725de163／36202 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 27 (+2) | completed | 270.887 (+263.602) |
| acddfa9a73da／36203 | collectability-tiers | 1 (+0) | 0 (-1) | 0.955 (-0.045) | 28 (+4) | completed | 198.573 (+196.600) |
| efa472f6a170／36204 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 28 (+0) | completed | 230.756 (+228.697) |
| 3671d4100a0c／36206 | hq-chance | 1 (+0) | 1 (+1) | 1.000 (+0.190) | 35 (+2) | completed | 175.730 (+168.655) |
| dadc443ed505／36208 | hq-chance | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 34 (-5) | completed | 220.173 (+216.848) |
| 66c7b2e44a89／36220 | collectability-tiers | 1 (+0) | 0 (+0) | 0.646 (-0.020) | 38 (+2) | completed | 169.308 (+164.891) |
| 982b410f0b35／36223 | collectability-tiers | 1 (+0) | 0 (+0) | 0.252 (+0.000) | 34 (+0) | completed | 106.887 (+105.665) |
| c4a1d2f2b4a7／36979 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 18 (-3) | completed | 289.525 (+276.852) |
| 7126af4f4372／36980 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 22 (-4) | completed | 23.836 (+23.085) |
| ff629227c1a7／36981 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 25 (+7) | completed | 215.937 (+213.238) |
| bf8126b1cb5c／36982 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 15 (-1) | completed | 207.591 (+204.899) |
| 8f0038e8a1ef／36983 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 18 (-3) | completed | 222.939 (+216.503) |
| 11ed3d3da131／36985 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 26 (+3) | completed | 529.505 (+523.126) |
| a961c84d8dc6／36986 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 24 (-3) | completed | 197.877 (+196.126) |
| e15453ef87ec／36987 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 21 (+3) | completed | 235.668 (+228.816) |
| 8944c73e5c41／36997 | collectability-tiers | 1 (+0) | 0 (+0) | 0.690 (+0.023) | 25 (+4) | completed | 12.928 (+12.825) |
| 27b9a9d2e4be／36999 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 20 (+3) | completed | 124.201 (+122.102) |
| bdd53201a6f5／37002 | collectability-tiers | 1 (+0) | 1 (+1) | 1.000 (+0.065) | 38 (+3) | completed | 184.011 (+180.832) |
| 12965c77f0d7／37004 | collectability-tiers | 1 (+0) | 0 (+0) | 0.493 (+0.251) | 40 (+10) | completed | 188.073 (+187.185) |
| 312da86aecf5／37519 | collectability-tiers | 1 (+0) | 0 (+0) | 0.680 (+0.010) | 34 (+3) | completed | 14.425 (+9.686) |
| 5a74d37f8333／37520 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 26 (+3) | completed | 532.635 (+528.711) |
| 5921cd1d6a76／37521 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 32 (+1) | completed | 142.410 (+136.438) |
| dc3bfefa4d4c／37524 | collectability-tiers | 1 (+0) | 0 (+0) | 0.538 (+0.006) | 42 (+1) | completed | 178.614 (+174.376) |
| 4d9ea80cad44／37527 | collectability-tiers | 1 (+0) | 0 (+0) | 0.248 (-0.044) | 38 (+6) | completed | 208.554 (+206.472) |
| fde7e1f565ae／37529 | collectability-tiers | 1 (+0) | 0 (+0) | 0.420 (+0.158) | 32 (+5) | completed | 103.438 (+102.053) |
| 5ecdeb63e134／37986 | collectability-tiers | 1 (+0) | 0 (+0) | 0.505 (+0.017) | 29 (-1) | completed | 277.223 (+275.735) |
| 9269e9b16362／38198 | continuous-collectability | 1 (+0) | 0 (+0) | 0.664 (-0.200) | 41 (+8) | completed | 231.827 (+226.526) |
| da4415c0f2f6／38199 | continuous-collectability | 1 (+0) | 0 (+0) | 0.751 (-0.033) | 48 (+13) | completed | 341.556 (+339.270) |
| b857491aa259／38200 | continuous-collectability | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 45 (+14) | completed | 879.217 (+875.782) |

### E02 × 必要品質

| Family／配方 | 品質效用 | 完成 | 滿品質 | Utility | S | stop | max ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 28a8766ee960／36205 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 23 (-1) | completed | 13.895 (+13.491) |
| 025847913ddd／36219 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 30 (+0) | completed | 14.053 (+14.024) |
| b630b12a9e02／36222 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 27 (+1) | completed | 32.722 (+32.435) |
| 00871da97040／36225 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 32 (+2) | completed | 14.863 (+14.860) |
| d47b28fc1173／36227 | hard-quality-max | 0 (+0) | 0 (+0) | 0.000 (+0.000) | 47 (+4) | failed | 8.043 (+8.040) |
| a8d11c92b859／36990 | hard-quality-max | 1 (+1) | 1 (+1) | 1.000 (+1.000) | 40 (+21) | completed | 3.130 (+2.928) |
| d85b5c75c255／37001 | hard-quality-max | 0 (-1) | 0 (-1) | 0.000 (-1.000) | 37 (+2) | failed | 9.174 (+9.165) |
| 10a2d95149dd／37003 | hard-quality-max | 0 (-1) | 0 (-1) | 0.000 (-1.000) | 39 (+10) | failed | 25.827 (+25.542) |
| c9c4a2b24964／37005 | hard-quality-max | 0 (-1) | 0 (-1) | 0.000 (-1.000) | 47 (+12) | failed | 12.865 (+12.862) |
| dfea895986f8／37006 | hard-quality-max | 0 (-1) | 0 (-1) | 0.000 (-1.000) | 47 (+9) | failed | 8.354 (+8.348) |
| 7da6b512cab4／37526 | hard-quality-max | 0 (+0) | 0 (+0) | 0.000 (+0.000) | 34 (+7) | failed | 7.807 (+7.616) |
| 9d5ec4bc323d／37528 | hard-quality-max | 0 (-1) | 0 (-1) | 0.000 (-1.000) | 41 (+16) | failed | 21.040 (+21.018) |
| 1be29d956a41／37530 | hard-quality-max | 0 (+0) | 0 (+0) | 0.000 (+0.000) | 49 (-4) | failed | 12.127 (+12.121) |
| ea079b7cbd51／37531 | hard-quality-max | 0 (+0) | 0 (+0) | 0.000 (+0.000) | 47 (+1) | failed | 2.751 (+2.748) |

### E09 × 進展完成

| Family／配方 | 品質效用 | 完成 | 滿品質 | Utility | S | stop | max ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 260a7a37be0a／36194 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 29 (-2) | completed | 949.778 (+941.235) |
| 36f1d1ad2664／36195 | collectability-tiers | 1 (+0) | 1 (+1) | 1.000 (+0.226) | 25 (+3) | completed | 8.593 (+8.443) |
| d9261ad66637／36196 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 31 (+10) | completed | 412.053 (+407.463) |
| ead0930362e7／36197 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 24 (+1) | completed | 252.878 (+248.529) |
| 22e9f4de1874／36198 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 21 (-10) | completed | 255.138 (+249.604) |
| 60239c59e963／36200 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 28 (+4) | completed | 426.344 (+418.911) |
| f2cc79379dfc／36201 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 40 (+3) | completed | 553.276 (+550.248) |
| d9c2725de163／36202 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 22 (-6) | completed | 378.219 (+372.380) |
| acddfa9a73da／36203 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 18 (+0) | completed | 228.189 (+222.036) |
| efa472f6a170／36204 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 24 (-2) | completed | 224.374 (+220.560) |
| 3671d4100a0c／36206 | hq-chance | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 35 (-2) | completed | 297.183 (+292.761) |
| dadc443ed505／36208 | hq-chance | 1 (+0) | 0 (-1) | 0.280 (-0.720) | 34 (+1) | completed | 264.652 (+258.418) |
| 66c7b2e44a89／36220 | collectability-tiers | 1 (+0) | 0 (+0) | 0.767 (+0.248) | 36 (-7) | completed | 173.986 (+163.826) |
| 982b410f0b35／36223 | collectability-tiers | 1 (+0) | 0 (+0) | 0.314 (+0.091) | 31 (-1) | completed | 221.080 (+216.143) |
| c4a1d2f2b4a7／36979 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 29 (-5) | completed | 681.733 (+677.333) |
| 7126af4f4372／36980 | collectability-tiers | 1 (+0) | 1 (+1) | 1.000 (+0.137) | 22 (+4) | completed | 23.061 (+23.025) |
| ff629227c1a7／36981 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 17 (-7) | completed | 151.937 (+144.624) |
| bf8126b1cb5c／36982 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 16 (-1) | completed | 97.998 (+96.360) |
| 8f0038e8a1ef／36983 | collectability-tiers | 1 (+0) | 1 (+1) | 1.000 (+0.153) | 14 (+1) | completed | 220.754 (+217.587) |
| 11ed3d3da131／36985 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 20 (-11) | completed | 383.745 (+379.706) |
| a961c84d8dc6／36986 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 24 (-6) | completed | 275.902 (+271.737) |
| e15453ef87ec／36987 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 25 (-3) | completed | 301.120 (+298.017) |
| 8944c73e5c41／36997 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 26 (-1) | completed | 30.661 (+30.038) |
| 27b9a9d2e4be／36999 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 17 (+0) | completed | 105.344 (+101.269) |
| bdd53201a6f5／37002 | collectability-tiers | 0 (-1) | 0 (+0) | 0.000 (-0.595) | 52 (+11) | failed | 147.838 (+143.253) |
| 12965c77f0d7／37004 | collectability-tiers | 1 (+0) | 0 (+0) | 0.930 (+0.195) | 38 (+4) | completed | 241.971 (+238.486) |
| 312da86aecf5／37519 | collectability-tiers | 1 (+0) | 0 (+0) | 0.700 (+0.020) | 23 (-3) | completed | 9.760 (+7.153) |
| 5a74d37f8333／37520 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 25 (+0) | completed | 234.124 (+230.201) |
| 5921cd1d6a76／37521 | collectability-tiers | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 32 (+0) | completed | 335.022 (+333.439) |
| dc3bfefa4d4c／37524 | collectability-tiers | 1 (+0) | 0 (+0) | 0.293 (-0.066) | 27 (-3) | completed | 145.837 (+142.230) |
| 4d9ea80cad44／37527 | collectability-tiers | 1 (+0) | 0 (+0) | 0.439 (-0.057) | 29 (-2) | completed | 142.999 (+142.087) |
| fde7e1f565ae／37529 | collectability-tiers | 1 (+0) | 1 (+1) | 1.000 (+0.222) | 37 (+5) | completed | 189.118 (+185.386) |
| 5ecdeb63e134／37986 | collectability-tiers | 1 (+0) | 1 (+1) | 1.000 (+0.359) | 32 (+6) | completed | 265.610 (+263.816) |
| 9269e9b16362／38198 | continuous-collectability | 1 (+0) | 1 (+1) | 1.000 (+0.178) | 31 (-8) | completed | 296.972 (+293.434) |
| da4415c0f2f6／38199 | continuous-collectability | 0 (-1) | 0 (+0) | 0.000 (-0.820) | 36 (+6) | failed | 203.265 (+193.047) |
| b857491aa259／38200 | continuous-collectability | 1 (+0) | 1 (+1) | 1.000 (+0.079) | 35 (-11) | completed | 644.506 (+636.183) |

### E09 × 必要品質

| Family／配方 | 品質效用 | 完成 | 滿品質 | Utility | S | stop | max ms |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 28a8766ee960／36205 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 24 (-4) | completed | 24.411 (+23.960) |
| 025847913ddd／36219 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 24 (+0) | completed | 23.046 (+23.045) |
| b630b12a9e02／36222 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 25 (-4) | completed | 84.904 (+84.489) |
| 00871da97040／36225 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 25 (+0) | completed | 22.024 (+22.022) |
| d47b28fc1173／36227 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 38 (+4) | completed | 7.269 (+7.261) |
| a8d11c92b859／36990 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 24 (+0) | completed | 4.695 (+4.608) |
| d85b5c75c255／37001 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 28 (+0) | completed | 11.699 (+11.698) |
| 10a2d95149dd／37003 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 28 (+0) | completed | 34.453 (+34.168) |
| c9c4a2b24964／37005 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 34 (+5) | completed | 16.220 (+16.219) |
| dfea895986f8／37006 | hard-quality-max | 0 (+0) | 0 (+0) | 0.000 (+0.000) | 53 (-15) | failed | 6.163 (+6.161) |
| 7da6b512cab4／37526 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 31 (-4) | completed | 21.345 (+21.026) |
| 9d5ec4bc323d／37528 | hard-quality-max | 0 (-1) | 0 (-1) | 0.000 (-1.000) | 46 (+15) | failed | 18.633 (+18.631) |
| 1be29d956a41／37530 | hard-quality-max | 1 (+0) | 1 (+0) | 1.000 (+0.000) | 32 (-6) | completed | 46.560 (+46.555) |
| ea079b7cbd51／37531 | hard-quality-max | 0 (+0) | 0 (+0) | 0.000 (+0.000) | 46 (-1) | failed | 2.320 (+2.319) |

## 工程驗證

- Rust 86 tests、Node overnight contract 11 tests、完整 `npm run typecheck`、新 Rust modules 的 rustfmt check 與 `git diff --check` 通過；`docs:check` 通過 60 份 Markdown。
- Release binary 與 diagnostic example 已建置。交付 smoke 的 2 個 candidate cases 與主比較的非計時結果一致，8-case observer 重播也已逐一核對。
- 原第六批封存 binary 與目前保留的 v0.30 路徑重播相同 100 cases，排除計時欄位後，全部 native 輸出一致。
- `--native-timeout-ms=1` 的邊界測試明示 `ETIMEDOUT`，沒有產生完成結果報告。
- 比較完成後整理程式排版並重建；交付 binary SHA-256 為 `bc1af3fdf5df118a1243e5e1a20796d5f29340aee2bc858ac56b46221b72bcf3`。比較 binary 與輸出保持原樣，source hashes 及驗證紀錄保存於 `evaluation-runs/v100-development/verification.json`。

Web、裝置、遊戲內實證及完整保留集採用評測屬後續驗收。此批實作已保存為 foundation checkpoint `7eeed3b`，後續進度由 current state 管理。

## Evidence 與重播

- 方向 checkpoint：`8995441`。
- Baseline：`generic-craft-specialist-resource-guard-v0.30.0`；Candidate：`generic-craft-route-portfolio-v1.0.0`。
- 主比較：`evaluation-runs/v100-development/balanced-e02-e09-final.json`，SHA-256 `f053661b9bc197b9b2a81ce9ece3939c711d67708ff0fd99f704d8471ed370c9`。
- 比較 binary：`ed75218c9b3edbb27ebbd7e19f688fa68be2c06088019771eada2c9df5bfa74e`；內容定址快照：`evaluation-runs/v100-development/artifacts/ed75218c9b3edbb27ebbd7e19f688fa68be2c06088019771eada2c9df5bfa74e/craft-kernel-generic-episode.exe`。
- 輸入 sidecars：主比較路徑後附 `.baseline.tsv`／`.candidate.tsv`。
- 專家 smoke：`evaluation-runs/v100-development/specialist-{stable|aggressive}-{36195|36206|37005|38200}.json`。
- 8-case 診斷：`evaluation-runs/v100-development/diagnostic-cases.tsv` 與 `diagnostics-final.tsv`；成功核對 8/8 outcomes。
- 初版：`evaluation-runs/v100-development/balanced-e02-e09-1seed.json`，完成 90、滿品質 56；binary identity 另存 `first-candidate-identity.json`。

已驗證的開發命令見 [commands.md](commands.md)。本次執行為有案例與時間上限的開發測試，完整 overnight 由使用者啟動。
