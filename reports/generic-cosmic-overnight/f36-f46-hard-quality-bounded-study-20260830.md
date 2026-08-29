# F36／F46 hard-quality bounded study

`reviewed_at: 2026-08-30`

## 結論

本輪沒有建立新的 Rust candidate，也沒有新增 solver 版號。F36／F46 的 E10 優勢確實主要涉及 specialist capability，但 four exact tapes 沒有指出一個能同時改善兩者、又不傷既有成功案例的通用決策。直接切回舊 portfolio 可以救回一個 F36 near-miss，卻會把既有 F46 success 變成 failure；依事前停止條件，這條 hard-quality 假說在 candidate gate 前結束，主線轉入 Web runtime 採用。

這不是「hard-quality 已解決」。v1.12 仍精確沿用 v1.1 的 hard-quality 行為；F36／F46 仍是發布前必須如實暴露的弱 family。

## 方法與證據界線

- Baseline：`generic-craft-route-portfolio-v1.12.0`，Balanced、`balanced-iid`、E10 specialist 裝備。
- Exact tapes：F36 recipe 37006 的 success seed 0／near-miss seed 53；F46 recipe 37531 的 success seed 15／near-miss seed 21。
- E09→E10 拆解在同一組 64 條 E10 condition tapes 上，只改 crafter 輸入：E09 面板、E10 面板但關閉 specialist、E10 面板並開放 specialist。
- 這些是 synthetic same-tape mechanics 診斷，不是 catalog 裝備身份、玩家成功率或 live condition 機率估計。
- 舊 v1.3 與 condition-route experiment 只作反證；它們不是新 candidate。

## Exact-tape 判讀

| Family／seed | v1.12 結果 | 代表意義 |
| --- | --- | --- |
| F36／0 | 完成；46 actions，12,000／12,000 進展，32,300／32,300 品質，CP 32，耐久 7 | 後段保留 60 CP 與 27 耐久，在改革＋闊步後以兩次專心觀察等到高品質，再用比爾格的祝福滿品質並完成。 |
| F36／53 | 失敗；61 actions，12,000 進展，31,846 品質，CP 0，耐久 −5 | 只差 454 品質，但前中段已消耗專家資源；末段的實際球序容許某些較冒險 cashout，不代表當時資訊下存在確定的通用 suffix。 |
| F46／15 | 完成；42 actions，12,500／12,500 進展，33,500／33,500 品質，CP 30，耐久 −5 | 高耐久／結實球序提供多次可支付品質與耐久機會；最後高品質上的比爾格的祝福封頂。 |
| F46／21 | 失敗；50 actions，12,499 進展，31,104 品質，CP 0，耐久 −9 | 三次專心觀察仍未等到高品質，末段已用完專家工具；差 2,396 品質，不是單靠 E10 面板小幅增益可補足。 |

F36 success／miss 與 F46 success／miss 都高度依賴實際 condition tail，但兩個 family 沒有共同呈現「某一個當時可觀測訊號被一致低估」的局部錯誤。F36 near-miss 的某條事後 route 能成功，是 fixed-tape route existence，不足以證明 live selector 應在未知下一球時採用。

## E09→E10 capability 拆解

### F36，64 shared tapes

| Arm | 完成 | 相對前 arm 的 paired wins／losses | 判讀 |
| --- | ---: | ---: | --- |
| E09 面板、非 specialist | 7／64 | — | 基準。 |
| E10 面板、非 specialist | 12／64 | 9／4，淨 +5 | +20 作業／+20 加工／+15 CP 有實質但不單調的收益。 |
| E10 面板、specialist | 24／64 | 15／3，淨 +12 | specialist routing 是較大的增量，但個別 tapes 仍會交換勝負；另有 1 個既存 action-limit。 |

E10 specialist arm 在 64 tapes 合計使用 292 次 specialist actions。這支持「specialist 能力重要」，不支持「現行 policy 沒有使用 specialist 能力」。

### F46，64 shared tapes

| Arm | 完成 | 相對前 arm 的 paired wins／losses | 判讀 |
| --- | ---: | ---: | --- |
| E09 面板、非 specialist | 0／64 | — | 基準。 |
| E10 面板、非 specialist | 0／64 | 0／0 | 面板增益在這批 tapes 完全沒有形成完成。 |
| E10 面板、specialist | 8／64 | 8／0 | 全部完成增益都由 specialist capability 打開；0 action-limit。 |

E10 specialist arm 合計使用 350 次 specialist actions。F46 的瓶頸不是面板數值，而是只有少數球序能讓 specialist no-step／resource 工具轉成足夠的品質與完工路線。

## 舊 route 反證

在 four exact tapes 上直接比較既有研究 identity：

| Candidate | F36 seed 0 | F36 seed 53 | F46 seed 15 | F46 seed 21 |
| --- | --- | --- | --- | --- |
| v1.3 | 保持完成 | **救回完成** | **由完成退步為失敗** | 仍失敗 |
| condition-route experiment | 保持完成 | 仍失敗 | **由完成退步為失敗** | 仍失敗 |

v1.3 證明 F36 seed 53 存在另一條可成功 route，也同時重現先前「hard-quality 全面改接較新 portfolio 會退步」的核心問題。若用 family／recipe ID 只替 F36 開啟 v1.3，會違反通用 selector 契約；目前也沒有 mechanics／state signal 能在事前可靠區分「應救 F36」與「會害 F46」。

## 決策

1. 不建立描述性 candidate，因此不啟動 14 families × E02／E09／E10 × 三 worlds 的 promotion gate；擴 seeds 不能補上缺少的 causal selector。
2. v1.12 hard-quality 行為保持不變，不把單一 rescued tape 寫成版本能力。
3. 保存 F36／F46 弱點及 specialist capability 診斷，供未來新的 mechanics／objective／state signal 出現時重開研究。
4. 依 roadmap 轉入 Web 核心比較與 runtime 採用；solver 可在 Web 開發後繼續改善。
