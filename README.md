# Frozen Rabbit Expert

Frozen Rabbit Expert 是一個開發中的 **Final Fantasy XIV 宇宙探索 EX+ 高難度巧匠即時決策助手**。

目前 POC 讓玩家只輸入裝備面板的作業精度、加工精度與 CP，就能直接模擬固定配方；後續才會在同一個完整狀態模型上加入下一步推薦。目標不是產生固定巨集，也不宣稱能找到全域最佳解或保證成功。

## 目前狀態

本 repository 已建立 Phase 0 第一版可執行 POC。固定目標是繁中遊戲內的「宇宙鈦鐵錠」（Cosmotized Ilmenite Ingot，Recipe ID `36282`、Item ID `48360`），規格為作業 7300、耐久 30、品質與必要品質 18900。

目前包含：

- 玩家輸入作業精度、加工精度、CP，並可切換是否裝備宇宙工具；
- 依 recipe level divider／modifier 自動計算基礎作業與品質；
- Normal、Good、Centered、Sturdy、Pliant、Malleable；
- Phase 0 所需的 Lv.100 作業、加工、修復與 buff action 子集；
- 每一步由玩家直接選擇 Normal、Good、Centered、Sturdy、Pliant 或 Malleable；
- 非 100% 技能由玩家指定本次成功或失敗，不執行隨機擲骰；
- undo、state resync、local persistence 與匿名 JSON export；
- domain／data／protocol unit tests。

配方 identity 與 recipe level 參數來自 XIVAPI game data；公式順序與 action semantics 對照 Teamcraft Simulator revision `74e167a`。TW 7.51 遊戲內證據另確認一個有限範圍的取整差異：Recipe `36282`、加工精度 `5140`、通常、內靜 3、改革有效時，上級加工實際增加 `935`，Teamcraft 公式則為 `936`；runtime 以 versioned empirical correction 精確匹配此案例，不外推至未驗證狀態。目前不使用 condition 機率模型，球色完全由玩家選擇。完整 mechanics timing 尚待更多遊戲內 golden trace 驗證，因此此版仍不宣稱與遊戲完全一致，也尚未提供 solver recommendation。

依目前 POC 範圍，唯一可選配方是宇宙鈦鐵錠；Auxesia WR.01 等其他任務維持後續 roadmap，不混入第一版操作流程。

## 開發指令

```powershell
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

本機開發網址預設為 `http://localhost:4173`。

## 產品流程

1. 輸入角色面板的作業精度、加工精度與 CP，設定宇宙工具 toggle。
2. 選擇本步球色，再點擊要模擬的技能。
3. 若技能不是 100% 成功，選擇這次成功或失敗；系統不擲骰。
4. 系統套用 transition 並保存 event，重複直到作業完成或耐久歸零。

## 設計底線

- mechanics 正確性與 policy 品質分開驗證。
- 未知 condition rate 與社群推測必須保留來源、日期與信心。
- runtime 不建立完整決策樹，只保存玩家實際走過的 session path。
- 先用可讀、可測的 rule policy 與安全收尾模板，再以固定預算離線模擬改善 compact policy。
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

目前使用 npm workspaces、TypeScript、Vue 3、Vite、Tailwind CSS、Vue I18n 與 Vitest。Phase 0 未引入 PrimeVue、server、database、state framework 或 WASM；核心 mechanics 維持單一 TypeScript source。

Hosting、CI、Playwright suite 與正式 license checklist 尚未定案。
