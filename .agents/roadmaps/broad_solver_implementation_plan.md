# Frozen Rabbit Expert 目前 Roadmap

## 文件角色

本 roadmap 只管理下一個產品決策、交付 gate 與停止條件。Current facts 看 [current_state.md](../current_state.md)；單次 run 數字留在 evaluation output 或 archive。

## 交付目標

在對外發布前，全部 432 個 catalog 配方都要通過使用者接受的整體 evidence review。產品不以成熟度分級掩蓋弱 family；發現系統性失敗就修正，或由使用者重新決定產品範圍。

## 已鎖定方向

- 相同求解規則的配方共用 mechanics family 與評測。
- 舊 TypeScript solver 永久凍結。
- 新策略、測試與改善只在 Rust。
- 第六批 v0.30 overnight 已檢測並分析完成。使用者接受它作為有足夠改善幅度、仍有局部小幅缺陷的下一階段參考 baseline；版本身份及結果入口由 current state 擁有。
- 下一步開始嘗試 Rust 求解器基礎架構改動，以能力對照、分段驗收與離線證據保留既有成果。
- Objective 由 recipe `qualityMax`、一般收藏品四檔、Master 連續品質與 HQ 機率曲線完整定義。
- Mission controller 不在目前承諾範圍。
- 最終 runtime 需要主要求解器與小於 100ms p95、valid state 0 policy-null 的快速求解器。
- Web 採 WASM 或新的 TypeScript 核心，等採用 Rust 結果時才以實測決定。
- 長跑只由使用者啟動；agent 交付命令後結束。

## 下一階段：保留成果的基礎架構改動

方向已由使用者選定；本次只更新文件，尚未開始新架構實作，也未選定新 candidate identity。v0.30 的完整 [結果分析](../../reports/generic-cosmic-overnight/v030-review-20260827/review.md) 已結案；[遷移風險評估](../../reports/generic-cosmic-overnight/v030-review-20260827/migration-risk-assessment.md) 保留可能遺失的能力、證據限制與分段理由。

目標是把分散的順序規則整理成可比較、可追蹤的候選與續作證據，逐步交給共同 scorer。Mechanics、objective、既有搜尋與兩個 Rust base engines 先重用。結構搬移與策略改變分開驗收，避免把能力漏搬和新策略取捨混成同一種退步。

Web 採用與正式發布留待各自的 evidence review。新架構的效果與搜尋盲區由後續實驗評估。

### 每個策略實驗先聲明

- 要改善的玩家結果與 family／state failure；
- runtime 可觀測 selector signal；
- baseline／candidate identity；
- 主要量尺、配對／保留集、加權方式、practical effect、可接受代價與正確性 gate；
- deadline／worker budget 與停止條件。

專用調整要由 mechanics、objective、condition 或 state signal 選擇，不能讀 recipe／equipment ID。Hard-quality、weak-equipment 與 recovery 分開判斷，不以更多 seeds 代替結構修正。

### 尚未實作的 route-aware candidate portfolio

Budgeted、Semantic、progress、quality、condition、resource 與 specialist modules 各自提交首步 action、後續路線與共同證據，由單一 comparator 決策。評分依可比較的證據與預期結果；多個來源只補充證據。相同 action 共用 mechanics preview，並保留各自的 consumer、reserve 與 context 更新。

Comparator 先處理合法性、terminal、必要品質與明示的安全限制，再比較完整品質 utility、下行風險、資源、工序與有限續作。完工證據分成「已找到路線／已反證／預算內未找到」三種狀態。Pareto dominance 在 buff、condition、combo、一次性資源與 context 可比較時使用；其餘保留為待比較的取捨。

比較器保留跨步 route intent，初始能表達進展準備、品質累積、爆發準備、爆發執行、收尾與恢復；記錄進入／退出條件、仍有未來價值的 setup、預期 consumer 與切換原因。Intent 提供比較脈絡，技能合法性由 mechanics 決定，路線去留依未來收益判斷。

Condition／specialist 機會區分暫時 interrupt 與正式換路線。插入後原路線仍有效時可返回先前 intent；玩家偏離、forced outcome 或路線失效時依實際 state 重建。既有 guide、Teamcraft 與玩家常見階段只作初始假說，由跨 family／裝備／risk／world 的證據決定保留或改寫。

### 建議的分段實施與驗收

1. **保留能力與證據**：凍結 v0.30 source checkpoint、binary 與第六批輸出；建立能力到原 owner、收益案例、損失案例的對照，供離線驗收與診斷。
2. **Shadow 與路線註記**：定義 `CandidateProposal`／`CandidateEvidence`，收集來源、legal preview、成功／失敗分支、完工證據、品質 utility、資源與 route budget；仍回傳 v0.30 action。Route intent 先作旁觀註記，使用隔離的觀測資料，驗證正式 RNG、context 與原決策預算保持一致。
3. **新資料流獨立承接舊行為**：分批包裝 `BudgetedCondition`／`Semantic Port` 與領域規則，必要時暫時保留舊仲裁順序。以新流程獨立算出的選擇，和凍結版本比對 action、option／persona、完整 context、state、RNG、資源計數與停止結果。
4. **逐類開放新策略**：先選一個可觀測範圍讓共同 scorer 決策，其他 producers 保持觀測。以「繼續目前路線」作初期參考候選；在固定預算下比較首步及 continuation，包括 setup consumer、恢復與收尾。此階段按策略效果驗收，允許勝負互換；初期保守切換是降低探索風險的手段，不是永久相容義務。
5. **完成比較後移除舊路徑**：新流程通過保留集效果、玩家偏離、正確性與 latency 檢查後，移除舊 ordered Base／暫時仲裁。Runtime 收斂到採用的決策流程，凍結 binary 留作離線 evidence。

Exact parity 驗收宣稱不改行為的階段；具體 corpus 與可不同的觀測 metadata 要先聲明。策略階段依 [algorithm_verification.md](../skills/domain/algorithm_verification.md) 比較機率效果、重要切片與成本，容許有意的勝負取捨。

已看過的六批資料作 development／回歸與診斷，下一版另設真正未參與調整的 seeds／保留集並覆蓋完整矩陣。報告配對與群集不確定性，檢查有意義的切片與代價；未預先約定或超出容忍界線的取捨交使用者決策。

觀測至少包括 route 切換與相鄰來回切換、interrupt 返回率、有未來價值的 setup 被放棄、候選缺席或比較選錯、合併／深入比較候選數、展開數與工序長尾。新增 latency 要和完成率、完整品質及重要切片改善一起判斷；固定 work budget 並量測 native／未來目標裝置 p50／p95／p99／max，僅低於 3 秒不足以採用。

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
