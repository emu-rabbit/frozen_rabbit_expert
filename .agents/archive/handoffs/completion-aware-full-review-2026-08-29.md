<!-- doc-status: archived -->

> 本檔保存 completion-aware 完整 overnight 在結果出現前固定的判讀契約；目前方向請讀 [active brief](../../overnight_review_brief.md)。

# Completion-aware 完整確認簡報

`last_updated: 2026-08-29`

本輪要確認：completion-aware 候選能否在完整正式支援矩陣守住 v1.11 的基本解題能力與至少 80% 的主要收益，並證明 condition-specific proposals 對一般玩家有足夠大的完成後檔位價值。Bounded gate、exact-tape 修正與成本見 [completion-aware review](../../../reports/generic-cosmic-overnight/v111-completion-aware-bounded-review-20260829.md)；v1.11 原始四表見 [完整 overnight output](../../../reports/generic-cosmic-overnight/generic-native-v111-checkpoint-vs-v110-history-64seed-20260829.md)。

## Overnight 比較身份

完整 overnight 固定 64 seeds，只包含兩個 arm：

1. **基本基準**：`generic-craft-route-portfolio-v1.1.0`，代表已站穩的通用基本解題能力。
2. **Completion-aware 候選**：`generic-craft-route-portfolio-exp-completion-aware`，保留九球色機會提案與 funded routes，並以當前 state 的 bounded completion evidence 保護完工能力。

球色機會消融 `generic-craft-route-portfolio-exp-condition-opportunity-ablation` 不進入 overnight。它與候選共用 mechanics、完成保護及 established continuation，只關閉 condition-specific proposal／coordination；現有 bounded paired evidence 用來判斷讀球的邊際價值。若完整 overnight 通過後，這項歸因仍會實質影響採用決策，才由使用者決定是否另跑小型直接消融；不為它增加第二個完整 overnight。v1.11 的既有結果只作同 corpus 歷史收益參考，不再執行額外 arm。

v1.1 沿用已完成的 `generic-native-v110-perf-vs-v030-64seed-20260827` candidate rows，不重新計算。該 source 為 150/150 completed shards，且與本輪的 64 seeds、base seed 20260824、3 risks、10 equipment、4 worlds、mechanics、ABI 及 case identity 通過 runner preflight；本輪只新執行 384,000 completion-aware episodes。歷史與本次的製作結果可 same-tape 配對，歷史 wall-clock／latency 不作同負載效能比較。

## 玩家切片與量尺

- **預設決策**：Balanced。
- **主戰裝備**：E02／E09；E03／E10 顯示專家能力，E05／E07涵蓋合理鑲嵌差異。這些 profile 均以食物與藥為正式支援情境；未食藥或明顯不足裝備只作 best-effort 壓力證據。
- **主要世界**：`balanced-iid`、`normal-heavy`、`opportunity-scarce`。`all-normal` 用來找結構性缺陷，不作自然球色成功率或主要產品收益 gate。
- **一般收藏品**：只計算已完成製作的 100／300／700／滿品質檔位遷移；未完成但品質較高不算玩家收益。
- **HQ／Master**：先看完成，再看滿品質尾端；沒有跨檔或滿品質改善的小幅平均增加不能抵銷滿品質明顯下降。
- **Hard-quality**：完成即代表必要品質達標。F36／F46 需在最強正式支援裝備維持非零達成並接受一次通用改善研究，不要求在本輪磨成高成功率。
- **成本**：每步主要求解器低於 3 秒是玩家 gate；總 overnight 時間與計算倍率是研究成本，用來判斷收益是否值得，不取代玩家結果。

## 已通過的 bounded gate

- F25／F26／F27 共 17 個滿品質未交貨 tapes 全數恢復為滿品質完成；F44 兩個新 seed 完成缺口及 F50 action-limit 也已修正。
- E02／E09 × Balanced × 三個主要 worlds × 50 families 的未見 seed 小矩陣為 0 illegal、0 policy-null、0 action-limit，候選相對 v1.11 完成持平。
- 一般收藏品相對球色機會消融的完成後檔位淨上升 5.38 pp，完成不退；相對 v1.11 的檔位／滿品質跨 corpus 保留率 proxy 為 89.4%／93.4%。
- 完整矩陣需確認上述結果能跨正式支援裝備重現，並分開判讀檔位與滿品質尾端。

## 執行與判讀順序

1. 由使用者依 [overnight workflow](../../workflows/run-generic-overnight-evaluation.md) 啟動 completion-aware 候選相對 v1.1 歷史 source 的完整 run：3 risks × 50 families × 10 equipment × 4 worlds × 64 seeds，只執行 384,000 candidate episodes。
2. 先判讀 Balanced × `balanced-iid` × E02／E09，再看全部正式支援裝備與三個主要 worlds；family × equipment × risk × world 分開呈現。
3. 一般收藏品分別計算已完成檔位、滿品質與完成率；HQ／Master 驗證 v1.1 fallback，hard-quality／Stable 驗證既有安全基準。
4. 完整 overnight 與既有 bounded condition evidence 都符合接受條件後，才建立新數字版號，接續 hard-quality 通用改善與 Web runtime 採用。只有歸因證據仍不明朗時，才另行提出非 overnight 的小型消融供使用者決定。

## 本次 overnight 的關鍵觀察

