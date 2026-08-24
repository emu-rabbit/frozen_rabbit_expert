# 專案使命與核心目標

## 1. 專案定位

Frozen Rabbit Expert 是面向 Final Fantasy XIV 高難度製作配方的**即時、反應式決策助手**。宇宙探索 EX+ 是已完成第一輪 live POC 的起點，不是產品永久只支援的範圍。

它接收玩家的實際 `CrafterProfile`、所選配方、風險偏好，以及每一步製作後觀察到的完整狀態，重新計算下一個推薦 action，並說明理由、風險與目前模型的信心。替代方案只有在同一 route core 能給出合法且不破壞收尾邊界的比較時才顯示；不得為填滿 UI 而列出未驗證的第二名。它的價值不是替玩家自動操作，而是把難以臨場維持的認知負擔可靠地外部化。

## 2. 要解決的痛點

- 高難度製作同時受 progress、quality、durability、CP、Inner Quiet、buff、condition、技能成功率與一次性資源影響。
- 即使玩家裝備達標，也可能因 condition、連續失敗、資源誤算或收尾 timing 失敗。
- 宇宙探索等任務還可能加入跨件數、材料、累積分數、倒數與 Duty Action，使「單件品質最高」不等於任務目標最佳。
- 固定攻略表無法充分回應實際隨機結果；完整暴力搜尋又可能造成無法接受的時間與記憶體成本。
- 若每新增一個配方都要手寫、調參並完整 promotion 一套獨立 solver，產品永遠無法擴張到廣泛配方 catalog。

## 3. 使用者價值

- 選擇幾乎所有已納入 catalog 且 mechanics 可支援的高難度配方，而不是只看到少數 pilot。
- 輸入角色面板後，由同一個 state-feedback solver 直接依實際數值做決策，不要求符合少數 exact profile。
- 記住並顯示目前完整 state，每次觀測結果後快速重新推薦。
- 在存活、完成與追求高品質之間，依 stable／balanced／aggressive 偏好採取不同但有邊界的風險。
- 確認是否仍保有可行完成路線，以及目前仍可能達到哪些品質／分數目標。
- 在不確定性存在時清楚說明 model envelope、OOD 與 fallback，不用虛假精準度掩蓋未知。
- 讓玩家查看可證明邊界內的 alternatives／trade-off 與 replay，並在限時任務中維持低負擔輸入；沒有安全替代路線時寧可只顯示主推薦。

## 4. 設計支柱

### Mechanics correctness

- state transition、取整、buff timing、condition effect 與 action legality 需由 unit tests、invariants 與必要的遊戲內 evidence 驗證。
- 未證實規則不得自行猜測；先標記 assumption、限制 support level，或請玩家在正常遊玩中提供 trace。
- 已知 mechanics family 的新配方應以 data-only onboarding 為預設；只有真的出現新 action semantics、condition semantics 或任務 state，才擴充 mechanics owner。

### Generic state-feedback solver

- 共用的是 mechanics、candidate generation、planning／inference、risk objective、evaluation 與 session contract；配方差異由 versioned recipe data、condition set 與 `CraftObjective` 注入。
- 「通用求解器」不表示所有配方使用同一條 rotation，也不表示抹平硬品質門檻、收藏價值、HQ utility 或任務規則。
- 新增已知 mechanics family 的配方，不得以新增 recipe-specific solver、worker switch 或 exact-profile route 作為正常 onboarding 路徑。
- guide、舊專用 policy 與玩家成功 route 只作歷史、teacher 或 regression evidence，不是 generic solver 必須逐手相容或執行的 runtime contract；實戰 fallback 由 generic runtime 另行提供。

### Honest recommendation

- policy 是近似推薦，不是已證明的全域最優解。
- completion、Gold、score、catastrophic risk 與信心都必須限定在目前 mechanics、condition profile、玩家數值與評估樣本內。
- condition model 不明時，不得用漂亮的精確百分比掩蓋 uncertainty。
- catalogued／mechanics-ready 描述 data／mechanics 成熟度；development-preview／experimental／supported／validated 描述 recommendation 成熟度。能在 UI 中以 development-preview 收集 trace，不等於已通過 experimental，更不等於已有 validated 實戰成功率。

### 有限真實資料下的實用可靠性

- 大量玩家 trace、精確 condition transition probability 或完整任務分數曲線難以由單一玩家取得；它們是持續校準來源，不是廣泛 catalog 或 experimental recommendation 永遠不能推出的硬阻塞。
- 真實分布未知時，以多組可追溯、可版本化的合理 condition worlds、裝備邊界與壓力序列檢查策略。產品只能宣稱明示 envelope 內的結果，不得把 sensitivity result 改稱真實遊戲成功率。
- 高難配方的「穩定」不是永遠選確定技能或在全白球下保住低價完成；若完成品質只落在幾乎沒有任務價值的區間，不能把 completion 冒充產品成功。策略必須能等待／利用有利 condition、承擔可恢復的隨機風險，並以 recipe 已知的有意義分數／品質門檻驗收。
- 低裝備採 best-effort：仍應避免明顯策略錯誤、保留合理 recovery 並追求該能力範圍可達的結果，但不承諾與高裝備相同的高分尾端，也不以長期 exact-profile threshold 調參維持表面成績。
- 玩家正常遊玩自然產生的 trace 用於發現模型錯誤、recovery 缺口與重新校準；不把大量人工抽球、刻意控制品質或限時任務採樣變成使用者的前置作業。

