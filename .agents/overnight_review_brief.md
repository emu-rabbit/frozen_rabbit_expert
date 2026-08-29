# Rust/WASM Web integration brief

`last_updated: 2026-08-30`

Web compute owner 已選定為 `native/craft-kernel` 經 `native/craft-kernel-web` 的 WASM ABI。下一個 vertical slice 要把 v1.12 main solver 接入 persistent Web Worker，並建立不依賴 frozen TypeScript 的快速求解器邊界；不是再比較語言，也不是發布網站。

## 玩家結果

- 玩家填完裝備、選完配方並回報當前球色後，main recommendation 來自 v1.12 Rust solver。
- 每次實際技能與結果回報後，使用 observed state 推進 planner context 並重新求解；玩家自行選技能、undo 或 resync 不得沿用錯誤 route memory。
- Main 超時／失敗時必須明示原因。獨立 Rust fast solver 尚未完成前，不用 frozen TS recommendation 冒充 fast result。

## Runtime 邊界

- Web Worker 在 session 期間持續存在；scenario、crafter、risk、undo、resync 或 worker restart 觸發明示 reset。
- 正常採用 pending recommendation 使用 `continue:<action>`；玩家自行使用另一個合法 action 使用 `deviate:<action>`，bridge 先驗證 observed transition 再清空 context。
- Forecast condition weights 暫由 recipe.randomConditions 建立均勻 `balanced-iid` assumption；當前 state.condition 永遠使用玩家實際回報。這是 planning assumption，不是遊戲機率真值。
- TypeScript wrapper 只負責 DTO／ABI encoding、identity validation、Worker lifecycle、deadline 與 UI mapping；策略選擇仍由 Rust 擁有。
- WASM artifact 由可重播 build command 產生，不提交 `target/` build output。

## 實作順序

1. 建立 browser-side ABI encoder／decoder 與 persistent Worker，先以 test fixture 驗證 v1.12 identity、action、reset／continue／deviate、terminal／action-limit。
2. 把現有 session events 對應到 bridge advance mode；worker response 帶 main／failure metadata，維持 3 秒 hard watchdog。
3. 建立獨立 Rust fast solver 的 fixed-budget API，保證 valid nonterminal 且有 legal action 時不回空白，量測 p95／p99／max。
4. Main＋fast 都成立後，移除 Web 對 frozen solver 的 runtime dependency、development-preview routing 與誤導 copy。
5. 做 desktop／mobile browser cold／warm、bundle／cache／memory、undo／resync／manual deviation 與 UI screenshot QA。

## 接受與停止條件

- Browser same-session fixtures 與 native v1.12 0 action／context mismatch；identity 或不可能 observed state fail closed。
- Main Worker hard watchdog 3 秒；回傳 elapsed 與 failure category。
- Fast solver fixed budget、target device p95 小於 100 ms，並報 p99／max；合法非終局 state 0 policy-null。
- Frozen TypeScript 不留作隱藏 runtime fallback。若 fast 尚未達 gate，Web 切換保持未完成，不用 UI 命名掩蓋。
- Node-WASM 數據不能代替 browser／mobile；target-device 違反 gate 時先定位 load、boundary 或 compute，不直接改寫另一語言。
