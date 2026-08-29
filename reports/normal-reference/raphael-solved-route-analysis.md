# Raphael 已完成路線研究

本報告研究加時重試後的 495 組 `optimal` 且本地逐招重播一致的全通常球固定路線。其餘 5 組 interrupted incumbent 另保留作可重播參考，不混入最佳解比率。Raphael 不使用隨機技能或球色反應，因此這是穩定基本功參考，不是有球色世界的策略上限。

## 可直接判讀的結果

- 路線長度平均 25.2 招，p10／中位／p90 為 17／25／32 招。
- 結束時 CP 平均 15.9，耐久中位 -5；這表示好路線不是單純把每項資源耗到零，而是讓剩餘資源無法再換成更高品質。
- 本地通用完整路線探針相對 Raphael 的加總 Q 為 93.5%；逐格中位 92.9%，低於 80% 有 10 格、低於 90% 有 142 格。
- 食藥主戰裝備共 295 格，加總 Q 比 94.2%，逐格 p10 88.4%；低於 80% 為 0 格。

這個差距可用來找基本功缺口，但不能直接變成 runtime 策略：探針知道整段未來都是通常球，而且一次搜尋完整路線；產品求解器每一步都要接受玩家回報的新球色與實際技能成敗。

## 目標類型差距

| 目標 | 格數 | 加總 Q 比 | 逐格 p10 | 逐格中位 | <80% | <90% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hard-quality-max | 140 | 91.7% | 80.8% | 91.7% | 9 | 53 |
| collectability-tiers | 305 | 94.6% | 86.0% | 93.7% | 1 | 77 |
| hq-chance | 20 | 90.3% | 83.8% | 90.0% | 0 | 10 |
| continuous-collectability | 30 | 92.7% | 90.3% | 92.8% | 0 | 2 |

## 裝備壓力差距

| 裝備 | 格數 | 加總 Q 比 | 逐格 p10 | 逐格中位 | <80% | <90% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| E01 | 50 | 92.4% | 85.2% | 91.6% | 2 | 23 |
| E02 | 50 | 94.5% | 88.5% | 93.4% | 0 | 8 |
| E03 | 47 | 93.6% | 88.9% | 91.6% | 0 | 9 |
| E04 | 50 | 89.5% | 80.0% | 86.9% | 4 | 30 |
| E05 | 50 | 92.4% | 83.8% | 92.0% | 0 | 16 |
| E06 | 50 | 91.6% | 80.3% | 90.6% | 4 | 24 |
| E07 | 50 | 92.8% | 86.5% | 92.5% | 0 | 15 |
| E08 | 50 | 93.5% | 87.2% | 93.0% | 0 | 12 |
| E09 | 50 | 95.8% | 91.8% | 94.9% | 0 | 1 |
| E10 | 48 | 95.2% | 90.4% | 95.8% | 0 | 4 |

## Raphael 路線結構

最常見開場：

- `reflect`：252/495
- `muscleMemory`：190/495
- `quickInnovation`：53/495

最常見相鄰結構：

- `greatStrides → byregotsBlessing`：481 次
- `groundwork → groundwork`：477 次
- `basicTouch → standardTouch`：462 次
- `veneration → groundwork`：449 次
- `standardTouch → advancedTouch`：424 次
- `delicateSynthesis → delicateSynthesis`：392 次
- `innovation → preparatoryTouch`：318 次
- `greatStrides → innovation`：310 次
- `innovation → prudentTouch`：269 次
- `preparatoryTouch → preparatoryTouch`：249 次
- `observe → advancedTouch`：240 次
- `trainedPerfection → veneration`：239 次
- `innovation → delicateSynthesis`：225 次
- `advancedTouch → greatStrides`：223 次
- `immaculateMend → innovation`：217 次

## 技能配置差距

每格平均使用次數；「低比格」是本地探針低於 Raphael 80%，「高比格」是至少 95%。後兩欄只描述 Raphael 的路線，協助辨認真正困難案例依賴什麼。

| 技能 | Raphael | 本地探針 | 低比格 Raphael | 高比格 Raphael |
| --- | ---: | ---: | ---: | ---: |
| `prudentTouch` | 1.03 | 2.62 | 1.00 | 0.69 |
| `preparatoryTouch` | 1.33 | 0.70 | 0.10 | 3.36 |
| `groundwork` | 2.34 | 2.92 | 3.40 | 1.84 |
| `greatStrides` | 1.74 | 1.31 | 1.00 | 2.26 |
| `wasteNot` | 0.21 | 0.58 | 0.50 | 0.10 |
| `advancedTouch` | 1.36 | 1.00 | 0.40 | 0.86 |
| `carefulSynthesis` | 1.26 | 0.91 | 1.60 | 0.35 |
| `refinedTouch` | 0.34 | 0.05 | 1.00 | 0.04 |
| `innovation` | 2.63 | 2.93 | 1.50 | 2.59 |
| `observe` | 0.48 | 0.25 | 0.20 | 0.30 |
| `wasteNot2` | 0.27 | 0.05 | 0.20 | 0.54 |
| `muscleMemory` | 0.38 | 0.19 | 0.60 | 0.37 |
| `reflect` | 0.62 | 0.80 | 0.40 | 0.63 |
| `manipulation` | 0.70 | 0.52 | 0.90 | 0.64 |
| `basicSynthesis` | 0.38 | 0.54 | 0.40 | 0.25 |
| `delicateSynthesis` | 2.06 | 2.20 | 2.40 | 1.60 |
| `standardTouch` | 0.94 | 0.81 | 0.40 | 0.53 |
| `immaculateMend` | 0.87 | 1.00 | 0.50 | 0.68 |
| `veneration` | 1.66 | 1.75 | 2.00 | 0.84 |
| `trainedFinesse` | 0.36 | 0.42 | 0.00 | 0.27 |

## 可泛化的開發判定

- 先補「完整通常球路線」的產品級表示：路線需保存剩餘 action queue、每步驗證合法性，遇到球色或技能成敗後可以局部修補或放棄，而不是每步重跑整套 beam。
- 球色決策應比較「利用球色的即時收益」與「破壞既有路線的機會成本」。例如 Pliant 的長期儉約／掌握不是固定優先，而是只有節省的 CP 能在剩餘路線轉成更多品質、且不錯過更高價值窗口時才插入。
- 低尾案例比平均值更重要。下一個候選要在相同 family × equipment × objective 上證明低於 80% 的格數下降，並在有球色 paired seeds 中不輸現有策略；只提高加總 Q 不足以採用。
- 這份分析不支持把 Raphael 路線硬編成配方或裝備 ID 規則。可採用的訊號是剩餘 CP／耐久／進展、buff window、IQ、品質目標與當前球色。
