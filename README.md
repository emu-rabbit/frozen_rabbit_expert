# Frozen Rabbit Expert

Frozen Rabbit Expert 是一個開發中的 **Final Fantasy XIV 宇宙探索 EX+ 高難度巧匠即時決策助手**。

目前 POC 讓玩家輸入裝備面板的作業精度、加工精度與 CP，在固定配方中取得逐步技能推薦；每次玩家回報實際技能結果與下一個 condition 後，系統會按完整 state 重新計算。目標不是產生固定巨集，也不宣稱能找到全域最佳解或保證成功。

## 目前狀態

本 repository 已建立 Phase 1 recommendation 與 Phase 2 第一段 research-teacher 實驗。第一版 teacher 經玩家實戰判定退化，runtime 已回復 Phase 1 fallback。固定目標是繁中遊戲內的「宇宙鈦鐵錠」（Cosmotized Ilmenite Ingot，Recipe ID `36282`、Item ID `48360`），規格為作業 7300、耐久 30、品質與必要品質 18900。

目前包含：

- 玩家輸入作業精度、加工精度、CP，並可切換是否裝備宇宙工具；
- 依 recipe level divider／modifier 自動計算基礎作業與品質；
- Normal、Good、Centered、Sturdy、Pliant、Malleable；
- Phase 0 所需的 Lv.100 作業、加工、修復與 buff action 子集；
- 每一步由玩家直接選擇 Normal、Good、Centered、Sturdy、Pliant 或 Malleable；未回報前推薦與技能施放皆鎖定；
- 每次技能後必須回報成功／失敗（必定成功技能自動填入成功）與結算後的新球色，資料完整才計算下一步；
- `cosmic-titanium-lookahead-fallback-v1.1.1`：玩家實戰使用既有 guide／lookahead baseline；
- guide research catalog 與 scenario oracle 涵蓋起手、condition 資源轉換、加工／中級加工／上級加工、加工／精煉加工、觀察／上級加工、改革四步、耐久循環與品質／作業收尾；
- `cosmic-titanium-rollout-teacher-v0.1.0` 程式與測試仍保留作離線研究，但 `RESEARCH_TEACHER_PROMOTED=false`，不再對玩家產生 recommendation；
- `packages/policy-lab` 已建立離線 reachable-state sampler、多 continuation policy 完整 episode labeler、compact softmax action scorer、held-out evaluator 與 promotion gate；目前只用反例驗證管線，沒有可 promotion artifact；
- 目前 compact feature 尚未涵蓋不同 craftsmanship／control、max CP 絕對值與宇宙工具差異，不能宣稱適用所有裝備；正式訓練需使用多個 CrafterProfile、按 profile 分割 held-out，並對範圍外裝備安全 fallback；
- 主推薦、一行理由、作業收尾狀態、policy coverage 與兩個具 trade-off 的替代選擇；
- 推薦卡、替代選擇、完整技能面板與最近步驟皆顯示已由 XIVAPI game data 核對的 Blacksmith action icon；
- undo、state resync、local persistence 與匿名 JSON export；
- domain／data／protocol／solver unit tests 與可重跑的 runtime benchmark。

配方 identity、recipe level 參數與 Blacksmith action icon ID 來自 XIVAPI game data；公式順序與 action semantics 對照 Teamcraft Simulator revision `74e167a`。TW 7.51 遊戲內證據另確認一個有限範圍的取整差異：Recipe `36282`、加工精度 `5140`、通常、內靜 3、改革有效時，上級加工實際增加 `935`，Teamcraft 公式則為 `936`；runtime 以 versioned empirical correction 精確匹配此案例，不外推至未驗證狀態。玩家當前球色仍完全依手動回報；未知下一球的 sensitivity profiles 都是 provisional assumption，不是官方機率。完整 mechanics timing、真實 condition profile、完整玩家 session 與 held-out statistical evaluation 仍未完成，因此 scenario oracle 通過只代表已知指南技巧沒有明顯退化，不代表實戰 policy 已通過。

依目前 POC 範圍，唯一可選配方是宇宙鈦鐵錠；Auxesia WR.01 等其他任務維持後續 roadmap，不混入第一版操作流程。

## 開發指令

```powershell
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run benchmark:solver
npm run test:solver-oracle
npm run test:policy-lab
```

本機開發網址預設為 `http://localhost:4173`。

## 產品流程

1. 輸入角色面板的作業精度、加工精度與 CP，設定宇宙工具 toggle。
2. 先回報本步球色；未完成前不顯示推薦，也不能施放技能。
3. 查看含技能 icon 的主推薦、理由、作業收尾狀態與替代選擇，再使用推薦技能或玩家自己的技能。
4. 回報本次成功／失敗與結算後的新球色；兩者完整以前下一步保持鎖定。
5. 系統套用 transition、保存 event 並按新 state 重新推薦，重複直到作業完成或耐久歸零。

## 設計底線

- mechanics 正確性與 policy 品質分開驗證。
- 未知 condition rate 與社群推測必須保留來源、日期與信心。
- runtime 不建立完整決策樹，只保存玩家實際走過的 session path。
- guide policy 是可追蹤的基準與搜尋先驗；第一版 worker research teacher 因實戰出現浪費 buff 與 Good opportunity 的退化路線，已停止 promotion。只有重做離線 paired rollout、held-out evaluation 與 compact distillation 並通過 promotion gate，才能再次取代 baseline。
- 推薦在 browser 本機執行；不讀記憶體、不攔封包、不自動操作遊戲。
- 所有建議都需可解釋、可修正、可 replay。

裝備設定另存於 localStorage key `frozen-rabbit-expert/equipment-v1`，與進行中的 session 分開保存；宇宙工具開啟時，高品質 condition 的品質倍率使用 `1.75×`，否則為 `1.5×`。

## 文件入口

- [Agent 工作指南](AGENTS.md)
- [完整研究交接](cosmic-expert-crafting-solver-poc-handoff.md)
- [專案使命](.agents/skills/mission/project_mission.md)
- [產品架構](.agents/skills/mission/product_architecture.md)
- [技術架構](.agents/skills/professional/technical_architecture.md)
- [POC 實作計畫](.agents/roadmaps/poc_implementation_plan.md)
- [待實證問題](.agents/research/open_questions.md)

## 技術方向

目前使用 npm workspaces、TypeScript、Vue 3、Vite、Tailwind CSS、Vue I18n 與 Vitest。Phase 0／1 未引入 PrimeVue、server、database、state framework 或 WASM；核心 mechanics 維持單一 TypeScript source。

Hosting、CI、Playwright suite 與正式 license checklist 尚未定案。