### Local, bounded, recoverable interaction

- 實戰推薦在玩家本機執行，不依賴 network round-trip；目前 web app 是既有 surface，但後續可使用 desktop／native worker，不再以 browser 作唯一平台邊界。
- recommendation 以大多數一秒內為主要 UX 目標；目前 web hard timeout 為三秒，逾時立即終止 worker 並改由同一 generic policy 的同步 fallback 重算，不能因 Worker timeout 讓玩家永久失去下一手。這是執行失效保護，不代表目前已有一套獨立、更快或更弱的策略。
- model／artifact 大小不再以極小 browser bundle 為先決條件；仍需量測載入時間、記憶體、更新與回退成本。
- 玩家可以偏離建議、undo、修改上一步與 resync，不會因一次輸入錯誤失去整場。
- session 採 event log，可 replay、debug、匯出與在新 model version 下重播。

### Player agency and learning

- 產品只提供 advisory recommendation，不讀記憶體、不攔封包、不自動按鍵。
- 每個建議至少有一個清楚 reason；alternative 說明 trade-off，不只列第二名分數。
- 使用者可選 stable／balanced／aggressive，這些代表效用偏好，不是新手／高手或好／壞模式。

## 5. 目前主線：廣泛配方與通用求解器

五個舊配方已完成其 live POC 任務。它們不再是新 generic solver 的 runtime 相容性義務，也不再作為持續逐配方微調的產品主線；既有實作與證據只保留作歷史、teacher 或 regression，用來避免重犯已知 mechanics／策略錯誤。

目前產品主線是：

1. 第一批在 catalog／mechanics 完整涵蓋目前 432 個宇宙探索高難度製作配方，再把同一 data／family contract 擴到其他 FFXIV 高難配方；相同 mechanics 數值的不同名稱仍各自可選，但不複製 solver。Recommendation 依 family 從 development-preview 推進至 experimental／supported，不把「可選」冒充「已可靠求解」。
2. 讓已知 mechanics family 的新配方只需新增 data、condition set／family binding 與 objective，即可達到 mechanics-ready。
3. 建立直接讀取任意可支援 `CrafterProfile`、完整 `CraftState`、配方與風險偏好的 generic state-feedback solver。
4. 先讓多個不同配方 family 達到 experimental，證明新配方不需重寫 solver；再依使用量與證據把代表性配方提升為 supported／validated。
5. 以裝備分層、風險偏好與 recipe objective 評估實際效用，不再以少數 exact profile 的微小 paired uplift 代表通用進度。

詳細交付與 gate 由 `.agents/roadmaps/broad_solver_implementation_plan.md` 管理。

## 6. 明確非目標

- 固定巨集產生器。
- 每個配方各自手寫一套長期維護的 solver／rotation。
- 為了保住舊五配方逐手相容而限制 generic solver 的候選、objective 或架構。
- 全 action sequence 暴力枚舉或完整 policy tree materialization。
- 全域最佳、唯一正解或 100% 成功承諾。
- 假設所有配方有相同 condition 分布、完成條件或品質效用。
- 保證低裝備得到與高裝備相同的高分率，或長期針對單一 exact profile 調 threshold。
- server-dependent runtime solver。
- mechanics 尚未驗證前，同時手寫 TypeScript 與 native／WASM 兩套 truth。
- 遊戲記憶體／封包讀取、自動按鍵、bot 或其他 automation。
- 未確認授權前複製第三方 UI、圖示、攻略文字或 source implementation。

## 7. 成功定義

目前階段成功不以「再讓某個舊 recipe config 多贏幾場」衡量，而是：

- 已知 mechanics family 的新配方可由 data-only change 進入 catalog／mechanics-ready，不修改 generic solver control flow；
- 玩家可輸入實際裝備、選擇配方與風險偏好，並在每次回報後取得 legal、可解釋、可 fallback 的推薦；
- condition 專屬高價值技能會進入實際比較；若未採用，理由來自完整路線／資源／objective trade-off，而不是因 recipe-specific rule 漏掉；
- generic solver 在多個不同配方 family、裝備區間與 plausible condition worlds 中，能維持合理存活／完成並依風險偏好提高有意義的品質或分數尾端；
- 低裝備有誠實的 best-effort 結果與 OOD／能力邊界，不以無止盡 exact-profile 調參假裝已泛化；
- experimental 支援不冒充 validated；supported／validated claim 各有相稱證據；
- generic recommendation 在目標裝置 p95 `< 1s`、web hard timeout `3s` 且同策略同步 fallback 可用；未來若加入獨立快速 policy，再另設版本與量測 gate；
- 使用者看得懂此刻為何推薦這個 action，以及採用替代方案會交換什麼。