1. **先守住玩家結果**：完整 candidate run 相對 v1.1 檢查完成、已完成檔位、滿品質、illegal、policy-null 與 action-limit。任何主戰切片的完成缺口先作 exact-tape replay，不由 aggregate 品質收益抵銷。
2. **只把直接消融差額歸因於球色機會**：completion-aware 候選相對球色機會消融的 bounded paired 差額，才回答 condition-specific proposal／coordination 的邊際價值。消融不進入 64-seed overnight；它也不負責重新驗證全部 risk 與安全矩陣。
3. **一般收藏品分開看檔位與滿品質**：bounded gate 已看到完成後檔位 +5.38 pp，但滿品質 −1.08 pp。完整 run 必須確認檔位效果跨裝備與主要 worlds 重現，並獨立判斷滿品質尾端，不能以平均品質合併成單一正向結論。
4. **保留率用同一 corpus 計算**：completion-aware 候選直接相對 v1.1 的一般收藏品收益，與 v1.11 在同案例的收益相比，至少保留 80%；bounded 的 89.4%／93.4% 只作先驗 proxy。
5. **裝備投入必須有合理回報**：Balanced 主戰 E09 不得系統性弱於 E02；E10 的專家投入另列，確認額外面板與技能能力沒有反向。`all-normal` 只診斷結構，不代表自然成功率。
6. **Hard-quality 是精確防退步切片**：overnight 兩臂目前都對 hard-quality 使用 v1.1。F36／F46 與其他 12 個 hard-quality families 應逐案例相同；任何差異都代表 routing、identity 或 evidence 問題，不解讀為本輪策略收益。

## 接受條件

- 0 illegal、0 valid-nonterminal policy-null、0 新增 action-limit；mechanics 與必要品質正確性不容效果平均抵銷。
- Completion-aware 候選相對球色機會消融的 bounded paired evidence，在主切片的已完成檔位淨上升或滿品質率至少有一項達到 5 percentage points，完成率下降不超過 0.5 percentage points；現有結果為檔位 +5.38 pp、完成持平。
- Completion-aware 候選相對 v1.1，在同一完整 corpus 保留至少 80% 的 v1.11 一般收藏品主要可感知收益。
- 主戰高裝備不得因同一通用 policy 系統性弱於較低正式支援裝備；`all-normal` 的個別壓力交換可存在，但必須有可解釋的 state／route 原因。
- HQ／Master 的滿品質尾端不得用未跨檔的平均品質小增幅交換。若共同球色策略在某 objective 沒有正回報，允許以 objective kind 選回 v1.1；這是通用能力邊界，不是配方特例。
- Stable 與 hard-quality 保持 v1.1 的既有安全基準，除非另有事前定義且更好的通用實驗。

完整矩陣通過時，候選取得數字版號並成為 Web 採用基礎；未通過時，以 family／objective／world 的玩家可見差異定位是否有一個小範圍通用修正。沒有明確產品回報的假說不以擴大 seeds 延長。

## 完整確認後的 F36／F46 研究入口

F36 與 F46 是目前 hard-quality 能力尾端；下列數字來自 v1.1／v1.11 共用的 Balanced × `balanced-iid` × 64 synthetic seeds，不是真實自然成功率：

| Family | 進展／必要品質 | E02 食藥 | E09 i750 五鑲嵌食藥 | E10 E09＋專家 |
| --- | ---: | ---: | ---: | ---: |
| F36 宇宙素材的樹脂球 | 12,000／32,300 | 3/64（4.7%） | 13/64（20.3%） | 24/64（37.5%） |
| F46 俄匊斯生物焦炭 | 12,500／33,500 | 0/64 | 1/64（1.6%） | 8/64（12.5%） |

F36 已形成可重播的成功邊界；F46 在最強正式支援裝備維持非零達成，但仍是主要能力缺口。研究使用以下可觀測訊號，不建立 family ID patch：

1. **成功與 near-miss exact tapes**：F36／E10／Balanced 以成功 seed 0 對照 seed 53；後者已達 12,000 進展、品質 31,846／32,300，只差 454。F46／E10 以成功 seed 15 對照 seed 21；後者為 12,499／12,500 進展、31,104／33,500 品質。先比較實際 condition、技能、buff、CP 與耐久消耗，再提出策略。
2. **進展 bank 與品質資源的平衡**：大量未完成 state 停在 11,999／12,000 或 12,499／12,500，且 CP 與耐久耗盡。這支持最終確認（Final Appraisal，`finalAppraisal`）式進展 bank 已發揮作用；優先研究前中段的品質／進展／資源配置，不把末段加深搜尋當成第一選擇。
3. **Condition-set 的延遲價值**：F36 的隨機集合含好兆頭（Good Omen）而不含高耐久（Robust）；F46 含高耐久而不含好兆頭。驗證目前 forecast 是否能把好兆頭帶來的高品質機會，以及高耐久→結實（Sturdy）的多步耐久價值，放進同一 resource-aware route 比較。
4. **專家收益拆分**：E09→E10 的完成增幅在 F36 為 13→24、F46 為 1→8。以「只有 +20 作業／+20 加工／+15 CP」與「同面板＋專家技能」兩個通用 profile 拆開，判斷收益來自面板還是 specialist action routing。
5. **Risk 反應**：F36 會由 Balanced／Aggressive 明顯受益；F46 的 Aggressive 尚未高於 Balanced。只有 condition set、recipe mechanics、crafter capability 與 state 可作 selector，並以新 seeds 確認風險交換，不以 F36／F46 identity 選路。

第一輪只允許一個小範圍通用能力，先在上述 exact tapes 證明因果，再用 E02／E09／E10 × 三個主要 worlds 的全部 14 個 hard-quality families 做 bounded gate。接受條件為 F36／F46 的完成有可觀提升、其他 hard-quality 不退、0 illegal／policy-null／新增 action-limit，且單步仍低於 3 秒。若沒有明確回報，保存非零資格與重播證據，停止擴大 beam、depth 或 seeds，轉入 Web 主線。
