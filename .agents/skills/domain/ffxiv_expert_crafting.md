# FFXIV 宇宙探索高難度巧匠領域基線

## 文件角色

本檔只定義單件高難度製作的領域模型與需要驗證的 mechanics。配方數值與 identity 由 data owner 管理；策略選擇由 solver owner 管理。

## 問題模型

單件製作可表示為：

~~~text
RecipeProfile + CrafterProfile + CraftState
+ chosen action + observed success／failure + next condition
  -> next CraftState
~~~

`CraftState` 至少包含進展、品質、耐久、CP、condition、內靜、buffs、combo／一次性技能與 terminal。只有會影響遊戲規則的客觀資料進 state；求解器的路線意圖屬於 `PlannerContext`。

玩家每一步都能觀察實際技能結果，因此產品使用 state-feedback，不需要猜測玩家是否照建議執行。

## 正式用語

- progress：繁中 UI 使用「進展」。
- quality：品質。
- durability：耐久。
- condition：素材「狀態」；玩家常稱球色。
- action：技能。
- Inner Quiet：內靜。

技能名稱與 identifier 見 [glossary.md](../../glossary.md)。

## 宇宙探索高難度 conditions

目前 domain 支援：

| Code | 正式繁中 | 核心影響 |
| --- | --- | --- |
| `normal` | 通常 | 無額外修正 |
| `good` | 高品質 | 品質倍率與 condition-only 技能 |
| `goodOmen` | 好兆頭 | 下一 advancing step 強制高品質 |
| `centered` | 安定 | 提高非必定成功技能成功率 |
| `sturdy` | 結實 | 當步耐久消耗減半 |
| `pliant` | 高效 | 當步 CP 消耗減半 |
| `malleable` | 大進展 | 當步進展技能效率提高 |
| `primed` | 長持續 | 當步建立的部分 buffs 延長 |
| `robust` | 高耐久 | 當步耐久消耗減半，下一 advancing step 強制結實 |

每個配方實際可出現的 conditions 由 catalog binding 決定。未知 condition 或 transition 先 fail closed，不套用其他配方分布。

## Mechanics 必須逐項驗證

- 技能解鎖、專家限制、condition 限制與一次性使用；
- CP／耐久 cost、成功率、potency、rounding；
- 內靜、combo、buff duration 與消耗時點；
- `finalAppraisal`、no-step skill 與 forced condition；
- 高品質、高效、結實、大進展、長持續、高耐久等倍率；
- 進展完成、必要品質、耐久歸零與 failure reason；
- 玩家回報失敗時哪些 buff／step 仍會推進；
- Resync 後 state invariant。

Official tooltip、遊戲 trace 與 datamined formula 不一致時，保留差異並建立 evidence question；不選一個看起來合理的公式填入。

## Family 等價假設

現階段相同 mechanics family 的配方視為具有相同求解條件。Family identity 必須涵蓋所有會改變 action legality、transition、terminal、condition set 與 objective semantics 的欄位。

若玩家 trace 顯示同 family 內配方結果不同：

1. 先排除版本、裝備、輸入與 trace transcription 問題。
2. 檢查 catalog／objective binding 是否漏欄位。
3. 修正 family identity 或 mechanics。
4. 只有資料與 mechanics 無法解釋時，才研究新的 generic policy signal。

不以 recipe ID 直接打補丁。

## 不可由現有資料推定

- Assumed condition world 等於自然遊戲機率。
- 相同顯示名稱必然是同一 recipe／mission identity。
- Progress-only completion 等於有意義品質成功。
- Synthetic equipment 或 fixed-tape route 證明玩家實戰成功率。
- Relaxed upper bound 尚未排除目標，就代表實際可達。
- 舊五配方 guide preference 是遊戲 mechanics 或最佳策略。
- 單件製作證據可以外推到跨件任務分數、材料或倒數。
