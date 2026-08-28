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
- 新架構已完成 v1.1 全矩陣比較；目前以 v1.1 為迭代對照，優先提升所有球色下的必要品質及各類交付品質，並控制計算成長。
- Objective 由 recipe `qualityMax`、一般收藏品四檔、Master 連續品質與 HQ 機率曲線完整定義。
- Mission controller 不在目前承諾範圍。
- 最終 runtime 需要主要求解器與小於 100ms p95、valid state 0 policy-null 的快速求解器。
- Web 採 WASM 或新的 TypeScript 核心，等採用 Rust 結果時才以實測決定。
- 長跑只由使用者啟動；agent 交付命令後結束。

## 下一階段：以效果驗收的新求解器架構

統一 candidate portfolio、跨步 route intent 與共同 scorer 已可自主選招。下一階段改善全部球色的機會判斷與跨步銜接，按 hard-quality、一般收藏品、HQ、連續品質各自驗收；不累積配方 ID 或狹小案例規則。目前實作進度及 candidate identity 由 [current_state.md](../current_state.md) 管理。

優先重用可信的 mechanics、objective、資源判斷與有限搜尋。既有 `BudgetedCondition` 與 Rust `Semantic Port` 可提供候選或續作能力，重用粒度依新流程的用途與效果決定。v0.30 的 [結果分析](../../reports/generic-cosmic-overnight/v030-review-20260827/review.md) 提供比較基準；[能力參考與工程風險](../../reports/generic-cosmic-overnight/v030-review-20260827/migration-risk-assessment.md) 供實作取材與診斷。

v1.1 全矩陣研究已完成。下一個決策是具實質完成／品質提升且成本可接受的候選是否值得完整 overnight；當次候選、樣本與判讀界線由 active brief 擁有。Web 採用、獨立快速求解器與正式發布在後續各自驗收。

### 每輪實驗先聲明

- 要改善的玩家結果與 family／state failure；
- runtime 可觀測 selector signal；
- baseline／candidate identity；
- 主要量尺、配對／保留集、加權方式、效果相當的容忍區間、practical effect、可接受代價與正確性 gate；
- deadline／worker budget 與停止條件。

專用調整要由 mechanics、objective、condition 或 state signal 選擇，不能讀 recipe／equipment ID。Hard-quality、weak-equipment 與 recovery 分開判斷，不以更多 seeds 代替結構修正。

### 目標架構：route-aware candidate portfolio

Budgeted、Semantic、progress、quality、condition、resource 與 specialist modules 以 `CandidateProposal` 提交首步 action、後續路線與進入條件，以 `CandidateEvidence` 提供 legal preview、成功／失敗分支、完工證據、品質 utility、資源與計算預算，由單一 comparator 決策。評分依可比較的證據與預期結果；多個來源只補充證據。相同 action 共用 mechanics preview，並保留各自的 consumer、reserve 與 context 更新。

Comparator 先處理合法性、terminal、必要品質與明示的安全限制，再比較完整品質 utility、下行風險、資源、工序與有限續作。完工證據分成「已找到路線／已反證／預算內未找到」三種狀態。Pareto dominance 在 buff、condition、combo、一次性資源與 context 可比較時使用；其餘保留為待比較的取捨。

比較器保留跨步 route intent，能表達進展準備、品質累積、爆發準備、爆發執行、收尾與恢復；記錄進入／退出條件、仍有未來價值的 setup、預期 consumer 與切換原因。Intent 提供比較脈絡，技能合法性由 mechanics 決定，路線去留依未來收益判斷。「繼續目前路線」與其他方案一同接受有限續作比較，涵蓋準備後的技能、恢復及收尾；搜尋邊界採共同的續作估計。

Condition／specialist 機會區分暫時 interrupt 與正式換路線。插入後原路線仍有效時可返回先前 intent；玩家偏離、forced outcome 或路線失效時依實際 state 重建。既有 guide、Teamcraft 與玩家常見階段只作初始假說，由跨 family／裝備／risk／world 的證據決定保留或改寫。

### 實施順序與驗收

1. **保存比較基準**：保留 v0.30 source checkpoint、binary 與原始評測資料，整理主要能力、原 owner 和代表案例的精簡索引，供重用與診斷。先固定比較身份、資料用途及預算。
2. **建立可運作的新核心**：接通候選產生、共同證據、route intent、有限續作及選擇器，讓新流程實際選招。依新設計配置 context 與模組邊界，沿用適合的既有計算能力。
3. **儘早比較效果**：以有限且具代表性的案例涵蓋品質類型、condition set、裝備能力、risk 及玩家偏離，對照 v0.30 的完成、品質和成本。依差異選擇候選覆蓋、續作估計、路線銜接或資源使用的改善，再逐步擴大矩陣。
4. **驗證完整效果與採用價值**：完整共同 benchmark 用於跨版本對齊；產品採用再以另行確認、未參與調整的保留集驗證。各自依事前約定的效果、重要切片、正確性與成本界線判讀。
5. **收斂實作與交付**：根據採用結果整理模組和決策流程，移除已被取代的 runtime 路徑，保留 baseline binary 作離線比較。Web 採用依下節另行決策。

### 第一批交付

- 能由新架構自主選招的 Rust candidate，附明確 identity、重用範圍與計算預算。
- 正確性檢查與相對 v0.30 的首輪有限效果比較，清楚列出涵蓋範圍、收益、代價及不確定性。
- 支持下一個改善決策的原因分析，以及可重播的相關案例。

第一批證據用於判斷新架構的效果與後續優先級；採用判斷使用完整保留集。驗收與按需 trace 的投入方式統一依 [algorithm_verification.md](../skills/domain/algorithm_verification.md)。

本輪維持完整 64-seed 共同 benchmark，只執行新 candidate，沿用既有 v1.1 同案例結果作比較；不重算 v0.30 或整套 v1.1。未參與調整的新 seeds 另作 bounded 直接比較；獨立產品採用保留集的範圍另由使用者確認。效果分析保留配對與群集結構，重要切片與成本一起判斷；未預先約定或超出容忍界線的取捨交使用者決策。

計算成本採固定 work budget，先量測候選數、展開量與 native p50／p95／p99／max；目標裝置 latency 在 Web 採用階段實測。新增成本與完成、完整品質及重要情境的收益共同評估。

當前效能目標是完整共同 benchmark 以 2 workers 在 10 小時內完成。優先重用完全相同輸入的計算及已證實的搜尋界線，維持求解效果；若達標需要明顯品質代價，暫停策略變更並請使用者決定。

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
