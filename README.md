# Frozen Rabbit Expert

Frozen Rabbit Expert 是一個開發中的 **Final Fantasy XIV 宇宙探索 EX+ 高難度巧匠即時決策助手**。

目前 POC 讓玩家輸入裝備面板的作業精度、加工精度與 CP，在固定配方中取得逐步技能推薦；每次玩家回報實際技能結果與下一個 condition 後，系統會按完整 state 重新計算。目標不是產生固定巨集，也不宣稱能找到全域最佳解或保證成功。

## 目前狀態

目前網站已接入 `cosmic-titanium-guide-integrated-v1.0.0`，作為使用者明確接受的暫時實戰候選。固定目標是繁中遊戲內的「宇宙鈦鐵錠」（Cosmotized Ilmenite Ingot，Recipe ID `36282`、Item ID `48360`），規格為作業 7300、耐久 30、品質與必要品質 18900。這仍是單一配方、單一裝備 profile 的開發成果，不是跨配方或真實球色分布下的保證成功率。

目前包含：

- 玩家輸入作業精度、加工精度、CP，並可切換是否裝備宇宙工具；
- 依 recipe level divider／modifier 自動計算基礎作業與品質；
- Normal、Good、Centered、Sturdy、Pliant、Malleable；
- Phase 0 所需的 Lv.100 作業、加工、修復與 buff action 子集；
- 第一步先選本步球色；之後推薦下方直接詢問結算球色，點球本身就代表推薦已施放並會立即計算下一手；只有可能失敗的技能才先詢問成功／失敗；
- `cosmic-titanium-guide-integrated-v1.0.0`：把玩家指南、整段作業／品質收尾檢查、耐久循環、有限風險收尾與實際 action history 合併成可重建的逐步決策器；偏離推薦、undo 或 reload 後會依目前事件歷史重建路線記憶；
- 強決策在 Web Worker 執行，不阻塞畫面；網站以 3 秒作硬上限，逾時便終止 worker 並回到 `cosmic-titanium-lookahead-fallback-v1.4.0` 快速保底；
- guide research catalog 與 scenario oracle 涵蓋起手、condition 資源轉換、加工／中級加工／上級加工、加工／精煉加工、觀察／上級加工、改革四步、耐久循環與品質／作業收尾；
- `cosmic-titanium-rollout-teacher-v0.1.0` 程式與測試仍保留作離線研究，但 `RESEARCH_TEACHER_PROMOTED=false`，不再對玩家產生 recommendation；
- `packages/policy-lab` 保留舊 reachable-state／compact-scorer 研究作負結果與 ablation，並新增 episode stop-reason taxonomy、hard-stop-aware objective、722／749 CP profiles、evaluation corpus manifests、safety-projected continuation MPC、paired evaluator與第一版 `video-informed-mainline-v1` option controller contract；
- 2026-08-11 玩家成功影片已轉成 37 步 golden trace；修正第 11／20 步為冒進加工後，所有可直接觀測的作業、品質、耐久與 CP 逐步重播一致，原始影片不納入 repository；
- 目前 5408 作業精度／5237 加工精度／749 CP／宇宙工具 ON 的 development 首批測試為 31／72（3 組假設球色環境分別 19／24、8／24、4／24），完整 development 384 場為 140／384。這些球色環境仍是假設，且資料已參與開發，只能比較版本，不能解讀成玩家實戰成功率；
- 12,809 次本機決策量測為 p95 `0.865ms`、p99 `7.0ms`、最慢 `417ms`；主要體驗目標仍是大多數低於一秒，網站另以 3 秒硬切快速保底；
- 主畫面只保留目前狀態、主推薦、一行理由與下一個必要回報；替代技能、完整技能面板、歷史、匯出與狀態校正都保留在次要折疊區；
- undo、state resync、local persistence 與匿名 JSON export；
- domain／data／protocol／solver unit tests 與可重跑的 runtime benchmark。

