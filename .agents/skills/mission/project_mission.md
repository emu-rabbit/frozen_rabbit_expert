# 專案使命與核心目標

## 1. 專案定位

Frozen Rabbit Expert 是 Final Fantasy XIV 宇宙探索 EX+ 高難度巧匠任務的**即時、反應式決策助手**。

它接收玩家在每一步製作後觀察到的完整狀態，重新計算下一個推薦 action，並說明理由、替代方案、風險與目前模型的信心。它的價值不是替玩家自動操作，而是把難以臨場維持的認知負擔可靠地外部化。

## 2. 要解決的痛點

- 高難度製作同時受 progress、quality、durability、CP、Inner Quiet、buff、condition、技能成功率與一次性資源影響。
- 即使玩家裝備達標，也可能因 condition、連續失敗、資源誤算或收尾 timing 失敗。
- 宇宙探索任務還加入跨件數、材料、累積分數、倒數與 Duty Action，使「單件品質最高」不等於任務目標最佳。
- 固定攻略表無法充分回應實際隨機結果；完整暴力搜尋又可能造成無法接受的時間與記憶體成本。

## 3. 使用者價值

- 記住並顯示目前完整 state。
- 每次觀測結果後快速重新推薦。
- 確認是否仍保有可靠完成路線與任務門檻。
- 在不確定性存在時清楚說明模型邊界。
- 讓玩家查看 alternatives、trade-off 與 replay，事後反思自己的選擇。
- 在 WR.02 的即時壓力下，讓輸入與推薦不成為額外負擔。

## 4. 設計支柱

### Mechanics correctness

- state transition、取整、buff timing、condition effect 與 action legality 需由 unit tests、invariants 與遊戲內 golden traces 驗證。
- 未證實規則不得自行猜測；先標記 assumption 或請玩家提供 trace。

### Honest recommendation

- policy 是近似推薦，不是已證明的全域最優解。
- completion、Gold、score、catastrophic risk 與信心都必須限定在目前 mechanics、condition profile、玩家數值與評估樣本內。
- condition model 不明時，不得用漂亮的精確百分比掩蓋 uncertainty。

### 有限真實資料下的實用可靠性

- 大量玩家 trace、精確 condition transition probability 或完整任務分數曲線難以由單一玩家取得；它們是持續校準來源，不是單件配方產品永遠不能推出的硬阻塞。
- 真實分布未知時，以多組可追溯、可版本化的合理 condition worlds、裝備邊界與壓力序列檢查策略。產品只能宣稱「在明示評估範圍內保持穩定」，不得把 sensitivity result 改稱真實遊戲成功率。
- 高難配方的「穩定」不是永遠選確定技能或在全白球下保住低價完成；若完成品質只落在幾乎沒有任務價值的區間，不能把 completion 冒充產品成功。策略必須學會有計畫地等待／利用有利 condition、承擔可恢復的隨機風險，並以 recipe 已知的有意義分數／品質門檻驗收。
- 共用的是 mechanics、決策引擎、評估方法與資料 contract；每個 recipe 依自己的 objective 與支援裝備範圍獨立 promotion。單一配方先達到跨裝備的穩定可用性，就是有效產品里程碑，不必等待所有配方同時通過。
- 玩家正常遊玩自然產生的 trace 用於發現模型錯誤、recovery 缺口與重新校準，不把大量人工抽球、刻意控制品質或限時任務採樣變成使用者的前置作業。

### Local, bounded, recoverable interaction

- 實戰推薦在玩家本機執行，不依賴 network round-trip；目前 web app 是既有 surface，但後續可使用 desktop／native worker，不再以 browser 作唯一平台邊界。
- 強規劃器以大多數一秒內為主要 UX 目標；目前 web hard timeout 為三秒，逾時立即終止 worker 並使用快速 fallback，不能因 planner timeout 讓玩家失去下一手。
- model／artifact 大小不再以極小 browser bundle 為先決條件；仍需量測載入時間、記憶體、更新與回退成本。
- 玩家可以偏離建議、undo、修改上一步與 resync，不會因一次輸入錯誤失去整場。
- session 採 event log，可 replay、debug、匯出與在新 model version 下重播。

### Player agency and learning

- 產品只提供 advisory recommendation，不讀記憶體、不攔封包、不自動按鍵。
- 每個建議至少有一個清楚 reason；alternative 說明 trade-off，不只列第二名分數。
- 使用者可選 stable／balanced／aggressive，這些代表效用偏好，不是新手／高手或好／壞模式。

## 5. POC 範圍

1. Auxesia DoH WR.01 最終 expert craft。
2. WR.01 guide-policy-v1 與安全收尾模板。
3. 固定預算的離線 policy evaluation／improvement。
4. WR.02 Material Miracle real-time mission controller。
5. TR.01 兩件 joint failure risk 與 Stellar Steady Hand 分配。

## 6. 明確非目標

- 固定巨集產生器。
- 全 action sequence 暴力枚舉或完整 policy tree materialization。
- 全域最佳、唯一正解或 100% 成功承諾。
- 一開始支援所有歷代 expert recipe 或 Auxesia Master Mission。
- server-dependent runtime solver。
- mechanics 尚未驗證前，同時手寫 TypeScript 與 WASM 兩套 core。
- 遊戲記憶體／封包讀取、自動按鍵、bot 或其他 automation。
- 未確認授權前複製第三方 UI、圖示、攻略文字或 source implementation。

## 7. 成功定義

POC 成功不代表「打敗所有高手」，而是：

- mechanics state 能與真實遊戲逐步一致；
- WR.01 可由玩家完整走完且 session 可重現；
- 不推薦 illegal action，失配時能安全 resync／fallback；
- 強規劃 recommendation p95 `< 1s`、web hard timeout `3s` 且 fallback 可用；快速 fallback 另行量測；
- policy 的改善在 holdout／adversarial 評估有證據，且不破壞 safety invariants；
- 使用者看得懂此刻為何推薦這個 action，以及採用替代方案會交換什麼。
