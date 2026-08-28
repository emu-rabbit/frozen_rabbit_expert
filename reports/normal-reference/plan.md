# 無球色基本製作參考

2026-08-29。使用者指定「先把一般製作做好，再依球色及品質目標追高」，並明確授權 Agent 直接執行 500 組參考評測。這次授權不包含啟動新的 solver overnight。

## 參考及比較契約

採用 [Raphael](https://github.com/KonaeAkira/raphael-rs/tree/411168605989d573d89f2d71c01acac9f099e55a) release branch `main`、revision `411168605989d573d89f2d71c01acac9f099e55a`（package 0.28.6）。它以完成進展為前提，依品質、較少技能、較短巨集時間排序；演算法包含 branch-and-bound、best-first search、dynamic programming、Pareto pruning。這是 upstream 規格，不是本專案重新證明其演算法全域正確。

`tools/evaluate-normal-reference/native` 是獨立研究 executable，連結未修改的 Raphael simulator／solver 及本地 kernel；不增加產品 runtime 依賴。Apache-2.0 授權、source revision、Cargo.lock、wrapper 及 binary hash 都保存。只共用本地 canonical 配方／裝備數值，不借用 Raphael 的 recipe database 以免資料版本混入策略差異。

- 全部 50 個 mechanics families × 10 套現有裝備 = 500 組，保留 family 到 432 個配方的 mapping。這不是所有可能的裝備數值。
- 初始品質零、全通常球，目標 `qualityMax`；必要品質仍由本地終局規則判斷。一般收藏品、HQ、連續品質及 hard-quality 分開報告。
- 禁用高難度不適用的 `trainedEye` 及目前產品未支援的 Stellar Steady Hand。專家技能權限依裝備 profile；不添加 food／medicine，因輸入數值已包含增益。
- Raphael 搜尋無隨機成功技能的固定路線。自身 solver 仍可用隨機技能，因此每格保存 8 個 action-success seeds；這些 seed 不提供球色收益，也不把偶然超過固定路線解當成勝過全域隨機策略上限。
- 自身比較先用 Balanced，直接執行 v1.1 及 `exp-condition-route-risk`，不把不同風險偏好的抽樣混在一起。
- 第一遍每組 30 秒、2 processes、每 process 1 Rayon thread；另設 10 秒退出寬限。逐組 atomic 保存。未完成搜尋列 `interrupted`／`hard-timeout`，有暫時解則保存；`no-solution` 僅指 upstream 搜尋完成後判定沒有進展解。
- 最佳解的可信範圍限相同技能集合及全通常模型；不是隨機球色下的品質上限，也不是遊戲內成功率。

## 逐步重播

每條 Raphael 路線在兩邊 simulator 重播，保存每招 CP、耐久、進展、品質、內靜與 buffs。活躍狀態對照資源與增益；進展／品質 cap、終局負耐久→零，以及不再影響未來的終局 buff ticking 是已確認的表示差異，原始兩側 state 保留。真正的中途不一致不算可信參考，先調查 mechanics／adapter。

初步整合測試覆蓋全部 500 組的加工連擊、製作增益、耐久投資三種前綴；測試不是球色或遊戲真值的獨立驗證。先前球色試驗存檔於 `8e5a0a4`，不升版。

## 使用者新增的採用判準

使用者於本次 500 組執行期間指定：全白球可以持平或小幅落後 Raphael，但不能落後太遠；有球色的世界不能比 Raphael 更差，否則未提供本專案應有的價值。這是效果要求，不只比較計算時間或單一總平均。

本輪先把全白球下的規劃模型也設為全白球，因此明顯差距不能歸因於預期未來球色而下注。後續再拆「原先預期有球色、實際一直白球」的風險代價；兩者不混稱。

使用者進一步確認：高難度配方有挑戰成就的目的，並非只求穩定量產；高速製作等能提高成果收益的隨機技能可以是合理主力。參考的確定性不是 runtime 的硬限制，不因單次合法失敗、隨機技能使用頻率或不是 100% 交貨而否定策略。比較賭注帶來的滿品質機率、完整品質期望與失敗成本，依風險偏好取捨；基本功落差不能簡化成「禁用高速製作」。

後續球色評測須保留兩個參考：Raphael 白球固定路線的成果，以及相同固定路線在相同球色模型／paired seed 下的實際重播。若大進展導致固定巨集提早完工，另評估 upstream 的 backload-progress 選項，選路規則事前固定，不事後依 RNG 選最佳巨集來冒充可行 policy，也不只挑最弱的固定巨集對照。各 objective、合理裝備、risk 與 world 分開，按完成率、完整 U、滿品質及不確定性判斷，不要求每個隨機 seed 都獲勝。全白球「小幅」的數值容忍尚未由使用者定義；先完整揭露落差，不自行放寬成通過。

## 判讀與後續

先判斷哪些格不靠球色已能滿品質，哪些有穩定交貨但品質不足，哪些只是搜尋未完。按 family × equipment 暴露自身品質／完成與參考落差，研究 CP 分配、耐久回復效率、內靜建立、加工連擊、buff 覆蓋、收尾預留及路線長度。只有可泛化機制才進下一個 `exp-*`；參考路線不作 recipe ID 硬編碼，也不要求逐招相同。

基本路線修正後，全九球色仍是下一階段主軸：根據當前資源、品質目標、buff／combo 與已知完工路線比較使用、改道、延後及恢復的價值。121000000 尚未使用，保留供新策略固定後確認；本次無球色研究資料全部屬 development。
