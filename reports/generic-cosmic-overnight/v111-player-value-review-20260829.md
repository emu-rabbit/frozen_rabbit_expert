# v1.11 玩家價值與 completion replay

`reviewed_at: 2026-08-29`

## 結論

v1.11 已經提供值得保留的能力：在 Balanced、食藥正式支援裝備與合理球色 worlds，一般收藏品完成率持平，完成成品的檔位淨上升 20.25 percentage points，滿品質增加 8.16 percentage points。主切片 E02／E09 × `balanced-iid` 的檔位淨上升為 14.21 points，滿品質增加 8.04 points。這不是只看平均品質的小幅變動，而是玩家會實際跨過獎勵檔位的結果。

目前不把同一套 v1.11 行為直接套到所有 optional-quality objective。HQ 有正回報但幅度較小；Master 的完成率大致守住，滿品質尾端則下降。最有效率的下一步是保留一般收藏品能力，讓 HQ／Master 依 objective kind 證明正回報，並補上通用 completion-aware 路線保護。

## Evidence 身份

- Run：`generic-native-v111-checkpoint-vs-v110-history-64seed-20260829`。
- Config fingerprint：`23018008b3b67b0a1c29241b34d21e1e04b7856cbdf3c405321ea85fc573ab9c`。
- Candidate：`generic-craft-route-portfolio-v1.11.0`；binary SHA256 `05da5f22463ff248663f975c432b8cecefd0cadf00dd0e37b4b0eaacb815769d`。
- Baseline：保存的 `generic-craft-route-portfolio-v1.1.0` 同案例 candidate rows。
- 完整度：150/150 shards；384,000 candidate episodes 與 384,000 baseline rows；0 illegal、0 policy-null。
- Evidence boundary：四個 worlds 都是 synthetic sensitivity assumptions；數字不是自然球色成功率。

## 玩家可感知算法

每個 family × equipment × risk × world × seed 先配對 v1.1／v1.11。未完成一律是 band 0；只有完成後才依 objective 分 band：

- 一般收藏品：交貨、100、300、700、滿品質。
- HQ：交貨、50%、75%、100% HQ 對應品質、滿品質。
- Master：交貨、滿品質；連續平均收藏價值只作輔助量尺。
- Hard-quality：必要品質與進展同時完成。

「上升／下降」是 paired band 遷移；淨變動為 `(上升 − 下降) / n`。滿品質率與完成率都以全部 seeds 為分母，因此不會把未完成案例隱藏在完成品平均中。

## Balanced 主切片

範圍：E02／E09 × `balanced-iid`。

| Objective | n | 完成 v1.1→v1.11 | 檔位上升／下降 | 檔位淨變動 | 滿品質 v1.1→v1.11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hard-quality | 1,792 | 1,197→1,197 | 0／0 | 0.00 pp | 1,197→1,197 |
| 一般收藏品 | 3,968 | 3,960→3,962 | 776／212 | **+14.21 pp** | 2,689→3,008（**+8.04 pp**） |
| HQ | 256 | 254→256 | 46／40 | +2.34 pp | 183→185（+0.78 pp） |
| Master | 384 | 384→382 | 48／58 | −2.60 pp | 190→182（**−2.08 pp**） |

一般收藏品已超過 active brief 的 5 pp practical-effect 門檻。Master 的平均收藏價值變動不足以抵銷滿品質尾端下降，因此不把它列為 v1.11 已證明的產品收益。

## Balanced 正式支援範圍

範圍：E02／E03／E05／E07／E09／E10 × `balanced-iid`／`normal-heavy-iid`／`opportunity-scarce-iid`。

| Objective | n | 完成 v1.1→v1.11 | 檔位上升／下降 | 檔位淨變動 | 滿品質 v1.1→v1.11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hard-quality | 16,128 | 5,067→5,067 | 0／0 | 0.00 pp | 5,067→5,067 |
| 一般收藏品 | 35,712 | 35,647→35,663 | 8,881／1,651 | **+20.25 pp** | 16,991→19,906（**+8.16 pp**） |
| HQ | 2,304 | 2,292→2,296 | 526／244 | **+12.24 pp** | 637→668（+1.35 pp） |
| Master | 3,456 | 3,436→3,447 | 195／199 | −0.12 pp | 567→553（−0.41 pp） |

