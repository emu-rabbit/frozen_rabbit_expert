# Rust v1.0 架構開發評測

日期：2026-08-27。用途為第一批新架構的開發比較；實作方向由 [roadmap](../../../.agents/roadmaps/broad_solver_implementation_plan.md) 擁有。

## 身份與目的

- Baseline：`generic-craft-specialist-resource-guard-v0.30.0`。
- Candidate：`generic-craft-route-portfolio-v1.0.0`；1.0 標示求解器架構世代，網站與發布版本另行管理。
- 假說：共同比較首步與續作，並記錄準備技能的預期用途，可以改善既有能力的協作及資源分配。
- Runtime signal：mechanics、objective、裝備能力、實際 state／history、declared condition model 與 route context。

## 第一輪開發資料

先用小型 smoke 量測單次工作量，再以 Balanced × balanced-iid × E02／E09 × 50 families × 1 seed 比較，共 100 pairs。使用既有開發 base seed `20260824`；完整品質類型均納入，結果按 family 與品質類型分開。

依工作量追加專家裝備及 Stable／Aggressive 的有限切片，執行前在本檔記錄其 axes。單次開發命令使用單一 process 與明示案例上限；長時間矩陣由使用者啟動。

### 開發修正與追加切片

初版 100 pairs 用於定位續作視野的影響。後續以相同開發案例重播：首步的每個成敗分支使用 2 個樣本，續作上限 64 actions，並受剩餘 action budget 限制。另以 36195、36997、37005、38200 的 E02／E09 記錄針對性診斷；這些資料均屬 development。

追加 smoke 固定為代表配方 36195、36206、37005、38200 × E03／E10 × Stable／Aggressive × balanced-iid × 1 seed，共 16 pairs，涵蓋四種品質效用與專家資源。各命令單一 process、2 cases，上限每臂 300 秒；它們用於跨風險與專家能力檢查，採用結論另由完整保留集決定。

單次 100-pair 開發比較也使用每臂 300 秒上限。超時、非法技能或 protocol identity 錯誤時停止該命令，先定位問題。

## 判讀與正確性

報告完成、hard-quality、一般完整品質 utility、policy-null、失敗、工序及 native 成本。這批資料用於定位下一個改善點，樣本量及用途以實際執行範圍為準。

正確性檢查涵蓋合法性、必要品質、實際事件更新、模擬隔離、有限工作量、相同輸入可重播及 recipe identity 對決策無影響。採用判斷另固定完整保留集與事前效果／代價界線。

## 記錄方式

執行結果保存 binary／config identity、實際命令、每個切片與成本，原始輸出留在 evaluation-runs。結果分析只宣稱已完成的檢查與比較。
