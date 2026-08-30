# UI/UX 與視覺規範

## 核心原則

- 製作中最重要的是目前 state、下一技能與回報入口。
- 常見路徑低負擔，偏離、失敗與校正仍可完整表達。
- 不把內部 policy、版本或研究術語放在主要操作層。
- 所有 432 配方在發布後視為正常支援，不顯示成熟度分級。
- 產品語氣溫和、清楚，不以「保證成功」或虛假精準度製造信心。

## 設定流程

1. 輸入 craftsmanship、control、CP 與必要的專家／工具資訊。
2. 搜尋並選擇配方。
3. 選擇 Stable／Balanced／Aggressive。
4. 顯示該配方的 mechanics 完成條件，以及滿品質、四檔收藏價值或 HQ 機率規則，開始第一步 Normal。

配方清單使用可搜尋、可捲動且具 dialog semantics 的 mobile bottom sheet；主流程不常駐 432 張卡片。切換或重新開始會完整重設當次 craft，不沿用 pending action 或 history。

## 每一步資訊層級

1. 目前 condition（球色）、進展、品質、耐久、CP 與重要 buffs。
2. 推薦技能的正式繁中名稱與 icon。
3. 主／快速求解器狀態、等待時間與 fallback 原因。
4. 必要的成功／失敗及下一球回報。
5. 摺疊的推薦理由、替代技能與取捨。
6. 次要工具：手動技能、undo、resync、export、restart。

技能名稱遵循 [glossary.md](../../glossary.md)；不能自行簡稱成與繁中遊戲 UI 不同的名稱。

## 回報流程

- 第一手固定通常（Normal），不詢問開場球色。
- 100% 成功技能直接選下一球；點擊球色本身即明確回報「已使用目前推薦技能」與觀察到的下一球，立即重新推薦，不再插入技能確認或球色確認按鈕。
- 非必定成功技能先選成功／失敗，再直接點下一球；玩家改用其他合法技能時也走相同 outcome 流程。
- 觀察（Observe）會消耗一次作業並產生下一個 condition；即使求解器連續兩次推薦同一技能，每個新 recommendation 也必須重新顯示當步需要的回報控制。
- 好兆頭／高耐久等 forced transition 不顯示泛用「繼續」；只顯示唯一可觀察的下一球色按鈕。No-step 技能才使用不含球色的繼續操作。
- 終局 action 不要求不存在的下一球。
- 不推進 step 或強制下一狀態的技能，UI 只詢問仍需要的資訊。
- 每次成功結算使用短暫 input lock，避免重複點擊；undo／resync／restart 清除鎖定。
- 下一步重新嘗試主要求解器；球色點錯可用 undo 回到上一個完整 step。

## 主／快速求解器呈現

### 主要求解器

- 分析期間維持 UI 可操作，顯示簡短狀態。
- 最多等待 3 秒；只有真正用滿 deadline 才標示逾時。
- 啟動錯誤、計算錯誤與無結果分開顯示。

### 快速求解器

- 主要求解器失敗或逾時後立即使用。
- 明示「改用快速建議」與原因，不把它冒充主要求解器結果。
- 快速建議仍顯示技能、理由與必要取捨。
- 使用快速建議不會永久切換 session；下一步仍嘗試主要運算。
- 合法 state 無法取得快速建議是 release-blocking error，不安靜顯示空白。

## 偏離、undo 與 resync

- 玩家偏離推薦是正常流程；history 顯示實際技能與成敗。
- Undo 移除最後一個完整 step，依 event path 重建 state。
- 球色選錯可在沒有 pending action 時修正。
- State mismatch 用 resync form 記錄新數值與原因；不要求 reload／清 storage。
- Reload 本來就會清除進行中的 craft；UI 不宣稱可從 browser storage 恢復 session。

## 風險取向文案

- Stable：在追求已知有意義品質的前提下降低災難性失敗，不等於最低品質交貨。
- Balanced：在完工與品質尾端間取中間權衡。
- Aggressive：承擔較高但可理解的風險追求高品質，仍遵守必要品質與合法性。
- 若裝備能力不足，使用「best-effort／目前證據不足」說明，不暗示選 Stable 就必然成功。

## 視覺、RWD 與 a11y

- 沿用 Frozen Rabbit 溫和、紙張感、低壓力的系列語言；警告清楚但不搶戲。
- Condition 不只靠顏色；同時顯示文字與可辨識形狀／標記。
- Touch target 至少 44px；鍵盤 focus 可見；dialog 有 title、focus management、Escape 與 scroll boundary。
- 360px 寬度不橫向溢出；主要推薦與球色控制保持首屏可操作。
- 使用 semantic button、fieldset、legend、aria-live；不以 div 模擬控制項。
- `prefers-reduced-motion` 下停用非必要動畫。
- Dark mode 保持文字、focus、condition 與 warning 對比。

## I18n

- UI 字串集中在 locale owner，不散落 domain／solver。
- 正式繁中技能與 condition 以繁體中文版官方網站／遊戲內字串為準。
- English 與繁中語意對齊；code identity 不依翻譯。
- 新增字串時檢查缺 key、fallback 與文字長度。
- `README.md` 不屬 UI copy owner。

## 驗證

至少覆蓋：

- Setup、配方搜尋與重新開始；
- 正常推薦、主要求解器逾時、快速建議；
- 非必定成功技能、forced condition、終局；
- 玩家偏離、undo、球色修正、resync；
- Reload 不恢復 craft、裝備與 risk preference 仍保留；
- 鍵盤、screen reader、360px、dark mode；
- 目標裝置主／快速 solver latency。

Build／unit tests 不能取代真實瀏覽器、裝置與遊戲切換操作驗證。