這個結果支持以 v1.11 經驗繼續：一般收藏品的收益跨裝備與三個主要 worlds 重現；hard-quality／Stable 仍由 v1.1 提供精確基準。HQ 值得保留在三臂驗證；Master 先使用 v1.1 作通用 objective fallback，除非後續球色組能證明滿品質正回報。

## E09 `all-normal` completion replay

正式支援裝備的一般收藏品 `all-normal` 壓力世界整體仍有 3,056 上升、65 下降，滿品質增加 794；完成從 11,904 降為 11,887。完成損失集中於 F25／F26／F27 的 E09 Balanced：

| Family | E07 完成 | E09 完成 | E10 完成 | E09 completion-loss seeds |
| --- | ---: | ---: | ---: | --- |
| F25 | 64→64 | 64→58 | 64→64 | 4、15、31、45、54、56 |
| F26 | 64→64 | 64→58 | 64→64 | 28、29、33、35、59、63 |
| F27 | 64→64 | 64→59 | 64→64 | 0、6、7、29、49 |

17 個 E09 損失的 candidate 最終品質全部等於 `qualityMaximum=11,600`，卻在 `CP=1、耐久=0` 結束；這證明問題是滿品質後的完工路線選擇，不是品質能力不足，也不是高裝備 mechanics 真的比 E07 弱。

F25 seed 4 的 exact trace 在第 21 步開始分歧：

| Arm | 滿品質前的差異 | 滿品質後 | 結果 |
| --- | --- | --- | --- |
| v1.1 | `trainedFinesse` | `mastersMend` → `veneration` → 5× `basicSynthesis` | 31 步完成，滿品質 |
| v1.11 | `delicateSynthesis` | `manipulation` → 3 次失敗的 `rapidSynthesis`，中間插入 `finalAppraisal`／`observe` | 31 步失敗，滿品質但未交貨 |

在 v1.11 滿品質 state（progress 7,599／9,700、耐久 15、CP 106）中，portfolio 選擇 96 CP 的 `manipulation`，而不是已存在的高耐久完工路線。`CandidateEvidence` 已能區分 `NormalRoute`、`TerminalFailure` 與 `Unknown`；目前 final selection 只有「確定 terminal failure」的類別排除，其餘主要依 numeric `selection_score` 排序。下一個補救因此應直接使用 completion evidence 保護已找到的 funded route，不需要調整 family 或裝備權重。

## F50 action-limit replay

唯一相對 v1.1 新增的 action-limit 是 F50／E01／Balanced／`balanced-iid`／seed 53。E01 是弱裝備 best-effort，但合法非終局 state 不應空轉到 80 steps：

- v1.1：42 步完成，品質 24,260／26,300。
- v1.11：第 47 步後進展停在 4,866／7,400，第 58 步後品質停在 21,963；最後 22 步只在 `observe`、`tricksOfTheTrade`、`finalAppraisal`、`greatStrides` 間移動，最終耐久 5、CP 65、action-limit。

這個 state 仍有合法技能，且 v1.1 在同 tape 有正常完成路線。補救應把剩餘 action budget 納入 route evidence：接近上限時停止無產出的 condition／setup 交換，交給有進展的 established continuation 或 bounded best-effort，而不是等待 evaluator 截斷。

## 可重播命令

`--seed-index` 直接保留 canonical seed schedule，可在不先執行 0..N−1 的情況下取得同一 paired tape：

```powershell
npm run evaluate:native-generic-cosmic -- --preset=full --recipe=36985 --equipment=generic-i750-hq-five-meld-template-buffed-v1 --world=all-normal --seed-index=4 --candidate-risk=balanced --baseline-solver=generic-craft-route-portfolio-v1.1.0 --candidate-solver=generic-craft-route-portfolio-v1.11.0 --trace --max-episodes=2 --compact --output=.tmp/v111-f25-e09-all-normal-seed4-trace.json
```

```powershell
npm run evaluate:native-generic-cosmic -- --preset=full --recipe=38200 --equipment=player-unbuffed-cosmic-tool-v1 --world=balanced-iid --seed-index=53 --candidate-risk=balanced --baseline-solver=generic-craft-route-portfolio-v1.1.0 --candidate-solver=generic-craft-route-portfolio-v1.11.0 --trace --max-episodes=2 --compact --output=.tmp/v111-f50-e01-balanced-seed53-trace.json
```

下一個 implementation checkpoint 以這兩個 exact tapes 作因果驗證，再用未參與修改的 supported bounded matrix 檢查至少保留 v1.11 一般收藏品收益的 80%。
