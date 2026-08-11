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

### Fast, local, recoverable interaction

- 實戰推薦在本機 browser 執行，不依賴 network round-trip。
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
- recommendation p95 達到互動目標；
- policy 的改善在 holdout／adversarial 評估有證據，且不破壞 safety invariants；
- 使用者看得懂此刻為何推薦這個 action，以及採用替代方案會交換什麼。
