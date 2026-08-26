<!-- doc-status: archived -->

> **歷史量尺。** 本文件只涵蓋舊五配方與舊 TypeScript policy，不代表目前 432 配方、Rust solver 或發布條件。

# 跨配方 Solver 成長量尺

## 文件責任

`last_verified: 2026-08-13`

本文件是五個現有配方、三套固定玩家裝備、所有已發布 recipe-policy 版本的共同 operational scorecard owner。它回答「同一個目前 mechanics／data 量尺下，solver 從舊版到現版有沒有成長」，並保存未成長、trade-off 與成本下降；不取代各配方的 frozen validation、reserved-final promotion corpus、玩家實戰 trace 或真實 condition transition model。

對應可重跑 owner：

- release registry：`tools/evaluate-solver-scorecard/registry.ts`；
- evaluator：`tools/evaluate-solver-scorecard/index.ts`；
- registry guard：`tests/solverScorecardRegistry.test.ts`；
- 完整指令：`npm run evaluate:solver-scorecard -- --output .tmp/solver-scorecard-v1.json`。

## 量尺定義

### Normalized historical replay

每個舊版本都從首次發布該 recipe-policy identity 的 commit 取回當時的：

- `guideIntegratedPolicy.ts`；
- `finisherCertificate.ts`；
- `boundedRiskFinisher.ts`；
- `policySafety.ts`；
- solver `types.ts`。

這些 release source 統一在目前 checkout 的 recipe、objective、domain mechanics 與三套裝備上重播，並使用 common random numbers。這能隔離 solver 成長與舊報表 corpus 差異，但不是舊網站 binary、舊 bundle 或舊 mechanics 的歷史重現。

### 三套裝備

| 縮寫 | Profile | 面板 |
| --- | --- | --- |
| U | `player-unbuffed-cosmic-tool-v1` | `5408／5140／630`、宇宙工具 ON、非專家 |
| F | `player-food-medicine-cosmic-tool-v1` | `5408／5237／749`、宇宙工具 ON、非專家 |
| S | `player-food-medicine-specialist-cosmic-tool-v1` | `5428／5257／764`、宇宙工具 ON、專家 |

### 色球權重

每個 `recipe × policy version × equipment` 固定 `72` episodes：

- `64` 場 practical-primary，占 `88.9%`；
- 兩個較嚴格 assumed profile 各 `4` 場，合計只占 `11.1%`；
- 全矩陣為 `14 policy releases × 3 equipment × 72 = 3024` episodes。

| Recipe family | Primary 64 場 | Stress 4＋4 場 | 全量尺 modeled colored share |
| --- | --- | --- | ---: |
| 宇宙鈦鐵錠／釘 | 玩家 Observe 95 球 empirical IID marginal；有色球 `59／95=62.1%` | normal-heavy、resource-scarce | `58.8%` |
| 硬化木板／腳手架 | balanced 七球 assumption；有色球 `6／7=85.7%` | normal-heavy、resource-scarce | `79.9%` |
| 巨匠藥 | balanced 三球 assumption；有色球 `2／3=66.7%` | normal-heavy、Good-scarce／Malleable-stress | `61.2%` |

這個權重依玩家「實戰有色球占大多數，過難色球題不應主導總評」的判斷建立。錠／釘的 primary 有一份 empirical marginal；其他配方仍只有 assumption sensitivity。所有 sampling 都是 IID，不是自然 transition matrix，也不是實戰成功率。Good Omen 的 forced Good 仍由 mechanics transition 處理，不由 IID weights 覆寫。

## 2026-08-13 完整結果

全數 `42` cells 都有 `72` episodes；總計 `0` safety violation、`0` illegal-action、`0` no-legal-action、`0` action-limit。`policy-null` 是失敗，完整保留在 denominator。

### 宇宙鈦鐵錠

`Valid` 必須同時滿作業與必要品質。完成件品質必為 `18900`。`Primary／stress` 顯示 valid completion 的拆分；`Specialist` 是三種專家技能呼叫總數，不是圖紙消耗量。

