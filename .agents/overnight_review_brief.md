# Overnight 評測交接簡報

## 目前狀態

第六批已檢測、分析並結案。新架構 v1.0 已完成第一批 development 比較，目前優先改善其完成率與續作估值；現況與 baseline／candidate 以 [current_state.md](current_state.md) 為準。

原第六批 brief、跑前條件及結案更正保存在 [archive handoff](archive/handoffs/overnight-v030-review-2026-08-27.md)。完整數據與判讀見 [結果分析](../reports/generic-cosmic-overnight/v030-review-20260827/review.md)，原始 run 的 v0.22／v0.30 兩臂身份保持不變。

## 下一輪交付前要固定的內容

下一階段以 `generic-craft-specialist-resource-guard-v0.30.0` 作效果 baseline，依 [roadmap](roadmaps/broad_solver_implementation_plan.md) 改善 `generic-craft-route-portfolio-v1.0.0`。本輪 [開發結果](../reports/generic-cosmic-overnight/v100-development/results.md) 已分開呈現滿品質收益、完成率落差與成本；[開發命令](../reports/generic-cosmic-overnight/v100-development/commands.md) 可重播小批次及診斷。完整 overnight 交付在完成下列固定內容後準備。

下一輪 brief 以比較新架構的求解效果、重要情境與成本為目的，先固定：

- 具體改動假說、受益面、可觀測 selector signal 與已知風險；
- 由 binary handshake 核對的 baseline／candidate、ABI、binary、config 與 corpus identity；
- 主要量尺、切片及加權、效果相當的容忍區間、practical effect、可接受代價與停止條件；
- development／未見保留集、配對與群集統計方法；
- 四表入口、完整矩陣、工序與 latency 的判讀順序；
- 經驗證的 build／smoke／run／resume／status 命令。

接受方式統一依 [algorithm_verification.md](skills/domain/algorithm_verification.md)：嚴格檢查正確性，以保留集判斷相對 baseline 的效果與成本，允許合理的局部波動及勝負取捨。具體數值門檻在看新結果前聲明，尚未約定的取捨交使用者決策；相關案例的 trace 依診斷需要取得。

操作由 [長跑工作流](workflows/run-generic-overnight-evaluation.md) 擁有。每輪以實際 binary 與 brief 核對命令中的版本身份，長跑由使用者啟動。
