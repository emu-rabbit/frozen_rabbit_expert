---
description: 將玩家遊戲內錄影或逐步紀錄轉成可追溯 fixture，並以 deterministic replay 驗證 mechanics。
---

# Golden Trace 收錄與驗證工作流

## 觸發條件

- 玩家提供 WR.01／WR.02／TR.01 錄影、截圖或逐步紀錄。
- 新增／修正 action formula、rounding、buff timing、condition transition 或 Duty Action。
- model version 更新後重播既有 traces。

## 1. Intake

先保存或引用原始 evidence，不直接覆寫：

- patch／日期／client locale；
- mission／recipe canonical ID 與顯示名稱；
- crafter job、level、craftsmanship、control、CP、specialist；
- tool、food、medicine 與其他 relevant setup；
- sourceKind、capture method、原始檔 path／URL；
- 是否完整、是否有不可見欄位、是否經人工轉錄。

只保存 mechanics 必需資料。若原始檔含角色名、聊天、server 或其他識別資訊，fixture 移除不必要內容並記錄已 anonymize。

## 2. Transcription

每步依序記錄：

- step index／timestamp；
- previous condition；
- actual action；
- success／failure；
- next condition；
- observed progress、quality、durability、CP；
- Inner Quiet、major buffs、Duty Action state；
- unreadable／uncertain fields 與理由。

不能推測看不到的值。缺漏用 omitted／`unknown` 狀態，不能填 0。previous／next condition 必須分開。

## 3. Fixture validation

- 驗證 schema、range、event order、canonical ID、model version。
- 檢查 action 是否在當時 unlocked／legal；若看似 illegal，先判斷 fixture／state 是否缺資料。
- 原始數字與正規化 stats 分開保留。
- empirical trace 不混入 probability assumption。

## 4. Replay

1. 從 initial state deterministic replay。
2. 每步比較 predicted 與 observed state。
3. 第一個 mismatch 即停止摘要，記錄 action、field、expected、observed、rounding stage 與 possible causes。
4. 不在後續 step 以 resync 掩蓋第一個 mechanics mismatch；resync 只用於 fixture 本身明確記錄的玩家修正。
5. 修正 code／data／fixture 後從頭重播。

## 5. Mismatch classification

- source transcription error；
- missing initial setup／buff；
- wrong canonical recipe／action identity；
- formula／modifier／rounding order；
- buff apply／tick／consume timing；
- success／failure handling；
- condition forced transition／profile；
- Duty Action／wall-clock semantics；
- patch drift；
- actual mechanics unknown。

不能理解的 mismatch 回到 `research/open_questions.md`，不要為了通過測試改 observed data。

## 6. Promotion to golden

只有在以下條件成立時放入 `tests/golden-traces/`：

- source metadata 完整；
- required fields 可讀且 identity 已確認；
- replay 全步一致，或 fixture 明確只驗證一個有限區段；
- assertion scope 與 evidence 相符；
- 沒有使用假數字填缺漏；
- privacy／license 可接受；
- fixture 帶 mechanics／schema version。

未達條件的材料留在 research intake，不作 oracle。

## 7. 交付

回報：

- 新增／更新哪些 source 與 fixture；
- replay 結果與第一個 mismatch；
- 確認或仍未知的 mechanics；
- 更新哪些 domain／data／spec／tests／model versions；
- 是否有未納入 repository 的原始 evidence 與原因。
