# 學習式候選排序器重啟計畫

## 決策摘要

這條路值得重啟，但角色需改成**替 Rust 求解器已產生、已驗證合法的候選路線排序**，而不是讓模型直接決定任意技能，也不是復活已凍結的 TypeScript solver。

可以把整個系統想成一間高難度製作工房：

- mechanics 與安全證明是工房的爐具、量尺和安全閥，仍由確定性程式掌管；
- Raphael 是擅長全白球基本功的老師，示範資源如何安排；
- 慢速 Rust 搜尋是能反覆試做許多未來球色的資深師傅團；
- v1.11 是學生看不懂情境時可退回的可靠作業流程；
- 小型排序器是學徒練出的眼力，負責從師傅已確認可做的方案中，快速判斷哪一條較值得走。

這樣即使學徒看錯，安全閥、合法性、完工 witness、hard-quality／Stable guard 與 fallback 仍在。學習結果可以很小，因為它保存的是「如何替少量候選打分」的規則，不必把遊戲 mechanics、搜尋器和完整路線庫全塞進模型。

## 為何現在比舊路線可行

舊 proof of concept 的主要問題不是模型檔太小，而是教材與考法不足：512 筆舊標籤中有 316 筆沒有 completion support；單步 action label 沒保存老師下一段想做什麼；資料集中在單一裝備輪廓；再用弱學生自產資料後，continuation 表現反而退步。64-hidden-unit MLP 被要求從一個動作猜回整套策略，任務定義超過教材能支持的範圍。

現在多了三種互補證據：495 條 Raphael 全白球最佳路線可教基本資源安排；Rust portfolio／replay 可保存候選與 route intent；50 families × 10 裝備的評測骨架可檢查跨配方與跨裝備表現。仍缺的是自然球色分布與更多玩家偏離 traces，因此第一階段只能證明 synthetic／assumed-world 下的策略價值，不能宣稱真實遊戲成功率。

## 要做的工作與理由

1. **先固定排序器權限。** 輸入只能是 mechanics、objective、risk、當前 state、球色、候選路線摘要與預估結果；輸出只替既有候選排名。禁止 recipe／equipment ID、seed 或未來 RNG。這防止模型背答案，也保留可審查的安全邊界。
2. **建立多老師資料。** Raphael 教全白球資源基本功；較深的 Rust 搜尋教各球色下的改道、恢復與風險投資；v1.11 提供可靠 fallback。單一老師只擅長一種教室情境，多老師才能涵蓋一般路線與球色主場。
3. **保存路線意圖，而非只存下一招。** 每筆標籤至少包含候選首招、預計 continuation、完成機率、品質效用、滿品質機率、資源尾端與下行風險。相同首招可能服務不同計畫，只學動作名稱會把原因抹掉。
4. **建立廣而連續的課程。** 以 50 families、四種 objective、三種 risk、全部 condition sets／assumed worlds、食藥主戰裝備與玩家偏離狀態取樣。裝備主要以 craftsmanship、control、CP 的合法連續範圍擾動，而不是只複製十個固定裝備格。
5. **預測多個可解釋結果。** 模型分別估計 completion、品質效用、滿品質／HQ、剩餘資源與風險，不只輸出一個總分。最後仍由 objective／risk 的明示規則組合，才能知道它為何選球色投資或退回完工線。
6. **訓練前凍結成組考卷。** 同一 family、近似裝備與相鄰 route state 不可散落在訓練與測試兩側；另做 leave-one-equipment-anchor-out，輪流完全不讓模型看到其中一個參考裝備。這比隨機拆單筆更能抓出背十套裝備的假進步。
7. **先比較小模型。** 從線性／小樹模型與 tiny MLP 比較準確度、校準、檔案大小和 Rust 推論成本；不預設神經網路一定較好。artifact 必須有 feature schema、teacher／corpus identity、hash 與版本，才能重播。
8. **以 prior／ranker 接入並保留退路。** 模型信心不足、輸入超出訓練範圍、必要 witness 不成立或 hard-quality／Stable guard 命中時，退回 v1.11／既有 scorer。模型先作排序提示，不直接取消合法候選或 safety certificate。
9. **用玩家成果而非模仿率驗收。** 先在未見成組資料比較 completion、U、滿品質、HQ、各 family／裝備／risk／world、policy-null、illegal 與成本；再看球色 selector-hit 是否有收益且 misses 不退。猜中老師下一招的比例只能診斷，不能當交付結果。

## 第一個最小可否決實驗

第一階段只蒸餾「候選排序」：不改候選產生器、mechanics、完工證明、hard-quality／Stable guard 或 fallback。訓練資料以食藥主戰範圍為核心，未食藥保留少量壓力參考；評測使用未見 family／route groups、leave-one-anchor-out 與新的 paired seeds。

只有同時滿足下列條件才進一步投資：

- 食藥全白球相對 v1.11 不出現實質退步；
- hard-quality 與 Stable 受 guard 保護且精確不退；
- 至少一個重要球色／optional-quality 切片有可重現的 U、滿品質或 HQ 改善，不以平均掩蓋 family misses；
- 0 illegal、合法非終局 0 policy-null；
- artifact 與 runtime overhead 足以放入主要求解器預算，且超出分布時可可靠 fallback。

若小型排序器在這個受限任務仍不能勝過手寫 scorer，就停止此路線，不再以更大黑盒或更多窄資料補救。若通過，下一階段才擴充較長 route intent、更多真實玩家偏離與自然球色 evidence，最後再決定是否值得進完整 overnight。
