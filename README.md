# Frozen Rabbit Expert

Frozen Rabbit Expert 是一個開發中的 **Final Fantasy XIV 宇宙探索 EX+ 高難度巧匠即時決策助手**。

目前 POC 讓玩家輸入裝備面板的作業精度、加工精度與 CP，選擇已支援配方後取得逐步技能推薦；每次玩家回報實際技能結果與下一個 condition，系統都會按完整 state 重新計算。目標不是產生固定巨集，也不宣稱能找到全域最佳解或保證成功。

## 目前狀態

網站目前支援四個可切換的實戰 scenario：宇宙鈦鐵錠、宇宙鈦鐵釘，以及 **【高難＋】製作高空作業所需的腳手架** 的「宇宙探索用的硬化木板」（Recipe `36205`／Item `48263`）與「高空作業用的腳手架」（Recipe `36208`／Item `48311`）。木板必須達 14900 必要品質後才能完成；腳手架是非收藏品，品質 0–22500 轉成最後一次 HQ 判定，而非把未滿品質視為失敗。四者都有獨立 objective、policy version 與 config；共用 mechanics 不代表已證明同一策略可跨配方。

目前包含：

- 玩家輸入作業精度、加工精度、CP，並可切換宇宙工具與專家證；三圍一律填角色面板最終值，不重複加專家證 bonus；
- 依 recipe level divider／modifier 自動計算基礎作業與品質；
- 錠／釘使用 Normal、Good、Centered、Sturdy、Pliant、Malleable；腳手架任務改用 Normal、Good、Good Omen、Sturdy、Pliant、Malleable、Primed；
- Phase 0 所需的 Lv.100 作業、加工、修復與 buff action 子集；
- 每次開始或切換配方時第一步自動固定為 Normal，不再詢問開場球色；之後推薦下方直接詢問結算球色，點球本身就代表推薦已施放並會立即計算下一手；只有可能失敗的技能才先詢問成功／失敗；
- 兩個 guide-integrated policy 都把玩家指南、整段作業／品質收尾檢查、耐久循環、有限風險收尾與實際 action history 合併成可重建的逐步決策器；偏離推薦、undo 或 reload 後會依目前事件歷史重建路線記憶；
- 強決策在 Web Worker 執行，不阻塞畫面；網站 watchdog 固定為 `3000ms`。`<50ms` 只是快速 fallback 的效能目標，不會觸發切換。worker 若啟動／執行立即失敗或回傳空結果仍會立刻 fallback，UI 現在會顯示「強決策／快速備援」、耗時、逾時或立即失敗原因及 policy version；
- 主畫面顯示目前物品 icon、名稱與任務，配方列可直接點選並立即以同一套面板數值開始新配方；
- guide research catalog 與 scenario oracle 涵蓋起手、condition 資源轉換、加工／中級加工／上級加工、加工／精煉加工、觀察／上級加工、改革四步、耐久循環與品質／作業收尾；
- `cosmic-titanium-rollout-teacher-v0.1.0` 程式與測試仍保留作離線研究，但 `RESEARCH_TEACHER_PROMOTED=false`，不再對玩家產生 recommendation；
- `packages/policy-lab` 保留舊 reachable-state／compact-scorer 研究作負結果與 ablation，並新增 episode stop-reason taxonomy、hard-stop-aware objective、722／749 CP profiles、evaluation corpus manifests、safety-projected continuation MPC、paired evaluator與第一版 `video-informed-mainline-v1` option controller contract；
- 2026-08-11 玩家成功影片已轉成 37 步 golden trace；修正第 11／20 步為冒進加工後，所有可直接觀測的作業、品質、耐久與 CP 逐步重播一致，原始影片不納入 repository；
- 歷史 v1.0.0 基準使用 5408 作業精度／5237 加工精度／749 CP／宇宙工具 ON，development 首批測試為 31／72，完整 384 場為 140／384；12,809 次當時的 guide 決策量測為 p95 `0.865ms`。這些資料只保留作版本脈絡，不代表目前實戰成功率或目前 benchmark；
- 目前專家 profile 為最終面板 5428／5257／764／宇宙工具 ON；玩家純 Observe 95 球計數 36／14／13／13／10／9 作主要 empirical marginal，嚴苛 assumed profiles 只作壓力參考。錠 v1.1.0 在 empirical 128 場為 96／128，stress 384 場為 163／384；兩者都是 development sensitivity；
- 釘 v1.2.0 先保護完成，再最大化高分尾端：保留 70% 作業緩衝，使用專心致志→集中加工、快速改革及最多三次不耗工次的設計變動等待高品質祝福，普通觀察預設不使用。完整 development 512／512，true failure／policy-null／safety violation 都是 0；high tier 88、`>=97%` 任務目標 69、`>=27100` 39。700–1000 分區間內精確換算仍未知，因此這些不是 Silver rate；
- 腳手架兩個新 policy 不使用專家技能，也不以專家 profile 訓練或評比。六組非專家裝備 × 三個 provisional condition profiles × 4 seeds 的快速 development screening 中，木板完成且滿品質 70／72，腳手架完成 72／72、滿品質 18／72，兩者皆 0 specialist recommendation／safety violation；樣本很小且已參與開發，只能用來找明顯退化，不是真實成功率或 frozen cross-equipment gate；
- 本輪 guide evaluator 的延遲仍在目標內；獨立 quick-fallback benchmark 連跑兩次則為 p95 `50.260ms`／`50.361ms`，略高於 `<50ms` gate，已如實保留為後續效能工作，不在本輪為壓線數字繼續調參；
- 主畫面只保留目前狀態、主推薦、一行理由與下一個必要回報；替代技能、完整技能面板、歷史、匯出與狀態校正都保留在次要折疊區；
- undo、state resync、local persistence 與匿名 JSON export；
- domain／data／protocol／solver unit tests 與可重跑的 runtime benchmark。

