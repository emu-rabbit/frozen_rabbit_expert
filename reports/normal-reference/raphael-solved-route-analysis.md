# Raphael 已完成路線研究

本報告只研究 412 組 `optimal` 且本地逐招重播一致的全通常球固定路線。9 組 interrupted incumbent 與 79 組未取得可重播路線不混入主樣本。Raphael 不使用隨機技能或球色反應，因此這是穩定基本功參考，不是有球色世界的策略上限。

## 可直接判讀的結果

- 路線長度平均 24.4 招，p10／中位／p90 為 17／25／31 招。
- 結束時 CP 平均 18.2，耐久中位 -5；這表示好路線不是單純把每項資源耗到零，而是讓剩餘資源無法再換成更高品質。
- 本地通用完整路線探針相對 Raphael 的加總 Q 為 93.4%；逐格中位 92.9%，低於 80% 有 10 格、低於 90% 有 129 格。

這個差距可用來找基本功缺口，但不能直接變成 runtime 策略：探針知道整段未來都是通常球，而且一次搜尋完整路線；產品求解器每一步都要接受玩家回報的新球色與實際技能成敗。

## 目標類型差距

| 目標 | 格數 | 加總 Q 比 | 逐格 p10 | 逐格中位 | <80% | <90% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| hard-quality-max | 115 | 91.5% | 80.2% | 91.8% | 9 | 46 |
| collectability-tiers | 257 | 94.4% | 85.2% | 93.6% | 1 | 72 |
| hq-chance | 16 | 89.7% | 83.8% | 88.2% | 0 | 10 |
| continuous-collectability | 24 | 93.0% | 90.6% | 92.8% | 0 | 1 |

## 裝備壓力差距

| 裝備 | 格數 | 加總 Q 比 | 逐格 p10 | 逐格中位 | <80% | <90% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| E01 | 50 | 92.4% | 85.2% | 91.6% | 2 | 23 |
| E02 | 50 | 94.5% | 88.5% | 93.4% | 0 | 8 |
| E03 | 10 | 98.2% | 91.0% | 100.0% | 0 | 0 |
| E04 | 50 | 89.5% | 80.0% | 86.9% | 4 | 30 |
| E05 | 49 | 92.3% | 83.8% | 92.0% | 0 | 16 |
| E06 | 50 | 91.6% | 80.3% | 90.6% | 4 | 24 |
| E07 | 49 | 92.7% | 86.5% | 92.5% | 0 | 15 |
| E08 | 50 | 93.5% | 87.2% | 93.0% | 0 | 12 |
| E09 | 45 | 95.4% | 91.8% | 94.3% | 0 | 1 |
| E10 | 9 | 99.3% | 96.2% | 100.0% | 0 | 0 |

## Raphael 路線結構

最常見開場：

- `reflect`：237/412
- `muscleMemory`：172/412
- `quickInnovation`：3/412

最常見相鄰結構：

- `greatStrides → byregotsBlessing`：407 次
- `veneration → groundwork`：373 次
- `groundwork → groundwork`：362 次
- `basicTouch → standardTouch`：358 次
- `delicateSynthesis → delicateSynthesis`：338 次
- `standardTouch → advancedTouch`：321 次
- `innovation → preparatoryTouch`：242 次
- `greatStrides → innovation`：226 次
- `innovation → prudentTouch`：224 次
- `trainedPerfection → veneration`：204 次
- `preparatoryTouch → preparatoryTouch`：197 次
- `observe → advancedTouch`：194 次
- `advancedTouch → greatStrides`：190 次
- `innovation → delicateSynthesis`：182 次
- `immaculateMend → innovation`：171 次

## 技能配置差距

每格平均使用次數；「低比格」是本地探針低於 Raphael 80%，「高比格」是至少 95%。後兩欄只描述 Raphael 的路線，協助辨認真正困難案例依賴什麼。

| 技能 | Raphael | 本地探針 | 低比格 Raphael | 高比格 Raphael |
| --- | ---: | ---: | ---: | ---: |
| `prudentTouch` | 1.04 | 2.51 | 1.00 | 0.78 |
| `groundwork` | 2.28 | 2.86 | 3.40 | 1.49 |
| `preparatoryTouch` | 1.21 | 0.66 | 0.10 | 3.19 |
| `carefulSynthesis` | 1.35 | 0.96 | 1.60 | 0.42 |
| `greatStrides` | 1.65 | 1.28 | 1.00 | 2.19 |
| `refinedTouch` | 0.40 | 0.05 | 1.00 | 0.04 |
| `wasteNot` | 0.22 | 0.57 | 0.50 | 0.10 |
| `advancedTouch` | 1.27 | 0.93 | 0.40 | 0.96 |
| `innovation` | 2.54 | 2.80 | 1.50 | 2.62 |
| `observe` | 0.47 | 0.24 | 0.20 | 0.36 |
| `muscleMemory` | 0.42 | 0.20 | 0.60 | 0.35 |
| `delicateSynthesis` | 2.10 | 2.32 | 2.40 | 1.56 |
| `reflect` | 0.58 | 0.79 | 0.40 | 0.65 |
| `wasteNot2` | 0.24 | 0.05 | 0.20 | 0.46 |
| `manipulation` | 0.69 | 0.50 | 0.90 | 0.61 |
| `standardTouch` | 0.88 | 0.75 | 0.40 | 0.57 |
| `basicSynthesis` | 0.42 | 0.54 | 0.40 | 0.29 |
| `immaculateMend` | 0.83 | 0.95 | 0.50 | 0.64 |
| `veneration` | 1.66 | 1.77 | 2.00 | 0.77 |
| `basicTouch` | 1.32 | 1.24 | 1.40 | 0.68 |

## 可泛化的開發判定

- 先補「完整通常球路線」的產品級表示：路線需保存剩餘 action queue、每步驗證合法性，遇到球色或技能成敗後可以局部修補或放棄，而不是每步重跑整套 beam。
- 球色決策應比較「利用球色的即時收益」與「破壞既有路線的機會成本」。例如 Pliant 的長期儉約／掌握不是固定優先，而是只有節省的 CP 能在剩餘路線轉成更多品質、且不錯過更高價值窗口時才插入。
- 低尾案例比平均值更重要。下一個候選要在相同 family × equipment × objective 上證明低於 80% 的格數下降，並在有球色 paired seeds 中不輸現有策略；只提高加總 Q 不足以採用。
- 這份分析不支持把 Raphael 路線硬編成配方或裝備 ID 規則。可採用的訊號是剩餘 CP／耐久／進展、buff window、IQ、品質目標與當前球色。