| Version | Gear | Valid／72 | Primary／64 | Stress／8 | Policy-null | Specialist |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| v1.0.0 | U | 9 | 9 | 0 | 63 | 0 |
| v1.0.0 | F | 41 | 41 | 0 | 31 | 0 |
| v1.0.0 | S | 46 | 45 | 1 | 26 | 30 |
| v1.1.0 | U | 8 | 8 | 0 | 64 | 0 |
| v1.1.0 | F | 40 | 40 | 0 | 32 | 0 |
| v1.1.0 | S | 46 | 45 | 1 | 26 | 24 |
| **v1.2.0** | **U** | **8** | **8** | **0** | **64** | **0** |
| **v1.2.0** | **F** | **40** | **40** | **0** | **32** | **0** |
| **v1.2.0** | **S** | **46** | **45** | **1** | **26** | **24** |

目前 v1.2.0 對首版的 objective-specific paired W／L／T 是 `12／13／191`，總 valid completion `96→94`。這個 practical scorecard **沒有重現**先前 frozen corpus 的 joint-certificate `+4／-0`；因此錠不能從本量尺宣稱成長。它同時顯示 stress minority 對 U／F 仍是 `0／8`，但 stress 只占 11.1%，沒有主導總分。

### 宇宙鈦鐵釘

欄位依序是 mechanics completion、完成件品質 p10／median、`>=24660` 已知高分區下端、`>=27100` 任務滿分品質。`24660` 不是 Silver 或 1000 分門檻。

| Version | Gear | Complete／72 | p10 | Median | `>=24660` | `>=27100` | Specialist |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v1.0.1 | U | 38 | 10522 | 13988 | 0 | 0 | 0 |
| v1.0.1 | F | 63 | 13819 | 17667 | 0 | 0 | 0 |
| v1.0.1 | S | 69 | 13731 | 18102 | 0 | 0 | 66 |
| v1.1.0 | U | 72 | 11418 | 15486 | 0 | 0 | 0 |
| v1.1.0 | F | 72 | 15086 | 20107 | 6 | 3 | 0 |
| v1.1.0 | S | 72 | 15693 | 20844 | 9 | 2 | 45 |
| v1.2.0 | U | 72 | 11418 | 15486 | 0 | 0 | 0 |
| v1.2.0 | F | 72 | 15086 | 20107 | 8 | 3 | 0 |
| v1.2.0 | S | 72 | 15146 | 21260 | 22 | 7 | 109 |
| **v1.3.0** | **U** | **72** | **11418** | **15486** | **0** | **0** | **0** |
| **v1.3.0** | **F** | **72** | **15342** | **19986** | **7** | **4** | **0** |
| **v1.3.0** | **S** | **72** | **15146** | **21260** | **22** | **7** | **109** |

目前 v1.3.0 對首版 paired W／L／T 為 `179／37／0`，是五個配方中最明確的成長：三裝備都由未完成提升到 `72／72`，F／S 也建立高分尾端。v1.3.0 對 F 是 trade-off：相較 v1.2.0，`>=24660` 為 `8→7`、`>=27100` 為 `3→4`、p10 `15086→15342`，paired `11／11／50`；不能稱全面 dominance。U 仍沒有進入 `>=24660`，高尾 coverage 尚未跨裝備成立。

### 宇宙探索用的硬化木板

`Valid` 必須同時滿作業與必要品質 `14900`；完成件品質固定為 `14900`。

| Version | Gear | Valid／72 | Primary／64 | Stress／8 | Policy-null | Specialist |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| v1.0.0 | U | 59 | 58 | 1 | 13 | 0 |
| v1.0.0 | F | 71 | 64 | 7 | 1 | 0 |
| v1.0.0 | S | 72 | 64 | 8 | 0 | 1 |
| **v1.1.0** | **U** | **59** | **58** | **1** | **13** | **0** |
| **v1.1.0** | **F** | **71** | **64** | **7** | **1** | **0** |
| **v1.1.0** | **S** | **72** | **64** | **8** | **0** | **0** |

