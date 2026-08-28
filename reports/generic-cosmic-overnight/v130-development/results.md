# v1.3 協調候選與收尾規劃研究

2026-08-29。這是持續迭代中的研究紀錄，尚未通過 overnight 交付確認。直接對照為 v1.1；v1.2 的新種子確認失敗已保存於 [研究節點](../v120-development/results.md)。

## 改動假說

九種球色各自有提案後，仍需要改善提案之間的協調，而不是繼續按案例加入例外。

- 內靜或品質成熟時，固定寬度／深度的收尾搜尋同時安排品質、進展、修理、增益與專家資源。它只提出已實際模擬完成的 Normal-future 路線，再交給共同隨機評估；不是預知球色或必成保證。
- 相同首招、續招、葉端引擎與 context 更新，不因提案來源／路線記帳不同而重複占用決選名額。真實執行的 route intent 仍保留，不合併不同 consumer 或完整 suffix。
- hard-quality 的決選恢復 8 個 samples；progress-only 保持 4。所有候選仍先接受初評，最後僅在完整比較的候選間選擇。
- 精確相同或可證明沒有抽樣變化的預測可重用；沒有未來隨機性的判定保持保守。
- 能以合法必成技能立即滿品質交貨時，成果已達上限，可直接結束比較。已有完整滿品質路線時，收尾 beam 不再尋找另一條 Normal-future 路線；找不到時才啟用補足能力。

全部變動只讀可觀察 state、objective、risk、condition model 與實際 history，保留 v1.1／v1.2 可重播路徑。

## 開發比較

本節的 canonical base seed 61000000 已參與 v1.2 診斷，全部是開發資料。每個 focus 為 1,200 pairs，broad 為 2,400 pairs；原始輸入、binary snapshot 與 SHA 保存在 `evaluation-runs/v120-development/<label>/plan.json`。

| 開發變體 | 主要 hard-quality 完成差 | 主要 progress-only 平均 U 差 | 主要 HQ 平均 U 差 | Focus 總 native 運算比 | 判讀 |
| --- | ---: | ---: | ---: | ---: | --- |
| `v130-beam-dev` | +3.571 pp | +0.0391 | −0.0369 | 尚見逐批報告 | 收藏品改善，但 HQ 與成本不足 |
| `v130-grouped` | +3.571 pp | +0.0424 | −0.0081 | 1.375 | 比較名額修正有幫助，成本仍超界 |
| `v130-efficient` | +2.679 pp | +0.0363 | −0.0069 | 1.381 | 保留品質收益，但總成本未下降；不能交付 |

各變體的完整切片在共用研究工具輸出的 [beam focus](../v120-development/v130-beam-dev-focus-summary.md)、[beam broad](../v120-development/v130-beam-dev-broad-summary.md)、[grouped focus](../v120-development/v130-grouped-focus-summary.md)。表內 pp 是百分點，U 為無量綱的交付品質效用，失敗算零。

## 新種子確認（已完成）

候選固定後，使用尚未參與策略調整的 canonical base seed **81000000**，focus 1,200 pairs + broad 2,400 pairs，直接執行 v1.1／候選兩臂。71000000 曾用於 runner integration，不作這次新種子聲稱。

沿用 [品質優先計畫](../v120-development/quality-validation-plan.md) 的主要切片、效果界線、成本護欄、合法性與逐格揭露；不因目前結果調低標準。若看過確認結果後再改策略，該批降為開發資料，另選 seed block。短測只決定是否值得完整研究，不等於正式發布或遊戲自然成功率。

## 操作邊界

此 checkpoint `9574373` 的 release Rust tests 已通過，包括九種球色 × 四種品質目標、完整 suffix 的合法性／必要品質／action budget、比較等價性與無隨機預測重用。beam／grouped／efficient 三種變體的同一組 3,600 個 baseline cases，全部非計時欄位保持 v1.1 精確一致；見本目錄 `baseline-parity-*.json`。efficient binary SHA-256 為 `70c8aff10b5795f26b03758148f0799169b4de0ca6a90d4fac8a0a139786c872`。

efficient 已完成 [focus](../v120-development/v130-efficient-focus-summary.md) 與 [broad](../v120-development/v130-efficient-broad-summary.md)：broad 2,400 pairs 的一般收藏品 U +0.0803、HQ U +0.0435、連續品質 U +0.0481，hard-quality 淨多 5 件；但一般交貨淨少 4 件，總運算比 1.256。後續 v1.4–v1.9 未取得採用證據，最後回到這個凍結 binary 執行 81000000 新種子確認。

最後確認 [focus](../v120-development/confirm-v130-final-focus-summary.md) 的主要 hard-quality 81/112 → 76/112，退步 4.464 pp，未通過；一般收藏品主要 U +0.04786、滿品質率 +8.065 pp。完整 focus 運算比 1.370，[broad](../v120-development/confirm-v130-final-broad-summary.md) 1.258。v1.3 不能全面採用。這批結果參與後續 v1.10 的目標分工，故已歸為開發資料；最終結案見 [v1.10](../v1100-development/results.md)。

完整 overnight 只執行新候選，沿用已保存 v1.1 的同案例結果，不再執行 v0.30／整套 v1.1。歷史對照 runner 已完成獨立整合驗證，但 solver 效果、最終 binary 的 preflight 與交付命令仍需完成。
