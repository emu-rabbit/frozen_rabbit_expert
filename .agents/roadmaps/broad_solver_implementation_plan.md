# Frozen Rabbit Expert 目前 Roadmap

## 文件角色

本 roadmap 只管理下一個產品決策、交付 gate 與停止條件。Current facts 看 [current_state.md](../current_state.md)；單次 run 數字留在 evaluation output 或 archive。

## 交付目標

在對外發布前，全部 432 個 catalog 配方都要通過使用者接受的整體 evidence review。產品不以成熟度分級掩蓋弱 family；發現系統性失敗就修正，或由使用者重新決定產品範圍。

## 目前產品決策

- 主要使用者是有滿等巧匠、願意逐步回報球色，希望學習高難製作或把即時計算交給工具的玩家。
- 正式支援裝備以有食物、藥與合理鑲嵌的 720／750 裝備為主；不足裝備提供誠實 best-effort。
- Balanced 是預設風險。它只用少量失敗交換玩家看得見的大幅品質提升；Aggressive 承擔更多失敗以追求更多滿品質。
- 玩家收益先看完成，再看已完成成品是否跨過有意義獎勵檔位；HQ／Master 的滿品質尾端優先於未跨檔的小幅平均增益。
- v1.1 是基本能力基準；completion-aware 描述性候選是目前 v1.11 球色與 funded-route 經驗的穩固延伸。新策略、測試與改善只在 Rust，並以通用 mechanics／objective／condition／state signal 選擇。
- 長跑只由使用者啟動；本 roadmap 不以 wall-clock 時程代替產品結果。

## 實施順序

### 1. 完整確認 completion-aware 候選

以同案例、同 RNG tape 比較 v1.1、球色機會消融與 completion-aware 候選。Bounded gate 已恢復全部已知的完工缺口，並在未見 seed 小矩陣達到一般收藏品完成後檔位 +5.38 pp、完成持平；下一步只做完整正式支援矩陣確認。

主切片為 Balanced × E02／E09 × `balanced-iid`，再看 E03／E05／E07／E10 與 `normal-heavy`、`opportunity-scarce`。`all-normal` 保留為結構壓力測試。接受條件由 [active brief](../overnight_review_brief.md) 固定，其中包括：

- Completion-aware 候選相對球色機會消融帶來至少 5 percentage points 的主要可感知品質收益，完成率下降不超過 0.5 percentage points；
- 相對 v1.1 保留至少 80% 的 v1.11 一般收藏品主要收益；
- HQ／Master 不用未跨檔的平均品質小增幅交換滿品質尾端；
- 主要求解器單步低於 3 秒，總評測成本和品質收益一起判斷。

通過後才給數字版號並作為 Web 採用基礎；沒有足夠產品回報時，不為小百分點增加新的架構複雜度。

### 2. 擴充最難品質能力

完整確認通過後，以最強正式支援裝備研究 F36／F46 等 hard-quality。目標是維持非零達成並嘗試提高求解器表現；一次通用改善研究若沒有可觀回報，就保存證據並轉往玩家可見的下一項，而不是用更多 synthetic seeds 延長同一假說。

### 3. 接入 Web 並持續迭代

當基本製作、讀球價值與必要安全 gate 同時成立，開始 Web runtime 採用。Solver 可以在 Web 開發後持續改善；玩家自行偏離後的深度 recovery 屬後續能力，初期只需正確接收實際 state 並重新推薦。

## 每輪實驗契約

每輪先聲明玩家結果、可觀測 selector signal、比較身份、same-tape corpus、主要切片、practical effect、可接受代價與停止條件。實驗使用描述性 identity；只有經驗證的有意義推進才取得新數字版號。

專用行為必須由 mechanics、objective、condition 或 state signal 選擇。Recipe／equipment ID、seed、future RNG 與 evaluation label 不進 runtime。增加樣本只縮小已知效果的不確定性，不取代因果重播或結構修正。

## 若決定採用

### Web 核心比較

建立同一採用 corpus，比較：

- Rust→WASM；
- 依採用行為建立的新 TypeScript implementation。

量測 target-device latency、boundary transfer、載入、memory、bundle、結果一致性與後續同步成本。舊 TypeScript 不參與。

該 task 明確選定 Web compute owner；本 roadmap 不預判 WASM 一定較快。

### 主／快速求解器

交付：

- 主要求解器 3 秒 hard watchdog；
- 快速求解器 fixed budget、target p95 小於 100ms；
- valid nonterminal state 有 legal action 時 0 policy-null；
- bounded final selector；
- 每一步依 actual history 重試主要求解器；
- UI 明示主要／快速結果與 fallback 原因。

### 清理舊 runtime contract

在 implementation task 中乾淨移除：

- `development-preview` 等配方成熟度欄位與 UI；
- 舊 guide live fallback；
- 讓 frozen TS 看似仍是策略 owner 的 router／copy；
- 不再使用的 Mission controller 型別或 UI 預留。

## Release evidence

使用者最後 review 的 evidence package 至少包含：

- 50 families 的 mechanics／golden evidence；
- family × equipment × risk × assumed world matrix；
- progress-only delivery／meaningful quality；
- 四檔收藏品質量、hard-quality 滿品質與 HQ 機率 utility；
- 主／快速 solver illegal、policy-null、timeout 與 latency；
- 玩家偏離、undo、resync、reload 與 export；
- target-device browser／mobile UX；
- synthetic／assumption／live evidence 界線；
- 所有仍存在的 systematic failures。

只有使用者明確批准後才發布全部 432 配方。`README.md` 與部署另由使用者下指令，不屬本 roadmap 自動步驟。

## 研究停止規則

- 正確性、evidence identity 或明示 runtime 契約違反時，停止 promotion 並定位問題；個別配對損失按策略效果契約分析。
- 主要效果未達事前目標，或重要切片／成本的可信損失超出約定界線時，不直接切換；修正、停止實驗或交使用者決策，不以 aggregate 掩蓋。
- Effect interval 完整落入事前 immaterial band，停止該 hypothesis。
- Bound 仍結構性過鬆時停止擴樣本，先改善模型。
- Fixed-tape witness 只支持 route existence，不作 live success claim。
- 無法連到玩家可見 blocker 的 infrastructure／evidence work 不搶產品主線。
- Historical five-recipe threshold 或 exact-profile uplift 不作 milestone。

## Roadmap 更新規則

- 只保留目前 decision、next slices、gate 與 stop rule。
- Run 數字放 evaluator output；結論只連 evidence pointer。
- 完成的階段從本檔刪除或封存，不累積時間線。
- 每次更新同步 `current_state.md`，但不複製相同敘述到 `AGENTS.md`。
