# 學習式候選排序器重啟計畫

`last_reassessed: 2026-08-30`

## 決策摘要

這是 2026-08-29 提出的新方案，不是 2026-08-11 的單配方 action-only POC。重新檢查 v1.12、Raphael corpus 與目前 Rust portfolio 後，結論是：**這條路已足夠成熟，可以開始 bounded implementation；但還沒有證據支持直接啟動大規模資料生成或替 solver 升版。**

模型的角色仍限定為替 Rust 求解器已產生、已驗證合法的候選路線排序。Mechanics、合法性、完工 witness、hard-quality／Stable guard、objective／risk 組合與 fallback 都由確定性 Rust 程式掌管；模型不直接產生任意技能，也不復活已凍結的 TypeScript solver。

可以把整個系統想成一間高難度製作工房：

- mechanics 與安全證明是工房的爐具、量尺和安全閥，仍由確定性程式掌管；
- Raphael 是擅長全白球基本功的老師，示範資源如何安排；
- 慢速 Rust 搜尋是能反覆試做許多未來球色的資深師傅團；
- v1.12 是學生看不懂情境時可退回的可靠作業流程；
- 小型排序器是學徒練出的眼力，負責從師傅已確認可做的方案中，快速判斷哪一條較值得走。

這樣即使學徒看錯，安全閥、合法性、完工 witness、hard-quality／Stable guard 與 fallback 仍在。學習結果可以很小，因為它保存的是「如何替少量候選打分」的規則，不必把遊戲 mechanics、搜尋器和完整路線庫全塞進模型。

## 為何現在比舊路線可行

舊 proof of concept 的主要問題不是模型檔太小，而是教材與考法不足：512 筆舊標籤中有 316 筆沒有 completion support；單步 action label 沒保存老師下一段想做什麼；資料集中在單一裝備輪廓；再用弱學生自產資料後，continuation 表現反而退步。64-hidden-unit MLP 被要求從一個動作猜回整套策略，任務定義超過教材能支持的範圍。

現在已有四種互補證據：495 條 Raphael 全通常球最佳路線可教基本資源安排；v1.12 在 35,712 個正式支援 Balanced 一般收藏品 cases 取得 completion +63、完成成品檔位 +19.828 pp、滿品質 +7.869 pp；Rust episode observer 已能保存 pre-action state、完整候選、route intent、continuation、分支證據與計算量；50 families × 10 裝備的評測骨架可檢查跨配方與跨裝備表現。仍缺的是自然球色分布與更多玩家偏離 traces，因此第一階段只能證明 synthetic／assumed-world 下的策略價值，不能宣稱真實遊戲成功率。

## 老師的權限要分開

「現在有夠強的老師」足以啟動這條研究，但三種老師回答的問題不同，不能混成一個不透明 action label：

| 來源 | 可以教什麼 | 不能據此宣稱什麼 |
| --- | --- | --- |
| Raphael | 全通常球、確定性技能下的完整資源與路線安排 | 不知道實際球色、隨機技能、玩家偏離後如何改道 |
| v1.12 | 已通過 full-run 的 reactive baseline、廣泛 reachable states、可靠 fallback 行為 | 只模仿 v1.12 不能證明學生會勝過 v1.12；最多先證明壓縮或加速 |
| 較深的離線 Rust teacher | 以較高但固定的預算，對同一組合法候選作更多 common-random-number futures 與 continuation 比較 | 在 teacher 自己尚未勝過 v1.12 前，不能用模型 fit 指標補成策略提升 |

因此主 solver 改善的必要前提不是「資料量夠大」，而是離線 teacher 的候選偏好先在未見資料上產生更好的閉環玩家結果。若 teacher 只重播 v1.12，這條路仍可能服務未來 fast solver；但目前主線不應把純 imitation 當 solver optimization 里程碑。

第一個 dataset seam 已於 `d9243e2` 完成；schema、bounded CLI、observer-only／identity exclusion tests 與 smoke 見 [dataset exporter evidence](../../reports/learned-candidate-scorer/dataset-exporter-smoke-20260830.md)。它只解除資料匯出 blocker，沒有提供 teacher superiority evidence。

固定預算 teacher evaluator 與 preference probe 也已完成第一輪 development smoke。16→32 與 32→64 在 254 個多候選決策都只有 219 個 candidate、227 個下一招一致；但每輪 27 個動作翻轉全都位於兩倍 paired uncertainty 內或零 SE 同分。這表示 top-1 hard label 不成立，尚不能大量出題；也表示目前證據較支持保存連續分數、pairwise uncertainty／近似同分群組，再用 closed loop 判斷差異是否具有玩家意義，而不是把整條路視為已失敗。完整結果見 [teacher preference stability smoke](../../reports/learned-candidate-scorer/teacher-preference-stability-smoke-20260830.md)。

Raw teacher closed loop 已把「近似同分是否無害」轉成玩家成果檢查。相同 10-case development corpus 中，32-sample 為 8／10 完成，baseline 與 64-sample 都為 7／10；唯一救回是 E02 hard-quality，但 64 沒保留它。這證明 candidates 中存在更好的完整路線，也證明直接採有限抽樣 top-1 不是 budget-stable teacher。下一個 teacher 應採 paired uncertainty／practical margin 與 32／64 consensus；不同意時退回 ordinary reference。完整結果見 [teacher closed-loop smoke](../../reports/learned-candidate-scorer/teacher-closed-loop-development-smoke-20260830.md)。

