# FFXIV 宇宙探索 EX+ 高難度巧匠領域基線

## 文件邊界

本文件保存實作與研究需要的 domain 概念、已知任務差異與 mechanics 驗證清單。精確 data record、source metadata 與機率 profile 由 `data_and_evidence.md` 管理；runtime schema 由 `session_state_and_events.md` 管理。

`source snapshot: cosmic-expert-crafting-solver-poc-handoff.md, 2026-08-11`

## 問題模型

高難度製作每一步結算後大致是 fully observable：玩家可看到 progress、quality、durability、CP、condition、Inner Quiet 與 buffs。隨機性主要來自下一 condition 與部分 action success；condition rate 不明時還存在 model uncertainty。

因此單件 craft 可以視為有限期 MDP，但產品不需要 materialize 完整 policy tree。玩家回報實際 outcome 後，由目前 state 重新查詢 policy。

## 核心術語

- **Action**：玩家施放的 crafting skill；有 CP、durability、potency、success rate、step 與 buff effect。
- **Condition**：施放前／結算後的 material condition。UI 必須分開 previous condition 與 next condition。
- **CraftState**：單件 craft 內的全部可觀測狀態。
- **MissionState**：跨 craft 的 supplies、score、timer、Duty Action 與成敗。
- **Duty Action**：Cosmic mission 提供的任務資源；不等同一般 crafting buff，精確 timing／step semantics 需實測。
- **Finisher certificate**：在明確前置條件下可完成 progress 或達成目標的有限模板與資源證明。
- **Condition profile**：recipe-family-specific 的 sampled conditions、forced transitions、probability 與證據 metadata。

## Auxesia mission families

### WR.01：第一個 POC

- 天候限定、兩階段材料製作；核心研究集中在最終 expert craft。
- handoff snapshot 的主件為 durability 50、progress 7700、quality 26000；實作前用遊戲內 Cosmic Crafting Log 與 canonical ID 確認。
- 潛在反應式 condition 包含 Normal、Good、Robust、Primed、Malleable、Pliant、Centered。
- 即使隨機清單未列 Sturdy，state machine 仍需支援 `Robust -> Sturdy` forced transition。
- 沒有 Material Miracle 的 45 秒壓力，適合先驗證 simulator、完整 state 回報、rule policy、fallback 與 resync。
- 前置階段可先視為已完成，或使用另行驗證的 deterministic rotation；不得把未驗證 rotation 寫成保證。

### WR.02：real-time mission control

- handoff snapshot：任務內 9 分鐘、最多兩份材料、Material Miracle 兩次且每次 45 秒。
- Material Miracle 期間可出現多種特殊 condition，且以 real-time 而非 crafting steps 計算。
- 社群對六種 condition 近似均勻的說法是 empirical／provisional，不是官方公式。
- 需要 mission clock、remaining supplies／score、Duty Action timing、input overhead 與 fast local inference。

### TR.01：cross-craft risk

- 需完成兩件且任一件失敗的成本會影響整個 mission。
- Stellar Steady Hand 的使用需跨兩件分配，objective 是 joint completion／Gold，而不是單件 expected quality。
- 「不得失敗」是 terminal craft failure 還是任何 action failure，仍待遊戲內證據確認。

## Relevant conditions

下表只描述研究方向；正式數值、可出現集合與 transition 需以 versioned profile／tests 為準。

| Condition | Policy relevance |
| --- | --- |
| Normal | 低成本推進、資源維持、Observe 或 phase transition |
| Good | Tricks、Precise Touch、Intensive Synthesis、品質收尾等候選競爭 |
| Sturdy | durability cost 優勢；也可能由 Robust 強制到達 |
| Robust | durability 效率與 forced next Sturdy |
| Primed | buff duration value；需確認對各 buff 與 Duty Action 的作用 |
| Malleable | progress action value 提升 |
| Pliant | CP cost reduction；需保留 `ceil(baseCp / 2)` 取整 |
| Centered | success rate 提升；需確認 clamp 與和 Stellar Steady Hand 的疊加 |

## Mechanics 實作前逐項驗證

- 哪些 actions 不增加 step。
- 哪些 actions 不消耗／tick 既有 buffs。
- Manipulation recovery 與 durability zero／terminal 的結算順序。
- Great Strides、Muscle Memory、Final Appraisal 的消耗時點。
- combo state 在 Observe、failure 與 no-step action 後是否保留。
- Pliant CP 取整。
- Sturdy／Robust、Waste Not、Trained Perfection 的 durability 疊加與取整。
- Primed 增加哪些 buff duration。
- Centered 與 Stellar Steady Hand 的 success rate 上限與消耗。
- Heart and Soul、Careful Observation、Quick Innovation 的 no-step semantics。
- Duty Action 是否增加 step、tick buff、影響 combo 或立即改變 condition。
- Cosmic Tool Good multiplier 的適用條件與辨識方式。

## Formula cross-check 邊界

Teamcraft simulator 可作 MIT-licensed implementation reference，但不是官方 oracle。移植或重寫時：

- 保存原乘算與取整順序，建立表格測試。
- progress／quality base、recipe level modifier、condition multiplier、buff multiplier、potency 與 final rounding 分層驗證。
- `Pliant` 使用 `ceil(baseCp / 2)`。
- `Centered` 是 success rate adjustment，但 clamp 需實測／交叉確認。
- `Malleable`、`Good`、Cosmic Tool Good multiplier 與 Final Appraisal 各自成為可測 feature。
- 不把 Teamcraft generic expert condition rate 套到所有 Cosmic recipes。

## 不應推定的事

- 相同 sampled condition set 代表相同 probability。
- 顯示名稱相同代表同一 item／recipe／mission。
- 社群網站上的 recipe 數字等於當前遊戲資料。
- deterministic macro solver 的 correctness 可直接外推到 stochastic expert policy。
- guide 的 action preference 是 exact mechanics 或已證明最優 policy。
