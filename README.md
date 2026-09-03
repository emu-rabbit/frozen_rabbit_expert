# Frozen Rabbit Expert

Frozen Rabbit Expert 是開發中的 **Final Fantasy XIV 宇宙探索高難度製作即時決策助手**。

玩家選擇配方、輸入角色面板與風險偏好後，每一步回報實際技能結果與 condition；系統按完整 state 重新計算下一個推薦技能、理由與信心。它不是固定巨集，不讀取遊戲記憶體或封包、不自動按鍵，也不宣稱全域最佳或保證成功。

## 目前產品主線

早期五個專用配方 POC 已完成 live 任務。舊 guide、certificate、route 與 frozen corpus 只保留作歷史、teacher／regression evidence，不再是 Web runtime 或新增配方的相容性義務。

目前第一批 catalog 完整涵蓋目前 patch 的宇宙探索高難配方：

- 432 個可搜尋、可選擇的 recipe identity；
- 八個製作職各 54 個；
- 依真正影響求解的數值、condition 與 objective 分為 50 個 mechanics families；
- 同數值但不同名稱／職業的配方共用 mechanics 與 generic solver，不複製策略；
- 五個舊配方提供已知繁體中文名稱與既有 objective knowledge。經固定 WKS mission data 與逐任務來源確認後，釘與巨匠藥的單件四檔 template 會沿用到同 mechanics／同要求的整個 family；mission identity、倒數、材料鏈、數量與跨件總分仍分開。每個配方的品質上限由 `qualityMax` 唯一擁有。

Catalog 由 `tools/import-cosmic-expert-recipes/run.mjs` 生成。它交叉比對 WKS mission membership 與 XIVAPI level 100 Expert recipe，而不是只用 `IsExpert=true`；因此不會誤收同為 Expert、但不屬於宇宙探索的 8 個 Crumbling Aqueduct Master Recipes。

目前配方資料 snapshot：

- XIVAPI game data：`284bb7f44b9c0976`
- XIVAPI schema：`exdschema@2:rev:83e965d091116f895d5b17573cc5d12909a5f407`
- `WKSMissionRecipe` revision：`1b5c1af6a79063015f53fda7752cc84ff0545342`
- `WKSMissionUnit` revision：`c142b1269a76e9e3fffc42f984a5f193ba565ddc`
- canonical content SHA-256：`2a6b26ca88bbc568d80df82b5333b1205d1a9f1aea39d9070ff9f64b4fb03530`
- catalog version：`cosmic-expert-catalog-284bb7f44b9c0976-3c0ac44a05e9bf29-v2`

## Generic Solver

Web live path 目前仍使用已凍結的 TypeScript `generic-craft-route-objective-condition-v0.5.1`；它只作尚未替換的 Web 現況與 historical migration evidence，不再接受策略修改。現在的 mechanics／generic policy／`PlannerContext`／closed-loop episode 迭代只在 Rust core 進行，日間與 overnight 使用 native release build。日後 Web 要接 Rust→WASM 或依採用行為建立新的 TypeScript implementation，會另以目標裝置實測決定；舊 solver 不會解凍。輸入包含：

```text
CraftState
  + RecipeProfile / CraftObjective
  + actual CrafterProfile
  + stable | balanced | aggressive
  -> legal candidates + mechanics preview
  -> tactical dominance / bounded lookahead
  -> recommendation + reasons + confidence
```

目前已落地：

- 實際 craftsmanship、control、CP、宇宙工具與專家證直接參與 mechanics，不使用 exact-profile router；
- stable／balanced／aggressive 會改變完成價值、品質權重、shortfall 與失敗分支成本；
- live planner 直接讀取完整 `CraftObjective`；hard-quality 追求 `qualityMax`，一般收藏品依 100／300／700／滿品質四檔塑形，HQ 類依品質對應的 HQ 機率曲線比較，Master 收藏品則保留連續品質價值；
- Good 時會實際比較 Precise Touch、Intensive Synthesis、Tricks of the Trade 等機會，不以無條件硬規則取代完整路線；同資源且明顯被 Precise Touch 支配的一般品質技能會被排除；
- 品質價值與 mechanics completion 分離：`requiredQuality=0` 的配方只要作業完成即可交貨；四檔或 HQ 機率不會被偽造成遊戲失敗條件；
- Robust condition 已支援當步耐久減半、下一 advancing step 強制 Sturdy，UI 不會要求玩家虛構下一顆隨機球；
- Web Worker、同一 generic policy 的同步 fallback、`3000ms` watchdog、undo、resync、偏離建議與匿名 session export 仍保留。Worker 與 fallback 是執行隔離／失效保護，不代表兩個不同強度的策略。

目前 432 個 catalog entries 的配方／condition binding 為 `mechanics-ready`；generic recommendation 只標示為 `development-preview`，尚未通過 roadmap 的 `experimental` gate。這表示玩家可以試用並回報紀錄，但不代表 432 個配方都有可靠路線或 validated 實戰成功率；後續以 50 個 family 為單位做 closed-loop、跨裝備與玩家 trace 驗證，避免重複燒掉 432 份相同成本。

overnight runner 由 Node parent 負責 family × risk shards、續跑、timeout、atomic evidence 與四表；每個 episode 都由 Rust native release binary 執行，engine／ABI／binary／solver identity 不符即 fail closed，不會退回 TypeScript evaluator。當次 workers 與完整命令由 agent 在 bounded smoke 後交付，長跑只由使用者啟動。詳見 [Generic Cosmic 長時間評測 workflow](.agents/workflows/run-generic-overnight-evaluation.md)。