目前 v1.1.0 對首版 paired W／L／T 為 `2／3／211`，總 valid completion 同為 `202／216`；本量尺沒有重現先前 frozen corpus 的 joint-certificate `+11／-0`。可確認的成本改善是 specialist invocation `1→0`，但不能把成本下降寫成完成率提升。

### 高空作業用的腳手架

品質未滿仍可完成。`Points` 是 completion-weighted provisional mission points，使用 community HQ curve；不是 Recipe 36208 的遊戲內 oracle。`Full` 是品質 `22500` 件數。

| Version | Gear | Complete／72 | p10 | Median | Full | Points | Specialist |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v1.0.0 | U | 72 | 15016 | 18880 | 17 | 599.58 | 0 |
| v1.0.0 | F | 72 | 20433 | 22500 | 61 | 764.25 | 0 |
| v1.0.0 | S | 72 | 22500 | 22500 | 66 | 775.42 | 14 |
| v1.2.0 | U | 72 | 15016 | 18880 | 17 | 599.58 | 0 |
| v1.2.0 | F | 72 | 20229 | 22500 | 54 | 763.25 | 0 |
| v1.2.0 | S | 72 | 22500 | 22500 | 66 | 775.25 | 0 |
| **v1.3.0** | **U** | **72** | **15016** | **18880** | **17** | **599.58** | **0** |
| **v1.3.0** | **F** | **72** | **20594** | **22500** | **55** | **766.92** | **0** |
| **v1.3.0** | **S** | **72** | **22500** | **22500** | **66** | **775.25** | **0** |

目前 v1.3.0 對首版 paired W／L／T 為 `20／13／183`。最有意義的 current uplift 在 F：provisional points `764.25→766.92`，同時 completion 保持 `72／72`；full-quality `61→55` 再次說明 promotion metric 是非線性任務效用，不是滿品質件數。S 的 points `775.42→775.25` 微降，但 specialist invocation `14→0`；屬成本隔離 trade-off，不是全面 dominance。U 完全持平。

### 宇宙探索用的巨匠藥

`Complete` 只代表 mechanics 完工；後三欄分別是已知高分區 `>=10200`、provisional 800 分 proxy `>=10800`、滿品質 `12000`。10800 不是已驗證精確門檻。

| Version | Gear | Complete／72 | p10 | Median | `>=10200` | `>=10800` | `12000` | Specialist |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v1.0.0 | U | 72 | 8771 | 12000 | 62 | 62 | 61 | 0 |
| v1.0.0 | F | 72 | 12000 | 12000 | 72 | 72 | 72 | 0 |
| v1.0.0 | S | 72 | 12000 | 12000 | 72 | 72 | 72 | 0 |
| v1.1.0 | U | 72 | 8771 | 12000 | 62 | 62 | 61 | 0 |
| v1.1.0 | F | 72 | 12000 | 12000 | 72 | 72 | 72 | 0 |
| v1.1.0 | S | 72 | 12000 | 12000 | 72 | 72 | 72 | 0 |
| **v1.2.0** | **U** | **72** | **8771** | **12000** | **62** | **62** | **61** | **0** |
| **v1.2.0** | **F** | **72** | **12000** | **12000** | **72** | **72** | **72** | **0** |
| **v1.2.0** | **S** | **72** | **12000** | **12000** | **72** | **72** | **72** | **0** |

v1.2.0 對首版 paired W／L／T 為 `41／0／175`，三套裝備皆維持 `72／72` mechanics completion、0 safety、0 specialist invocation。U 完全持平且滿品質仍只有 `61／72`，不屬穩定滿品質 coverage；F 平均手數 `24.917→24.569`、paired `21／0／51`，S 為 `24.889→24.556`、paired `20／0／52`。本 operational corpus 因此首次量到「完成與品質不退、食藥兩套裝備更短」的跨版本成長。