配方 identity、recipe level 參數、物品 icon ID 與 action icon ID 來自 XIVAPI game data；公式順序與 action semantics 對照 Teamcraft Simulator revision `74e167a`。TW 7.51 遊戲內證據另確認一個有限範圍的取整差異：Recipe `36282`、加工精度 `5140`、通常、內靜 3、改革有效時，上級加工實際增加 `935`，Teamcraft 公式則為 `936`；runtime 以 versioned empirical correction 精確匹配此案例，不外推至未驗證狀態。玩家當前球色仍完全依手動回報；腳手架的新 condition profiles 與 HQ 機率語意仍是 provisional evidence，不是官方 transition probability 或成功率。scenario oracle／development screening 通過不代表實戰 policy 已通過。

新增配方由 `apps/web/src/scenarios.ts` 集中綁定 recipe、objective、planner、物品 icon、預設裝備與 development equipment envelope，不再讓 UI／worker 寫死單一配方。跨裝備先由同一 scenario 的參數化 mechanics 與 coverage 標示支援；配方目標與策略分支仍各自 versioned，在足夠 frozen／OOD 證據前不硬合併成一個通用 policy。

## 開發指令

```powershell
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run benchmark:solver
npm run evaluate:nails-policy
npm run evaluate:elevating-platforms
npm run test:solver-oracle
npm run test:policy-lab
npm run train:policy -- --output .tmp/policy-training/pilot --max-states 12
```

本機開發網址預設為 `http://localhost:4173`。

## 產品流程

1. 選擇配方，輸入角色面板的作業精度、加工精度與 CP，設定宇宙工具及專家證 toggle。
2. 系統自動以 Normal 作第一步並開始計算，不需選擇開場球色。
3. 在遊戲使用推薦技能；若技能可能失敗，先在網站回報成功／失敗。
4. 直接點選遊戲結算後的新球色；這次點擊同時記錄推薦技能、保存結果並開始計算下一手，不需「我已施放」。
5. 若玩家使用別的技能，可在折疊區改選；誤按則使用不顯眼但常駐的上一步或狀態校正。

## 設計底線

- mechanics 正確性與 policy 品質分開驗證。
- 未知 condition rate 與社群推測必須保留來源、日期與信心。
- runtime 不建立完整決策樹，只保存玩家實際走過的 session path。
- guide policy 是可追蹤的基準與搜尋先驗；四個 scenario policy 都是待玩家重驗的候選版本，不等於已通過跨裝備、真實球色或未看資料的正式 promotion gate。
- 推薦在玩家本機執行；目前 web app 不是永久唯一平台。大多數決策目標低於一秒、watchdog 硬上限固定 3000ms，快速 fallback 永遠保留；不讀記憶體、不攔封包、不自動操作遊戲。
- 所有建議都需可解釋、可修正、可 replay。

裝備設定另存於 localStorage key `frozen-rabbit-expert/equipment-v2`，與進行中的 session 分開保存；舊 v1 設定會讀入並把專家證視為關閉。宇宙工具開啟時，高品質 condition 的品質倍率使用 `1.75×`，否則為 `1.5×`。

## 文件入口

- [Agent 工作指南](AGENTS.md)
- [錠玩家影片、漸進訓練與釘 v1.2.0 優化完整交接](expert-crafting-training-handoff-2026-08-11.md)
- [完整研究交接](cosmic-expert-crafting-solver-poc-handoff.md)
- [專案使命](.agents/skills/mission/project_mission.md)
- [產品架構](.agents/skills/mission/product_architecture.md)
- [技術架構](.agents/skills/professional/technical_architecture.md)
- [POC 實作計畫](.agents/roadmaps/poc_implementation_plan.md)
- [待實證問題](.agents/research/open_questions.md)

## 技術方向

目前使用 npm workspaces、TypeScript、Vue 3、Vite、Tailwind CSS、Vue I18n 與 Vitest。Phase 0／1 未引入 PrimeVue、server、database、state framework 或 WASM；核心 mechanics 維持單一 TypeScript source。

## GitHub Pages

公開頁面目前位於 `https://emu-rabbit.github.io/frozen_rabbit_expert/`；本次工作樹的腳手架、UI 與診斷改動尚未 commit、push 或部署。`.github/workflows/deploy-pages.yml` 會在 `main` push 或手動執行時跑測試、typecheck、Vite build 並部署 `apps/web/dist`。

Playwright suite 與正式 license checklist 尚未完成。
