# 球色資訊邊界與 condition-option 實驗撤回報告

`verified: 2026-08-31`

## 決定

撤回 `generic-craft-route-portfolio-exp-normal-route-certificate` 與 `generic-craft-route-portfolio-exp-condition-option-planning`。兩個描述性 identity、候選 route、Master extension 與候選專屬效能調整已從 Rust binary 移除；不升為 v1.13，也不續跑 `generic-native-condition-option-master-vs-v112-fresh-balanced-64seed-20260831`。

這不是「完全沒有收益」。400-case bounded gate 有完成 `+1`、檔位 `+22`、滿品質 `+11`、品質 `+69,109`。問題是 337／400 cases 完全持平，candidate wall time 是 baseline 的約 4.4 倍；實際 unattended 嘗試又反覆撞到 30 分鐘 shard timeout。收益規模、覆蓋率與成本不成比例，沒有必要保存這套 runtime 複雜度。

本輪仍保留一組產品正確性修正：求解器只知道宣告可能出現哪些球色，完全不知道 evaluator 用來抽球的比重；recipe／equipment ID、episode seed 與未來 RNG 也不能影響策略。

## 保留的資訊邊界修正

- `condition_transition_weights` 只留在 evaluator／simulation 抽樣；solver API、portfolio、Web planner identity 與 candidate dataset 不再接收或保存它。
- v0.10–v0.17 歷史 MPC 若需要內部抽樣，只由 declared condition mask 建立等權重 model。這是知道「有哪些球」，不是知道普通球或非普通球的實際比重。
- 舊 MPC planning seed 不再混入 `canonical_recipe_id`；TypeScript semantic cache key 也不再混入 recipe ID。
- dataset schema 移除可反映私有轉移模型的 `condition_model_fingerprint`。
- equipment ID 只存在 evaluator case identity／報表分組，不進 Rust solver input。Recipe ID 仍可存在 mechanics protocol，以支援明示的特殊技能效果，但不進 selector、portfolio projection、planning seed 或 cache。
- boundary audit 對所有目前編譯的 solver／research identities，以 6 個代表 cases 分別替換 uniform、normal-heavy 與 opportunity-scarce 私有權重；相同初始觀測 state 的 first recommendation 必須 0 changes。另有 Web identity、dataset 與 recipe-alias tests 鎖定邊界。

因此，修正前的 v1.12 full-run 只能當舊 binary 的歷史 outcome snapshot，不能沿用成目前 binary 的 policy baseline。未來任何新 candidate 都必須和修正後 v1.12 fresh 比較。

## 低滿品質案例的判讀

修正前 full-run 滿品質率低於 10% 的收藏品 families 是 F42、F34、F17、F40、F15、F32、F44。Raphael 全普通球 E02／E09 在這七個 family 也都無法滿品質，最佳品質約只達 quality maximum 的 48.6%–74.2%；F46、F36、F19 hard-quality 也只有約 42.3%–59.9%。這些主要是裝備／配方能力壓力，不能當成策略器漏掉 Raphael 解。

真正值得研究的是 Raphael 能滿而 v1.12 沒滿的 route gap。撤回 candidate 在 6-case target／control set 的結果是：

| 座標 | v1.12 | 撤回 candidate | 玩家結果差 |
| --- | ---: | ---: | --- |
| F02／E02 | 完成，18,085 | 完成，18,783 | 品質 +698，檔位不變 |
| F29／E02 | 完成，19,857 | 完成，17,420 | 品質 −2,437，檔位 −1 |
| F29／E09 | 完成，17,340 | 完成，21,100 | 品質 +3,760，檔位 +2，新增滿品質 |
| F37／E09 | 完成，18,768 | 完成，20,196 | 品質 +1,428，檔位不變 |
| F11／E02 hard | 失敗，7,896 | 完成，14,900 | 完成 +1，新增滿品質 |
| F46／E09 hard control | 完成，18,000 | 完成，18,000 | 不變 |

這證明局部有 route gap，但也有 F29／E02 的反向交換。它適合拿來建立未來 state-level fixture，不足以支持保留一個每步都擴大深搜的 candidate。

## Bounded 收益與成本

400-case stratified gate 涵蓋全部 50 families、10 個 equipment profiles、4 個球色 worlds；每個 family／world 以輪替 equipment 和 2 seeds 組成代表矩陣，不是完整 50 × 10 × 4 cross product。每列分母 100，總分母 400。

| World | Cases | 完成差 | 檔位差 | 滿品質差 | 品質差 | 勝／負／平 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `all-normal` | 100 | +1 | +13 | +7 | +39,741 | 16／2／82 |
| `balanced-iid` | 100 | 0 | +6 | +4 | +26,788 | 12／3／85 |
| `normal-heavy-iid` | 100 | 0 | +2 | 0 | −5,625 | 10／5／85 |
| `opportunity-scarce-iid` | 100 | 0 | +1 | 0 | +8,205 | 11／4／85 |
| **全部** | **400** | **+1** | **+22** | **+11** | **+69,109** | **49／14／337** |

