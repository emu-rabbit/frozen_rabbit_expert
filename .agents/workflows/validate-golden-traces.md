---
description: 將玩家遊戲內錄影或逐步紀錄轉成可追溯 fixture，並以 deterministic replay 驗證 mechanics。
---

# Golden Trace 收錄與驗證工作流

## 觸發條件

- 玩家提供任何 catalog 配方的錄影、截圖、debug export 或逐步紀錄。
- 新增／修正 action formula、rounding、buff timing 或 condition transition。
- Mechanics／session identity 更新後重播既有 traces。

## Intake

先保存或引用原始 evidence，不直接覆寫：

- patch、日期、client locale；
- recipe／item canonical ID 與顯示名稱；
- crafter job、level、craftsmanship、control、CP、specialist／tool；
- source kind、capture method、原始 path／URL；
- 是否完整、不可見欄位與人工轉錄範圍。

只保存 mechanics 必需資料；移除角色名、聊天、world 與其他不必要識別資訊，並記錄 anonymization。

## Transcription

每步記錄：

- step／timestamp；
- previous condition；
- actual action；
- success／failure；
- next condition；
- observed 進展、品質、耐久、CP；
- 內靜、重要 buffs 與一次性技能；
- unreadable／unknown fields 與理由。

看不到的值用 omitted／unknown，不填 0。Previous／next condition 分開。技能使用正式繁中名稱作顯示，fixture identity 使用 code ID。

## Fixture validation

- 驗證 schema、range、event order、canonical identity 與 versions。
- 檢查 action 是否在當時 unlocked／legal；看似 illegal 時先找缺失 state。
- 原始數字與 normalized values 分開。
- Empirical trace 不混入 probability assumption。
- 相同 family 的 trace 仍保留實際 recipe identity，以便發現 family 等價假設的反例。

## Replay

1. 從 initial state deterministic replay。
2. 每步比較 predicted 與 observed state。
3. 第一個 mismatch 停止摘要，記錄 action、field、expected、observed、rounding stage 與可能原因。
4. 不在後續 step 用 resync 掩蓋第一個 mechanics mismatch；只有原始 session 明確校正時才 replay resync。
5. 修正 code／data／fixture 後從頭重播。

## Mismatch 分類

- transcription error；
- missing initial setup／buff；
- wrong recipe／action identity；
- formula／modifier／rounding order；
- buff apply／tick／consume timing；
- success／failure handling；
- forced condition／availability；
- patch drift；
- family identity 錯誤；
- actual mechanics unknown。

不能理解的 mismatch 回到 [open_questions.md](../research/open_questions.md)，不為通過測試改 observed data。

## Promotion to golden

只有以下條件成立才放入 `tests/golden-traces/`：

- source metadata 完整；
- required fields 可讀且 identity 已確認；
- replay 全步一致，或 fixture 明示有限 assertion scope；
- 沒有用假數字填缺漏；
- privacy／license 可接受；
- fixture 帶 mechanics／schema version。

未達條件的材料留在 research intake，不作 oracle。

## 交付

回報：

- source／fixture；
- replay 結果與第一個 mismatch；
- 已確認與未知 mechanics；
- 是否需要拆 family；
- 更新的 domain／data／spec／tests／identities；
- 未納入 repository 的原始 evidence 與原因。