recipe-owned exact 食藥非專家 frozen corpus 另對 v1.1 固定路線維持 primary／stress `768／768`、`128／128` 完成且滿品質；primary 手數 `78` 較短／`0` 較長／`690` 相同，condition-responsive uses `1717／928`、paired `416` 更多／`0` 更少。這是 v1.2.0 的直接 promotion evidence；本表則是三裝備 operational regression evidence，兩者不得混稱真實成功率。

## Current-versus-first 總覽

配對排序依 recipe objective 決定，不使用一個通用平均品質：

- 錠／木板：valid completion，再比較成功步數；
- 釘：completion → `>=27100` → `>=24660` → raw quality → 步數；
- 腳手架：completion → provisional expected mission points → raw quality → 步數；
- 巨匠藥：completion → `12000` → `>=10800` → `>=10200` → raw quality → 步數。

| Recipe | Current vs first W／L／T | 結論 |
| --- | ---: | --- |
| 宇宙鈦鐵錠 | `12／13／191` | 此 operational corpus 未證明成長；completion `96→94` |
| 宇宙鈦鐵釘 | `179／37／0` | completion 與高分尾端有明確跨代成長 |
| 宇宙探索用的硬化木板 | `2／3／211` | completion 持平；移除 1 次 specialist invocation |
| 高空作業用的腳手架 | `20／13／183` | F 有小幅 provisional utility uplift；S 以微量 utility 換零 specialist cost |
| 宇宙探索用的巨匠藥 | `41／0／175` | completion／品質不退；F、S 以球色縮短路線，U 持平 |

不同 scorecard 只要 condition profiles、seed、樣本權重、CrafterProfile、objective、HQ utility 或配對排序不同，就不能直接合併 W／L／T。既有 recipe-specific frozen 結果仍是各自 promotion evidence；本文件的 operational scorecard 用來發現跨版本成長、平坦與退化，不反向改寫先前 corpus。

## 維護契約

每當新增 solver version 或新增配方版本時，必須：

1. 先完成 recipe-owned objective、runtime version 與 scenario routing，並以獨立 commit 發布該 policy identity。
2. 在 `HISTORICAL_POLICY_RELEASES` 追加一筆，不改寫或刪除舊 release；保存完整 40 字元發布 commit、config export 與當時 exact-profile routing。
3. 執行 `npm test -- tests/solverScorecardRegistry.test.ts`。這個 guard 會拒絕「runtime 已升版但 scorecard registry 未維護」。
4. 先 smoke：`npm run evaluate:solver-scorecard -- --scenario <scenario-id> --primary-seeds 2 --stress-seeds 1 --output .tmp/solver-scorecard-smoke.json`。
5. 再完整執行：`npm run evaluate:solver-scorecard -- --output .tmp/solver-scorecard-v1.json`。本機 2026-08-13 三次完整重跑約 `526–537s`；這是分鐘級離線工作，不放進預設 Vitest suite，也不與 latency benchmark 併跑。
6. 檢查每個 cell episode 數、`policy-null` denominator、stop reasons、safety、specialist invocations、primary／stress 拆分與 objective-specific paired growth，再更新本文件表格與 `last_verified`。
7. 如果修改三套裝備、condition mix、seed schedule、64+4+4 權重、objective metrics 或 paired ordering，必須升 `SCORECARD_VERSION`、另開新 snapshot，不能把新舊數字當同一量尺續表。
8. scorecard seeds 一經檢視就是 operational regression evidence；不得稱 frozen／held-out，也不得使用或開封 reserved-final corpus。

新版本可以比前版差；若結果是 flat、trade-off 或 regression，照實保留。只有配方對應的 promotion gate 另有充分證據時才可上線，不能為了讓本表看起來單調成長而改權重、刪 stress、隱藏 `policy-null` 或換 objective。