## 產品流程

1. 搜尋並選擇配方。
2. 輸入角色面板的作業精度、加工精度與 CP，設定宇宙工具、專家證及穩健／平衡／進取。
3. 系統以 Normal 開始第一步並給出建議。
4. 在遊戲施放技能；只有可能失敗的技能需要先回報成功／失敗。
5. 直接點選結算後的 condition，系統立即更新 state 並重新推薦。
6. 玩家若使用其他技能，可從完整技能面板回報；誤按可 undo 或 resync。

進行中的 craft 不跨重新整理保存。裝備與風險偏好分別保存於：

- `frozen-rabbit-expert/equipment-v2`
- `frozen-rabbit-expert/risk-preference-v1`

## 開發指令

```powershell
npm install
npm run data:import:cosmic-expert
npm run data:check:cosmic-expert
npm run evaluate:generic-cosmic-families
npm run test:generic-cosmic-overnight
npm run evaluate:generic-cosmic-overnight:smoke
npm run evaluate:generic-capability-bounds
npm run evaluate:generic-pathwise-headroom
npm run dev
npm test
npm run typecheck
npm run build
npm run benchmark:solver
```

本機開發網址預設為 `http://localhost:4173`。

## 驗證與宣稱邊界

- mechanics correctness、catalog identity、policy quality 與實戰分布分開驗證。
- evaluator 的 `completed` 是 mechanics completion，不等於滿品質；`requiredQuality=0` 代表作業完成即可交貨，`requiredQuality>0` 才要求作業與最低品質都達標。報告固定分開 `progress-only`、`progress-and-required-quality`、四檔收藏品品質與 `qualityMaximumReached`，HQ 類另以 HQ 機率曲線計分，避免用 hard-quality failure 污染一般交貨底線。
- solver 成效的主要 cell 是 family × equipment profile／tier × risk × world；difficulty strata 必須在看 candidate 前主要依已驗證 recipe mechanics 與 objective burden 定義。之後才分開看困難 family＋弱裝備、困難 family＋中期裝備，以及簡單 family 是否維持高達成率；全 catalog 混合完成率只能作 overview。
- 2026-08-24 的 v0.5.1 frozen paired full matrix 是擴充 registry 前、使用當時三個 profiles 的 historical 2400-episode checkpoint。它將 progress-only completion 從 `1726／1728` 提升到 `1728／1728`，滿品質 paired outcomes `+1／-0`；hard-quality 仍只有 `104／672` completed。平均 utility 差 `+0.000611` 的信賴區間落在預先宣告的 ±2% 無實質差異帶，因此這是局部 correctness checkpoint，不是目前 10-profile coverage、普遍高分提升或裝備極限證明。
- condition probability 未知時只作 assumption／sensitivity，不稱真實成功率。
- 2026-08-25 的 optimistic mechanics bound 已 live 跑完 10 profiles × 50 families＝500 cells，projected scans 為 `304,760,000／310,000,000`；結果是 0 provably impossible、0 completion impossible under relaxation、500 inconclusive。正式 10 組皆以實際 i720 Cosmic 或 i750 Stellar fixed-relic 主手工具為基礎；i780 與 CP 特化裝備仍是 future references，細節見[待實證問題](.agents/research/open_questions.md)。這把尺忽略 CP、耐久與 setup 等代價，目前仍太鬆；它只能在得到 negative result 時證明目標不可能，不能因全部未排除就說實際可達或裝備已到極限。fixed-tape clairvoyant search 也只能證明同一未來路線存在，兩者都不能取代 causal policy 上下界。
- 低裝備採 best-effort：避免明顯錯誤、保留合理 recovery 並追求能力範圍內的品質，但不承諾與高裝備相同的高分尾端。
- Item identity 與 mechanics 來自固定 XIVAPI／datamining snapshot；沒有可信繁體中文來源的配方暫以英文顯示，不自行翻譯。
- 未匯入的官方 item icon 使用 code-native placeholder，避免大量 404、未授權複製或 runtime hotlink。
- 舊五配方的詳細實驗與正負結果由 Git history 保存；目前文件只保留仍有效的產品契約與可重播評測結果。

## 文件入口

- [Agent 工作指南](AGENTS.md)
- [專案使命](.agents/skills/mission/project_mission.md)
- [產品架構](.agents/skills/mission/product_architecture.md)
- [廣泛配方 Generic Solver 實作計畫](.agents/roadmaps/broad_solver_implementation_plan.md)
- [Generic Cosmic 夜間深度評測 workflow](.agents/workflows/run-generic-overnight-evaluation.md)
- [技術架構](.agents/skills/professional/technical_architecture.md)

## 技術與部署

專案使用 npm workspaces、TypeScript、Rust、Vue 3、Vite、Vue I18n 與 Vitest。Web 透過 Worker 執行 Rust→WASM 的 production solver；TypeScript 負責 Web、session、protocol、data 與 evaluation orchestration，舊 TypeScript solver 已凍結且不再是 runtime owner。

公開頁面位於 `https://emu-rabbit.github.io/frozen_rabbit_expert/`。是否已包含目前 checkout 的 432 配方與 generic runtime 必須另做 live smoke，不能由本機狀態推定；本次工作不會自行 push 或 deploy。
