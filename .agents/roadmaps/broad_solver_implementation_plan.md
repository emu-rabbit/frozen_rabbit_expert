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
- v1.12 是目前採用的 Rust solver 基礎；它已通過 completion-aware full-run gate，保留 v1.11 的主要一般收藏品收益並改善相對 v1.1 的完成。新策略、測試與改善只在 Rust，並以通用 mechanics／objective／condition／state signal 選擇。
- 長跑只由使用者啟動；本 roadmap 不以 wall-clock 時程代替產品結果。

## 實施順序

### 1. 完成一次最難品質能力研究

依 [active brief](../overnight_review_brief.md) 比較 F36／F46 的 success／near-miss exact tapes，拆分 E09→E10 的 stats 與 specialist action 收益，最多建立一個由 mechanics／condition／crafter／state 選擇的通用能力。

Promotion 必須在 E02／E09／E10 × 三個主要 worlds × 14 個 hard-quality families 守住 required-quality completion、0 illegal、0 policy-null、0 新增 action-limit與每步 3 秒上限。若沒有清楚淨回報，保存負結果並結束這條 Rust 假說；不以擴大 beam、depth 或 seeds 延後 Web。

### 2. 接入 Web 並持續迭代

基本製作、讀球價值與必要安全 gate 已成立。完成上述一次 bounded hard-quality 研究後開始 Web runtime 採用；solver 可以在 Web 開發後持續改善，玩家自行偏離後的深度 recovery 屬後續能力，初期只需正確接收實際 state 並重新推薦。

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