## 要做的工作與理由

1. **先固定排序器權限。** 輸入只能是 mechanics、objective、risk、當前 state、球色、候選路線摘要與預估結果；輸出只替既有候選排名。禁止 recipe／equipment ID、seed 或未來 RNG。這防止模型背答案，也保留可審查的安全邊界。
2. **建立多老師資料。** Raphael 教全通常球資源基本功；較深的 Rust 搜尋教各球色下的改道、恢復與風險投資；v1.12 提供可靠 fallback 與 state sampler。單一老師只擅長一種教室情境，多老師才能涵蓋一般路線與球色主場。
3. **保存路線意圖，而非只存下一招。** 每筆標籤至少包含候選首招、預計 continuation、完成機率、品質效用、滿品質機率、資源尾端與下行風險。相同首招可能服務不同計畫，只學動作名稱會把原因抹掉。
4. **建立廣而連續的課程。** 以 50 families、四種 objective、三種 risk、全部 condition sets／assumed worlds、食藥主戰裝備與玩家偏離狀態取樣。裝備主要以 craftsmanship、control、CP 的合法連續範圍擾動，而不是只複製十個固定裝備格。
5. **預測多個可解釋結果。** 模型分別估計 completion、品質效用、滿品質／HQ、剩餘資源與風險，不只輸出一個總分。最後仍由 objective／risk 的明示規則組合，才能知道它為何選球色投資或退回完工線。
6. **訓練前凍結成組考卷。** 同一 family、近似裝備與相鄰 route state 不可散落在訓練與測試兩側；另做 leave-one-equipment-anchor-out，輪流完全不讓模型看到其中一個參考裝備。這比隨機拆單筆更能抓出背十套裝備的假進步。
7. **先比較小模型。** 從線性／小樹模型與 tiny MLP 比較準確度、校準、檔案大小和 Rust 推論成本；不預設神經網路一定較好。artifact 必須有 feature schema、teacher／corpus identity、hash 與版本，才能重播。
8. **以 prior／ranker 接入並保留退路。** 模型信心不足、輸入超出訓練範圍、必要 witness 不成立或 hard-quality／Stable guard 命中時，退回 v1.12／既有 scorer。模型先作排序提示，不直接取消合法候選或 safety certificate。
9. **用玩家成果而非模仿率驗收。** 先在未見成組資料比較 completion、U、滿品質、HQ、各 family／裝備／risk／world、policy-null、illegal 與成本；再看球色 selector-hit 是否有收益且 misses 不退。猜中老師下一招的比例只能診斷，不能當交付結果。

## 第一個最小可否決實驗

第一階段先驗證老師，不先訓練學生：

1. 在 Rust 定義版本化 candidate-dataset schema 與 deterministic exporter，直接重用 episode observer 與 `PortfolioRecommendation`；先做小 corpus 重播、hash 與 round-trip 測試。
2. 取涵蓋 50 families、E02／E09、Balanced、全通常球與一個主要球色世界的 bounded decision corpus；family／route／近似面板 grouped split、leave-one-anchor-out 與 fresh seed identity 必須在產生標籤前寫入 manifest。已看過的 64-seed overnight 只能作回歸或診斷，不能再叫 final holdout。
3. 對 v1.12 當時看到的每個合法 portfolio candidate，以固定較高離線預算與 common random numbers 重新估值；planning tapes 不得使用 episode 尚未發生的實際 RNG。保存連續分數、paired uncertainty 與近似同分關係，不強迫統計上難分的候選成為唯一 top-1 hard label。先直接比較 teacher-selected 與 v1.12-selected，不讓模型誤差混入。
4. 用實際每步 outcome 後重新規劃的 closed-loop same-tape episodes，按 family × equipment × world 報告完成、完成成品檔位、滿品質、U、illegal、policy-null 與 teacher cost。
5. 只有 teacher 在未見成組資料上顯示可重現的玩家成果改善，才擴成大量 train corpus，並依序比較線性／小樹／tiny MLP。Student 通過離線校準後仍須回到相同 closed-loop gate。

Teacher gate 的最低條件是：

- 正式支援範圍不得出現 completion practical regression，且 0 illegal、合法非終局 0 policy-null；
- 至少一個重要 optional-quality／球色切片有可重現的完成成品檔位、滿品質或 U 改善，不能只提高 teacher score；
- 改善不能集中於單一 family、裝備錨點或已看過 seeds；
- Stable、hard-quality、HQ、Master 的既有 routing 與 guard 保持精確語意；
- label ranking 對合理增加的 teacher samples 不可大幅翻轉，成本與 artifact 可重播。

若 teacher 本身不能勝過 v1.12，就停止大量訓練，回到候選產生／估值的手寫改善；學生不可能靠模仿補出老師沒有的玩家價值。若 teacher 通過、學生卻只在 fit 指標進步而 closed loop 沒有改善，也停止加大模型。只有 route-aware ranker 在 fresh family × equipment × world gate 通過，才考慮描述性 solver candidate；數字版號仍留給後續有意義、無重要切片退步的驗證里程碑。
