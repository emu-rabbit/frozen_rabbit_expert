# UI/UX 與視覺規範

## 核心原則

- **下一步最清楚**：推薦 action、目前 condition、關鍵 state 與是否仍保有安全收尾必須先被看見。
- **回報最短路徑**：一般模式避免重複詢問；fast mode 只保留此步真正需要的輸入。
- **可修正**：玩家偏離、誤按或 state mismatch 都能 edit／undo／resync，不用重開整場。
- **不確定性可理解**：未知 rate、OOD 與 model limit 以可行動文字說明，不以單一神祕分數呈現。
- **教學不阻塞**：一行主要 reason 常駐，完整 explanation／alternatives 可展開。

## 每一步的資訊結構

畫面必須清楚分開：

1. **本步使用 condition**：施放 action 前的 condition。
2. **本步建議 action**：系統 recommendation。
3. **玩家實際 action**：允許與建議不同。
4. **本步成敗**：只有可能失敗的 action 強制詢問。
5. **下一 condition**：action 結算後的新 condition。
6. **預測 state**：progress、quality、durability、CP、Inner Quiet、主要 buffs。

不要只顯示「回報球色」。這會混淆 previous／next condition，也無法辨識 failed action 是否增加 progress／quality。

### 宇宙鈦鐵錠快速回報流程

- 開場只選一次本步 condition。
- 推薦出現後直接顯示 next condition；不設「我已施放」確認。點球本身代表玩家已在遊戲使用目前推薦，並在同一操作追加 `craftActionUsed` 與 `craftActionResolved`、更新 state、啟動下一次 recommendation。
- 非 100% action 先顯示 success／failure，再開放 next condition；100% action 直接開放 next condition，不多問一次。若已知本次 outcome 會讓 craft 進入 completed／failed terminal，遊戲不會產生 next condition，UI 應直接結算且不得要求玩家回報球色。
- 玩家若沒有使用推薦，必須先從次要 action panel 選擇實際 action，再走既有成敗／next-condition 路徑；不可把點球誤記為推薦技能。
- Final Appraisal 等 no-step 且不 reroll condition 的 action 不顯示六色選擇，只顯示「球色不變，繼續」，event 亦強制保存目前 condition；Careful Observation 這類明示 reroll 的 no-step action 仍回報新球色。
- 主畫面只常駐 recommendation、關鍵 state、目前需要的回報與低調 undo；替代技能、完整 action panel、history、export 與 resync 收進次要折疊區，但不得移除。
- 玩家偏離推薦、undo 或 reload 時，以實際 session event path 重建 planner memory，不假設推薦一定被執行。

## Recommendation card

至少包含：

- action name／icon 或自製識別；
- 一行主要 reason；
- phase；
- completion／mission target 的關鍵 status；
- mechanics／condition／coverage 的簡短 confidence state；
- 1–2 個有實際 trade-off 的 alternatives，可預設收合；
- OOD／unsafe／unknown 時的明確 warning 或 manual fallback。

不可用「98% confidence」混合 mechanics correctness、condition rate 與 policy coverage。若顯示概率，需能查看模型與樣本來源。

## Resync 與 session safety

- progress、quality、durability、CP、Inner Quiet、主要 buffs、Duty Action 次數可直接修正。
- 每數步可提供非阻塞的 quick check，不能在倒數中強制開大型 modal。
- 修正追加 `stateResynced` event；歷史保留原觀測與修正原因。
- 提供 undo／edit previous outcome，重播後清楚顯示哪些後續 recommendation 已變動。
- reload 後若 session 可恢復，顯示 model version 是否和保存時一致。

## Material Miracle fast mode

- 所有 recommendation 在 browser local 執行。
- 支援鍵盤單鍵回報 condition，並提供不依賴顏色的文字／形狀／shortcut 標籤。
- condition buttons 位置固定，不隨建議排序。
- 只有可能失敗的 action 詢問 success／failure。
- 顯示 45 秒倒數、clock source／sync state 與重新同步入口。
- 可收合詳細 explanation；timer、action、condition input 與 state warning 不可被動畫或分析圖遮擋。
- 快速 fallback 的 p95 recommendation 目標 `< 50ms`；一般強決策以 p95 `< 1s` 為主要體驗目標，網站 hard timeout 為 `3s` 並立即回退。Material Miracle 是否沿用 3 秒上限必須另以實機倒數 UX 驗證。
- keyboard shortcut 不可和 browser／screen reader 常用操作衝突；提供可見提示與 mouse/touch equivalent。

## 視覺系統

- 使用 `brand_identity.md` 的 soft-green／slate palette；condition 與 warning 使用語意色，不只靠色相區分。
- light background 可用 `soft-green-50`；dark base 使用 `slate-950`。
- 圓角、薄 border、克制 shadow／blur；在資訊密集頁面避免過多玻璃效果。
- spacing 以 4px／8px 節奏為主，state grid 對齊數字與 label。
- 倒數、failure risk、terminal state 與 OOD warning 的視覺層級高於裝飾。
- 尊重 `prefers-reduced-motion`；重要狀態不只用動畫表達。

## Vue／CSS 規則

- UI presentation 與 session／domain logic 分離；component 不重寫 mechanics。
- 優先使用既有 Tailwind `dark:` classes 與 design tokens。
- 在 Vue `<style scoped>` 使用 global dark selector 時包住完整 selector，例如 `:global(html.dark .condition-card)`；不要寫會污染 root 的 `:global(.dark) .foo`。
- timer、listener、subscription、worker 與 AbortController 在 unmount／session end 正確清理。
- modal 不可成為 fast path 的必要步驟；mobile keyboard 開啟時也不能遮住 primary controls。

## RWD 與可及性

- mobile 先保證 condition input、recommended action、success/failure 與 timer 同時可操作。
- desktop 才增加完整 state grid、reasoning 與 replay timeline，不因寬螢幕改變 event meaning。
- interactive targets、focus order、focus ring、ARIA label、error association 與 keyboard navigation 必須可用。
- condition、buff、風險與完成狀態不能只靠顏色；使用文字、icon、border 或 pattern 輔助。
- 數字快速變動時避免不必要的 live-region 噪音；只宣告需要立即注意的 recommendation／warning。

## I18n

- 架構預留 `tw`、`cn`、`en`、`ja`，使用者可見字串不得散落 hardcode。
- POC 若經使用者明確同意先只完成一個 locale，仍需維持 key 結構與 fallback，不把單語字串寫入 domain。
- FFXIV action／condition 的 locale 文字要有 canonical identifier；顯示名稱不可作資料 key。
- 長英文、日文與繁中在 mobile／desktop 都需檢查 overflow。

## 驗證

- build／typecheck。
- light／dark、mobile／desktop、keyboard／touch。
- long locale strings、200% zoom、reduced motion。
- normal flow、failed action、player deviation、undo、resync、OOD fallback。
- Material Miracle 錄影或現場計時；不能只用 automation 判斷實戰操作速度。
