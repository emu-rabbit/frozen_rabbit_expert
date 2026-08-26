# Frozen Rabbit Expert 目前 Roadmap

## 文件角色

本 roadmap 只管理下一個產品決策、交付 gate 與停止條件。Current facts 看 [current_state.md](../current_state.md)；單次 run 數字留在 evaluation output 或 archive。

## 交付目標

在對外發布前，全部 432 個 catalog 配方都要通過使用者接受的整體 evidence review。產品不以成熟度分級掩蓋弱 family；發現系統性失敗就修正，或由使用者重新決定產品範圍。

## 已鎖定方向

- 相同求解規則的配方共用 mechanics family 與評測。
- 舊 TypeScript solver 永久凍結。
- 新策略、測試與改善只在 Rust。
- v0.22 overnight 已由使用者完成，但本文件治理 task 不核對結果。
- Mission controller 不在目前承諾範圍。
- 最終 runtime 需要主要求解器與小於 100ms p95、valid state 0 policy-null 的快速求解器。
- Web 採 WASM 或新的 TypeScript 核心，等採用 Rust 結果時才以實測決定。
- 長跑只由使用者啟動；agent 交付命令後結束。

## 下一個決策

### 1. 獨立核對 v0.22

另一個 task 讀取已保存的 v0.22 run，驗證：

- immutable config、binary／ABI／solver identity；
- 完整 shards、exit status、saved episodes；
- family × equipment × risk × world；
- progress-only 與 hard-quality；
- paired wins／losses、policy-null 與 regressions；
- result 是否足以支持採用或繼續迭代。

文件治理 task 不先填結論。

### 2. 使用者選擇 Rust 下一步

核對後由使用者選擇：

- **繼續迭代**：只在 Rust 根據可重複 family failures 建 hypothesis、paired gate 與停止規則。
- **決定採用**：凍結採用 identity，進入 Web 核心比較與雙求解器產品化。

不能因「已經跑完」自動採用，也不能因 aggregate improvement 隱藏 hard-quality regressions。

## 若繼續 Rust 迭代

每個 hypothesis 先寫：

- 要修復的 family／state failure；
- runtime 可觀測 selector signal；
- baseline／candidate identity；
- paired cases、veto 與 practical effect；
- deadline／worker budget；
- 何時停止。

專用調整要由 mechanics、objective、condition 或 state signal 選擇，不能讀 recipe／equipment ID。Hard-quality、weak-equipment 與 recovery 分開判斷，不以更多 seeds 代替結構修正。

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
- hard-quality completion；
- 主／快速 solver illegal、policy-null、timeout 與 latency；
- 玩家偏離、undo、resync、reload 與 export；
- target-device browser／mobile UX；
- synthetic／assumption／live evidence 界線；
- 所有仍存在的 systematic failures。

只有使用者明確批准後才發布全部 432 配方。`README.md` 與部署另由使用者下指令，不屬本 roadmap 自動步驟。

## 研究停止規則

- Candidate 造成 baseline completed→candidate failed，依事前 veto 處理。
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
