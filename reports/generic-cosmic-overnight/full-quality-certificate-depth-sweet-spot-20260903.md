# 滿品質 certificate 搜尋深度甜蜜點

`reviewed_at: 2026-09-03`

## 結論

在目前 native bounded evaluation 中，**五步是滿品質成果與計算成本的甜蜜點**。它相對四步在兩組獨立 base seed、共 8,000 個 paired cases 中增加 13 件滿品質與 9 件完工，兩者皆 0 paired loss；收益分散於 11 個 families、四套裝備與兩個 world。單次推薦 p95 為 76.378 ms，仍低於本機 100 ms，但已沒有足夠餘裕可直接宣稱目標裝置 fast-solver gate 通過。

六步在兩個 bounded screens、共 120 個 paired cases 中沒有增加滿品質或完工，p95 卻升至 1,261.978 ms、max 1,803.628 ms。它尚未超過主要求解器 3 秒硬上限，但只增加一步便使用約 42% 的整體預算，且沒有成果證據，因此不擴成完整 gate。七步 identity 只為 sweep 預先建立，沒有執行；不能稱為效果失敗，只能依六步的成本停止條件判定不值得繼續。

這是搜尋深度研究，不是 v2.1 採用。正式 Rust／Web policy 仍是三步的 `generic-craft-external-reference-v2.0.0`；五步保留描述性 identity，待 target-device WASM 成本與更廣 axes gate 後才能決定是否切換。

## 三至五步的同座標比較

兩組座標皆為 50 families × Balanced × E02／E03／E07／E09／E10 × `balanced-iid`／`normal-heavy-iid` × 8 seeds，base seed 分別為 `20260905` 與 `20261003`。四、五步重用同一批 case identities；五步 run 逐案例驗證歷史四步來源 hash，只執行 candidate arm。表中 latency 合併兩組 run 的全部 recommendation calls。

| 最大證明步數 | 完工 | 相對前一深度 | 滿品質 | 相對前一深度 | p50 | p95 | p99 | max |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3（v2.0 行為） | 6,896／8,000（86.2000%） | — | 6,031（75.3875%） | — | 0.095 ms | 0.288 ms | 0.418 ms | 1.249 ms |
| 4 | 6,906（86.3250%） | +10／−0 | 6,052（75.6500%） | +21／−0 | 0.781 ms | 4.706 ms | 5.989 ms | 17.617 ms |
| 5 | 6,915（86.4375%） | +9／−0 | 6,065（75.8125%） | +13／−0 | 6.597 ms | 76.378 ms | 94.588 ms | 149.104 ms |

三步增加到四步，滿品質增加 0.2625 percentage points；四步增加到五步，再增加 0.1625 points。五步相對正式三步合計為滿品質 +34／−0（+0.4250 points）、完工 +19／−0（+0.2375 points）。收益仍在增加，但邊際滿品質收益下降約 38%，而 p95 每增加一步都放大約 16 倍；繼續以相同暴力展開方式加深不合理。

## 四步到五步的分布

兩組 seed 合併後，五步相對四步為：

- family：11 正增、39 持平、0 負向；只有 F28 在兩組 seed 都各增加 1 件，其餘收益沒有集中在單一 family。
- equipment：E02 +4、E03 0、E07 +3、E09 +2、E10 +4；E03 持平，沒有裝備退步。
- world：`balanced-iid` +3、`normal-heavy-iid` +10；兩個 world 都正增。
- family × equipment × world：13 positive、487 flat、0 negative cells。
- 完工增益按相同維度檢查也沒有 aggregate 掩蓋的退步；總計 +9／−0。

依目前允許的交換規則，同一 cell 內可跨 seed 合併；本次沒有任何跨 family、equipment 或 world 的負向交換需要交由使用者裁決。

## 六步停止證據

六步只作成本與方向 screen，不與 8,000-case gate 混稱同級證據：

| Screen | Cases | 五步滿品質／完工 | 六步滿品質／完工 | 六步相對五步 | 五步 p95 | 六步 p95 | 六步 max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 families × E02 × 2 worlds × 1 seed | 20 | 19／19 | 19／19 | 0／0 | 73.624 ms | 1,328.712 ms | 1,736.578 ms |
| 10 families × 5 equipment × 2 worlds × 1 seed | 100 | 91／93 | 91／93 | 0／0 | 86.153 ms | 1,254.810 ms | 1,803.628 ms |
| 合併診斷 | 120 | 110／112 | 110／112 | 0／0 | 84.322 ms | 1,261.978 ms | 1,803.628 ms |

120 cases 無法證明六步永遠沒有新增滿品質；停止原因是「目前 0 收益證據，加上約 15 倍 p95 成本」，不是只看小樣本的 0 勝。若未來先完成搜尋剪枝、memoization 或 branch ordering，讓六步成本回到五步量級，才值得以新的效能 identity 重開。

## 身份與可重播證據

- 五步 identity：`generic-craft-external-reference-exp-full-quality-certificate-depth5`。
- 六步 identity：`generic-craft-external-reference-exp-full-quality-certificate-depth6`。
- 七步預備 identity：`generic-craft-external-reference-exp-full-quality-certificate-depth7`；沒有執行 evidence。
- release binary SHA-256：`a52f575d79e013a9557757eb5f39852ac4f6d7233a7b0db2f9c735fc597c66fc`。
- 五步 Gate A：`certificate-depth4-vs-depth5-5equipment-2world-20260905-s8`，config `969222bd2636b2fe0cb8365efb51be1122ff5e072fef2658c31d797700a58615`。
- 五步 Gate B：`certificate-depth4-vs-depth5-5equipment-2world-20261003-s8`，config `8a38cc287945b301f0563c2dd32734487fcd4f17d01d77985ac17ec80e43edb3`。
- 六步 E02 screen：`certificate-depth5-vs-depth6-f10-e02-2world-20261201-s1`，config `959b7b3528db8a216eb3e905360af2b00fa8f4171176b0f054023ce4f27fa777`。
- 六步跨裝備 screen：`certificate-depth5-vs-depth6-f10-5equipment-2world-20261202-s1`，config `2b4414ec9268f21c74375c38c449f545eb0de2cfad132ade7a6648b8b403db78`。

標準四表輸出另見 [Gate A](certificate-depth4-vs-depth5-5equipment-2world-20260905-s8.md) 與 [Gate B](certificate-depth4-vs-depth5-5equipment-2world-20261003-s8.md)。四表預設只展示 E02／E09，因此沒有完整顯示 E07／E10 的五步收益；跨五裝備與兩 world 的判讀以上述 completed shards 全量彙總為準。所有結果都是 synthetic／assumed-world development evidence，不是真實遊戲自然成功率。