換算每 100 cases 是 `+5.5` 檔位、滿品質率 `+2.75` 個百分點；不能把 `+22`／`+11` 當百分比。all-Normal 提升最多不是因為預判到特殊球，而是未進入 option route 時啟用了昂貴的 all-Normal continuation certificate。把它改成便宜固定 suffix 後，all-Normal 收益由檔位／滿品質 `+13／+7` 縮成 `+6／+1`，負例增至 8；這證明主要能力來自每步重規劃，不是球色本身。

同一批 baseline／candidate wall time 為 39.804／174.423 秒，約 4.4 倍。Candidate 的最大單次推薦 p95 為 212.862 ms，雖低於 3 秒 watchdog，但 episode 累積工作與大量 shard timeout 說明整體計算量不可接受；單步 p95 合格不代表 overnight 成本合理。

## Incomplete overnight 只證明成本

run `generic-native-condition-option-master-vs-v112-fresh-balanced-64seed-20260831` 最終只有 2／50 shards 完成，共保存 5,120 logical rows；7 次 attempt 用滿 30 分鐘 timeout，4 次中斷。完成的 F03／F05 不是隨機代表樣本，昂貴的 F01／F02／F04／F06 反而持續 timeout，因此不能用已完成 shards 的 outcome 或 latency 推論完整 efficacy。

完成 shards 的單步統計只作失真警示：baseline 130,758 calls 的 p50／p90／max 為 0.760／19.150／110.760 ms；candidate 134,953 calls 為 3.070／20.530／71.990 ms。另一個單-family smoke 的 candidate p50／p90／max 曾達 11.670／46.560／324.600 ms，而 960-case Master gate 為 0.590／12.630／60.200 ms。分布高度依 family 與 selector 命中而變，不能用兩個幸存 shards 宣稱 candidate 更快。

原 run directory 與 partial shard artifacts 在撤回後刪除；無法從 workspace 復原，只能重新執行產生。

## 被否決的策略

- 強迫 late Good／Pliant／Primed 立即消費：balanced 主體由檔位／滿品質 `+4／+2` 降為 `+1／+1`。
- 永久保留 condition-preparation finalist：balanced 小升，但 normal-heavy 與 scarce 增加品質／滿品質損失。
- 每步同時跑 condition certificate 與 option route：只多 `+1` 檔位／`+1` 滿品質，candidate 約 75 秒／100 cases。
- 用 productive bridge 等下一球：額外結果只來自 Master，一般 collectability 由 `+4／+2` 降成 `+3／+1`。
- 把 HQ 一起延伸：HQ 16 cases 檔位 `−1`、滿品質 `−2`。
- 對所有 condition mask 早期預備：E09、normal-heavy 有檔位／滿品質倒退；只允許三個 compact sets 又在 fresh E02／E09 幾乎沒有行為差。
- 以 `quality_max <= 4 × control` 放寬：短測增加收益，但 400-case normal-heavy 變成檔位 `−5`、滿品質 `−1`。

共同教訓是：不知道球色權重時，泛用的「事先準備」很容易變成對大量沒有命中機會的 state 繳固定成本。未來應從小而可觀測的 state selector 出發，先證明 selector-hit 收益與 selector-miss 不退，再允許局部深搜。

## 值得保留的研究線索

### Master objective extension

3 個 Master families 的獨立 960 paired cases（10 equipment × 4 worlds × 8 新 seeds）把完成由 945 提高到 960，沒有新增未完成；三 family 平均 continuous objective utility 各增加 5.41、3.65、5.10 個百分點，所有 equipment／world 的平均 utility 都為正，但滿品質尾端淨 `−8`。這是本輪最一致的信號；若重開，應只實作 objective-kind extension，使用新的描述性 identity，不能把 option planning／certificate 一起帶回。

### 集中加工與胚料加工

400 個 v1.12 Balanced episodes 中，Good 當下推薦集中加工（Precise Touch，`preciseTouch`）473 次，推薦胚料加工（Preparatory Touch，`preparatoryTouch`）87 次，占兩者 15.5%。抽樣 18 次 Good→胚料，12 次有儉約、10 次有改革、7 次內靜已達 10、1 次有闊步；多數有單步 200 效率、耐久折扣或 buff window 理由。沒有完整玩家當步 state 時，不能判定某一次錯誤，也沒有證據支持「Good 一律集中加工」。未來需保存完整 state、候選與 score 才能診斷。

### 玩家 Web 紀錄

更多 opt-in、匿名玩家紀錄可以比 synthetic worlds 更好地提供真實 state corpus：patch、declared condition set、完整 observed state、推薦技能、玩家實際技能、成敗、下一球色、undo／resync 與終局結果。它能回答 selector 在真實流量的命中率、玩家裝備混合與偏離建議後的恢復難度。

紀錄不能提供未選技能的反事實，也不能把估出的個別球色比重直接餵給 runtime。離線分析應按玩家／session／時間切分 train 與 evaluation，先在相同 observed state 重播合法技能，再用結果發現或評測仍然 weight-blind 的泛化 selector。

## 後續重開門檻

新的 candidate 必須從 fresh 修正後 v1.12 開始，先以 family × equipment × world bounded corpus 證明玩家收益，並同時揭露 selector hit rate、miss regression、completion、mandatory quality、wall time 與 single-recommendation p95／p99／max。只有收益覆蓋率與成本成比例，才建立新的 overnight run；本輪 identity 與 run ID 不得復用。
