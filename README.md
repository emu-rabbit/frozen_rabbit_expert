# Frozen Rabbit Expert

Frozen Rabbit Expert 是一個規劃中的 **Final Fantasy XIV 宇宙探索 EX+ 高難度巧匠即時決策助手**。

它預計讓玩家在每一步製作後回報實際技能結果與新 condition，系統再依目前完整狀態推薦下一個 action、解釋理由並指出風險。目標不是產生固定巨集，也不宣稱能找到全域最佳解或保證成功。

## 目前狀態

本 repository 目前處於 POC 文件與研究基線階段，尚未建立可執行 application。

第一個驗證目標是 Patch 7.51 Auxesia 的 DoH WR.01 主件；後續再處理有 9 分鐘／Material Miracle 壓力的 WR.02，以及跨兩件不得失敗的 TR.01。

## 產品流程

1. 輸入任務、配方、角色能力與可用資源。
2. 系統根據完整 `CraftState` 與 `MissionState` 推薦下一技能。
3. 玩家在遊戲中執行或選擇其他技能。
4. 玩家回報 action success／failure、下一 condition 與必要的 state 修正。
5. 系統重新計算，直到單件製作與任務結束。

## 設計底線

- mechanics 正確性與 policy 品質分開驗證。
- 未知 condition rate 與社群推測必須保留來源、日期與信心。
- runtime 不建立完整決策樹，只保存玩家實際走過的 session path。
- 先用可讀、可測的 rule policy 與安全收尾模板，再以固定預算離線模擬改善 compact policy。
- 推薦在 browser 本機執行；不讀記憶體、不攔封包、不自動操作遊戲。
- 所有建議都需可解釋、可修正、可 replay。

## 文件入口

- [Agent 工作指南](AGENTS.md)
- [完整研究交接](cosmic-expert-crafting-solver-poc-handoff.md)
- [專案使命](.agents/skills/mission/project_mission.md)
- [產品架構](.agents/skills/mission/product_architecture.md)
- [技術架構](.agents/skills/professional/technical_architecture.md)
- [POC 實作計畫](.agents/roadmaps/poc_implementation_plan.md)
- [待實證問題](.agents/research/open_questions.md)

## 預定技術方向

預設延續 Frozen Rabbit 系列：TypeScript、Vue 3、Vite、Tailwind CSS、PrimeVue、Vue I18n、Vitest 與 Playwright。核心 mechanics 先維持單一 TypeScript source；只有離線模擬 throughput 的量測證明有需要時，才評估 Rust／WASM batch core。

正式 scaffold、開發指令、hosting 與 license 尚未定案；在實際檔案存在前，本段只代表 target baseline。