配方 identity、recipe level 參數與 Blacksmith action icon ID 來自 XIVAPI game data；公式順序與 action semantics 對照 Teamcraft Simulator revision `74e167a`。TW 7.51 遊戲內證據另確認一個有限範圍的取整差異：Recipe `36282`、加工精度 `5140`、通常、內靜 3、改革有效時，上級加工實際增加 `935`，Teamcraft 公式則為 `936`；runtime 以 versioned empirical correction 精確匹配此案例，不外推至未驗證狀態。玩家當前球色仍完全依手動回報；未知下一球的 sensitivity profiles 都是 provisional assumption，不是官方機率。第一條完整成功 trace 已通過，但 buff／Inner Quiet 因影片裁切只能由 replay 推導，且仍缺 failure／recovery trace corpus 與正式 held-out statistical evaluation；scenario oracle 通過不代表實戰 policy 已通過。

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
npm run train:policy -- --output .tmp/policy-training/pilot --max-states 12
```

本機開發網址預設為 `http://localhost:4173`。

## 產品流程

1. 輸入角色面板的作業精度、加工精度與 CP，設定宇宙工具 toggle。
2. 選擇開場球色，等待主推薦。
3. 在遊戲使用推薦技能；若技能可能失敗，先在網站回報成功／失敗。
4. 直接點選遊戲結算後的新球色；這次點擊同時記錄推薦技能、保存結果並開始計算下一手，不需「我已施放」。
5. 若玩家使用別的技能，可在折疊區改選；誤按則使用不顯眼但常駐的上一步或狀態校正。

## 設計底線

- mechanics 正確性與 policy 品質分開驗證。
- 未知 condition rate 與社群推測必須保留來源、日期與信心。
- runtime 不建立完整決策樹，只保存玩家實際走過的 session path。
- guide policy 是可追蹤的基準與搜尋先驗；目前 v1.0.0 是經使用者接受的單配方實戰 pilot，不等於已通過跨裝備、真實球色或未看資料的正式 promotion gate。
- 推薦在玩家本機執行；目前 web app 不是永久唯一平台。大多數決策目標低於一秒、硬上限 3 秒，快速 fallback 永遠保留；不讀記憶體、不攔封包、不自動操作遊戲。
- 所有建議都需可解釋、可修正、可 replay。

裝備設定另存於 localStorage key `frozen-rabbit-expert/equipment-v1`，與進行中的 session 分開保存；宇宙工具開啟時，高品質 condition 的品質倍率使用 `1.75×`，否則為 `1.5×`。

## 文件入口

- [Agent 工作指南](AGENTS.md)
- [2026-08-11 玩家影片與漸進訓練完整交接](expert-crafting-training-handoff-2026-08-11.md)
- [完整研究交接](cosmic-expert-crafting-solver-poc-handoff.md)
- [專案使命](.agents/skills/mission/project_mission.md)
- [產品架構](.agents/skills/mission/product_architecture.md)
- [技術架構](.agents/skills/professional/technical_architecture.md)
- [POC 實作計畫](.agents/roadmaps/poc_implementation_plan.md)
- [待實證問題](.agents/research/open_questions.md)

## 技術方向

目前使用 npm workspaces、TypeScript、Vue 3、Vite、Tailwind CSS、Vue I18n 與 Vitest。Phase 0／1 未引入 PrimeVue、server、database、state framework 或 WASM；核心 mechanics 維持單一 TypeScript source。

## GitHub Pages

`.github/workflows/deploy-pages.yml` 已準備好在 `main` push 或手動執行時跑測試、typecheck、Vite build 並部署 `apps/web/dist`。第一次使用前，需在 repository 的 `Settings → Pages → Build and deployment → Source` 選擇 `GitHub Actions`；目前只完成 workflow 與本機子路徑 build 驗證，尚未 push 或實際部署。

Playwright suite 與正式 license checklist 尚未完成。
