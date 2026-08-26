# 專案詞彙與正式遊戲名稱

## 使用方式

- 文件第一次使用專有名詞時，先寫繁中白話，再附英文或 code identifier；同一段後續不重複解釋。
- 遊戲技能使用繁體中文版官方網站／遊戲內名稱，格式為「繁中名稱（英文名稱，`codeId`）」。
- Code、schema、CLI 與 export 保留 identifier，不把中文顯示名稱當 identity。
- 官方翻譯與 code 不一致時，文件先用官方名稱，並在 `current_state.md` 登記 UI follow-up；不能自行創造另一個譯名。

## 核心概念

| 詞彙 | 專案中的意思 |
| --- | --- |
| condition（狀態／球色） | 當步素材狀態，例如高品質、高效或結實。「球色」是玩家快速辨識的俗稱。 |
| action（技能） | 玩家當步實際使用的製作技能。 |
| progress（進展） | 官方 UI 的製作完成量；達到配方要求後完成製作。Code identifier 保留 `progress`。 |
| quality（品質） | 影響收藏價值或優質結果的數值；不等同 mechanics 完成條件。 |
| mechanics | 遊戲規則計算：技能是否合法、消耗與 state 轉移。 |
| policy／solver（決策策略／求解器） | 根據目前 state 選擇下一技能；不代表全域最佳或保證成功。 |
| state-feedback（狀態回饋） | 每次收到實際技能、成敗與下一球色後重新計算，不照固定 rotation。 |
| PlannerContext（規劃脈絡） | 求解器的跨步短期意圖；和客觀 `CraftState` 分開。 |
| mechanics family（製作規則群組） | 名稱可不同，但所有會改變求解的數值、condition 與 objective 相同的一組配方。 |
| objective（目標） | 在合法完成之外要追求的品質、收藏價值或風險取捨。 |
| hard-quality | 品質是完成的硬門檻；未達品質即使進展滿也不算成功。 |
| progress-only | Mechanics 只要求進展完成；品質仍可能是產品價值，不能用低品質交貨冒充高品質成功。 |
| policy-null（無建議） | 合法非終局 state 仍有合法技能，但求解器沒有回傳技能。 |
| OOD（超出評測範圍） | 裝備或 state 超出目前 evidence envelope；表示證據不足，不等於必然失敗。 |
| parity（一致性） | 兩個實作對相同輸入的一致程度；exact parity 與 outcome parity 分開。 |
| migration oracle（遷移參考） | 凍結舊實作作搬移比對；不是永久共同演進的第二套 solver。 |
| p95 | 100 次量測約有 95 次不慢於此值；同時要看 p99 與 max。 |
| fail closed | identity、schema 或 evidence 對不上時停止並明示，不偷偷換成不可比較的結果。 |
| common random numbers | Baseline 與 candidate 使用相同亂數案例，比較策略差異而不是運氣差異。 |

## 製作技能

以下繁中名稱以 [FINAL FANTASY XIV 繁體中文版官方能工巧匠指南](https://www.ffxiv.com.tw/web/intro/guide/crafting_gathering/weaver/index.html) 為準。

| 正式繁中 | English | Code identifier |
| --- | --- | --- |
| 製作 | Basic Synthesis | `basicSynthesis` |
| 高速製作 | Rapid Synthesis | `rapidSynthesis` |
| 模範製作 | Careful Synthesis | `carefulSynthesis` |
| 坯料製作 | Groundwork | `groundwork` |
| 儉約製作 | Prudent Synthesis | `prudentSynthesis` |
| 集中製作 | Intensive Synthesis | `intensiveSynthesis` |
| 堅信 | Muscle Memory | `muscleMemory` |
| 加工 | Basic Touch | `basicTouch` |
| 倉促 | Hasty Touch | `hastyTouch` |
| 中級加工 | Standard Touch | `standardTouch` |
| 上級加工 | Advanced Touch | `advancedTouch` |
| 儉約加工 | Prudent Touch | `prudentTouch` |
| 坯料加工 | Preparatory Touch | `preparatoryTouch` |
| 集中加工 | Precise Touch | `preciseTouch` |
| 比爾格的祝福 | Byregot's Blessing | `byregotsBlessing` |
| 工匠的神技 | Trained Finesse | `trainedFinesse` |
| 精煉加工 | Refined Touch | `refinedTouch` |
| 冒進 | Daring Touch | `daringTouch` |
| 閒靜 | Reflect | `reflect` |
| 精密製作 | Delicate Synthesis | `delicateSynthesis` |
| 秘訣 | Tricks of the Trade | `tricksOfTheTrade` |
| 工匠的絕技 | Trained Perfection | `trainedPerfection` |
| 精修 | Master's Mend | `mastersMend` |
| 巧奪天工 | Immaculate Mend | `immaculateMend` |
| 儉約 | Waste Not | `wasteNot` |
| 長期儉約 | Waste Not II | `wasteNot2` |
| 崇敬 | Veneration | `veneration` |
| 改革 | Innovation | `innovation` |
| 闊步 | Great Strides | `greatStrides` |
| 掌握 | Manipulation | `manipulation` |
| 觀察 | Observe | `observe` |
| 最終確認 | Final Appraisal | `finalAppraisal` |
| 設計變動 | Careful Observation | `carefulObservation` |
| 專心致志 | Heart and Soul | `heartAndSoul` |
| 快速改革 | Quick Innovation | `quickInnovation` |
