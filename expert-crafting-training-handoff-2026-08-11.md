# Frozen Rabbit Expert：玩家實戰影片與漸進訓練完整交接

`last_verified: 2026-08-11`

## 文件責任

本文件是 2026-08-11「宇宙鈦鐵錠」玩家實戰影片、solver 改良與離線漸進訓練的完整研究交接快照。它保存本次工作做過什麼、哪些證據可靠、哪些假設錯誤、哪些實驗無效，以及下一位 Agent 應從哪裡重新評估。

它不是隨 code 自動更新的 runtime spec。當本文件與目前 code／tests／domain owner 衝突時，以目前 code、測試與下列 canonical owner 重新驗證：

- mechanics／球色與高難知識：`.agents/skills/domain/ffxiv_expert_crafting.md`
- solver safety／promotion：`.agents/skills/domain/solver_policy_and_safety.md`
- offline architecture：`.agents/skills/professional/technical_architecture.md`
- 階段與下一步：`.agents/roadmaps/poc_implementation_plan.md`
- golden trace workflow：`.agents/workflows/validate-golden-traces.md`

## 一頁結論

目標輸入固定為：

- 作業精度：`5,408`
- 加工精度：`5,237`
- CP：`722`
- 宇宙工具高品質加成：`ON`
- 目標配方：宇宙鈦鐵錠（Cosmotized Ilmenite Ingot）
- Recipe ID：`36282`
- Item ID：`48360`
- 配方目標：作業 `7,300`、品質 `18,900`、耐久 `30`

目前可用的手寫 video-informed reference policy 在固定 72 場完成 `4／72`，lower-tail balance 為 `52.05%`。換一組未參與調整的新 72 條亂數序列後仍為 `4／72`。

本次訓練沒有產生可 promotion 的 artifact：最佳 compact candidate 在固定 72 場仍是 `0／72`，lower-tail balance `31.59%`；新 72 場仍是 `0／72`。因此 runtime 保留手寫 reference policy，沒有載入任何訓練 artifact。

本次有價值的成果不是成功率突破，而是：

1. 收錄一條玩家親手完成的 37 步成功 golden trace。
2. 修正影片動作辨識：第 17 步是倉促加工失敗，不是設計變更；第 11／20 步是冒進加工。
3. 確認開場為通常（白球），第一個動作後才抽下一 condition。
4. 以影片否定「所有 active buff refresh 都禁止」與「連續 Observe 永遠禁止」。
5. 發現 simulator 曾讓 no-step Final Appraisal 偷吃未來 condition／success RNG，這會製造遊戲內不存在的抽球優勢；已修正並加測試。
6. 發現 deterministic policy 會在 active Final Appraisal、無預算 repeated Observe 等狀態形成循環；已用精準 safety gate 處理，而不是重新封死所有臨場選擇。
7. 把訓練從 16 labels 擴到 512 states、每候選 24 futures，並測完 linear、MLP、DAgger、多 continuation、單一 continuation 與一輪 policy iteration。
8. 證據顯示目前瓶頸不是單純資料量或模型容量，而是 action-only label 遺失長期 continuation intent。下一步應研究 option／route learning。

## 名詞翻譯

為避免後續溝通再次被術語淹沒：

- `1 個局面／state`：製作途中某一刻的完整狀態，例如球色、作業、品質、耐久、CP、內靜、buff 剩餘回合。不是一場完整製作，也不是一個「維度」。
- `512 states`：512 道「現在按什麼」的途中題目；每題本身同時包含很多資源面向。
- `continuation policy`：候選第一步按完後，負責把剩下整場走完的固定後續策略。先前對使用者簡稱「教練」，但它不代表權威真理。
- `compact scorer／candidate`：最後要在 runtime 幾十毫秒內選下一技能的小模型；先前對使用者簡稱「學生」。
- `72 場`：3 個 assumed condition profiles × 24 seeds 的完整 episode 評估。固定 72 場已被反覆查看，後期只能稱 regression corpus，不是 untouched held-out。
- `lower-tail balance`：每場先取 `min(progress ratio, quality ratio)`，再取較差約一成的門檻值；不是最差單場，也不是平均值。

## 玩家實戰影片證據封存

### 原始檔識別

- 路徑：`C:\Users\User\Downloads\錄製內容 2026-08-11 193225.mp4`
- 大小：`228,373,230 bytes`
- SHA-256：`40C96293AAE6AF7947CBE85E39D68C3198931B4DBFBC3877132E03F27DA091E3`
- 檔案時間：`2026-08-11T19:32:20.6728653+08:00`
- 長度：約 `4:58`
- client／patch：TW 7.51、繁體中文介面
- 玩家設定：`5408／5237／722／宇宙工具 ON`
- 結果：一次成功完成，作業與品質皆封頂

原始影片未複製進 repository，理由是容量、畫面隱私與 Git 歷史負擔。SHA-256 可用來確認未來取得的檔案是否為同一來源。repository 永久保存匿名化 mechanics 欄位與 deterministic replay。

### 轉錄方法與可信度

- 技能辨識：2 fps，共 596 幀；時間誤差約 ±0.5–1 秒。
- 穩定狀態：1 fps，共 298 幀；採工次更新後的穩定畫面，避免技能剛按下、CP 已扣但工次尚未更新的過渡幀。
- 判讀優先序：前後 CP／作業／品質／耐久差值，其次才是 tooltip、buff 與熱鍵亮框。
- buff icon 列被畫面上緣裁切；Inner Quiet 沒有可直接讀出的數字。這兩者在 replay 中是 mechanics-derived，不可寫成 video-observed。
- 最後一步完成 overlay 取代穩定狀態，因此最後耐久不作影片直接觀測 assertion。

### 曾經發生且已修正的轉錄錯誤

1. 第 17 步曾因「長期儉約減耗 + 掌握回血」使耐久淨值不變，被誤判為 Careful Observation／設計變更。玩家明確回看影片並確認是倉促加工失敗。正式 trace 已修正。
2. 第 11、20 步曾被粗略記成倉促加工；品質增量與 Expedience 狀態交叉驗證後確認為冒進加工成功。
3. 後段不是三次觀察，也不是第二次觀察後直接出高品質。正確是兩次觀察，之後重開闊步、重開改革，才在下一球得到高品質。
4. 工次 32 的技能是 Great Strides／闊步；早期暫存筆記曾把中文名稱誤寫成工匠的神技。正式 golden trace 使用 canonical action ID，不受該文字錯誤影響。

## 37 步完整成功序列

下表的數值是動作結算後狀態。`D` 是耐久；第 37 步耐久因完成 overlay 不列為直接觀測。

| # | 約略時間 | 動作 | 成敗 | 球色 before → after | 作業 | 品質 | D | CP |
| ---: | :---: | --- | :---: | --- | ---: | ---: | ---: | ---: |
| 1 | 00:10 | 堅信 `muscleMemory` | 成功 | 通常 → 通常 | 906 | 0 | 20 | 716 |
| 2 | 00:12 | 崇敬 `veneration` | 成功 | 通常 → 安定 | 906 | 0 | 20 | 698 |
| 3 | 00:18 | 高速製作 `rapidSynthesis` | 成功 | 安定 → 安定 | 4,681 | 0 | 10 | 698 |
| 4 | 00:24 | 工匠的絕技 `trainedPerfection` | 成功 | 安定 → 大進展 | 4,681 | 0 | 10 | 698 |
| 5 | 00:40 | 儉約製作 `prudentSynthesis` | 成功 | 大進展 → 高效 | 5,904 | 0 | 10 | 680 |
| 6 | 00:43 | 掌握 `manipulation` | 成功 | 高效 → 結實 | 5,904 | 0 | 10 | 632 |
| 7 | 00:53 | 儉約製作 `prudentSynthesis` | 成功 | 結實 → 安定 | 6,447 | 0 | 12 | 614 |
| 8 | 00:59 | 改革 `innovation` | 成功 | 安定 → 結實 | 6,447 | 0 | 17 | 596 |
| 9 | 01:10 | 整備加工 `preparatoryTouch` | 成功 | 結實 → 結實 | 6,447 | 975 | 12 | 556 |
| 10 | 01:19 | 倉促加工 `hastyTouch` | 成功 | 結實 → 安定 | 6,447 | 1,560 | 12 | 556 |
| 11 | 01:23 | 冒進加工 `daringTouch` | 成功 | 安定 → 通常 | 6,447 | 2,510 | 7 | 556 |
| 12 | 01:41 | 改革 `innovation` | 成功 | 通常 → 安定 | 6,447 | 2,510 | 12 | 538 |
| 13 | 01:48 | 倉促加工 `hastyTouch` | 成功 | 安定 → 高品質 | 6,447 | 3,192 | 7 | 538 |
| 14 | 02:03 | 秘訣 `tricksOfTheTrade` | 成功 | 高品質 → 大進展 | 6,447 | 3,192 | 12 | 558 |
| 15 | 02:09 | 掌握 `manipulation` | 成功 | 大進展 → 高效 | 6,447 | 3,192 | 12 | 462 |
| 16 | 02:11 | 長期儉約 `wasteNot2` | 成功 | 高效 → 通常 | 6,447 | 3,192 | 17 | 413 |
| 17 | 02:16 | 倉促加工 `hastyTouch` | **失敗** | 通常 → 大進展 | 6,447 | 3,192 | 17 | 413 |
| 18 | 02:25 | 精煉加工 `refinedTouch` | 成功 | 大進展 → 安定 | 6,447 | 3,679 | 17 | 389 |
| 19 | 02:30 | 倉促加工 `hastyTouch` | 成功 | 安定 → 結實 | 6,447 | 4,199 | 17 | 389 |
| 20 | 02:34 | 冒進加工 `daringTouch` | 成功 | 結實 → 通常 | 6,447 | 5,027 | 19 | 389 |
| 21 | 02:46 | 改革 `innovation` | 成功 | 通常 → 結實 | 6,447 | 5,027 | 24 | 371 |
| 22 | 02:52 | 整備加工 `preparatoryTouch` | 成功 | 結實 → 通常 | 6,447 | 6,782 | 24 | 331 |
| 23 | 03:00 | 工匠的神技 `trainedFinesse` | 成功 | 通常 → 高效 | 6,447 | 7,757 | 29 | 299 |
| 24 | 03:15 | 掌握 `manipulation` | 成功 | 高效 → 通常 | 6,447 | 7,757 | 29 | 251 |
| 25 | 03:23 | 儉約加工 `prudentTouch` | 成功 | 通常 → 高效 | 6,447 | 8,732 | 29 | 226 |
| 26 | 03:26 | 長期儉約 `wasteNot2` | 成功 | 高效 → 安定 | 6,447 | 8,732 | 30 | 177 |
| 27 | 03:36 | 整備加工 `preparatoryTouch` | 成功 | 安定 → 結實 | 6,447 | 10,032 | 25 | 137 |
| 28 | 03:43 | 闊步 `greatStrides` | 成功 | 結實 → 高效 | 6,447 | 10,032 | 30 | 105 |
| 29 | 03:47 | 改革 `innovation` | 成功 | 高效 → 安定 | 6,447 | 10,032 | 30 | 96 |
| 30 | 03:50 | 觀察 `observe` | 成功 | 安定 → 高效 | 6,447 | 10,032 | 30 | 89 |
| 31 | 03:54 | 觀察 `observe` | 成功 | 高效 → 通常 | 6,447 | 10,032 | 30 | 85 |
| 32 | 04:00 | 闊步 `greatStrides` | 成功 | 通常 → 安定 | 6,447 | 10,032 | 30 | 53 |
| 33 | 04:11 | 改革 `innovation` | 成功 | 安定 → 高品質 | 6,447 | 10,032 | 30 | 35 |
| 34 | 04:20 | 比爾格的祝福 `byregotsBlessing` | 成功 | 高品質 → 通常 | 6,447 | 18,563 | 25 | 11 |
| 35 | 04:35 | 模範製作 `carefulSynthesis` | 成功 | 通常 → 通常 | 6,990 | 18,563 | 15 | 4 |
| 36 | 04:54 | 倉促加工 `hastyTouch` | 成功 | 通常 → 高效 | 6,990 | 18,900 | 5 | 4 |
| 37 | 04:56 | 模範製作 `carefulSynthesis` | 成功 | 高效 → 完成 | 7,300 | 18,900 | unknown | 0 |

### Action-only canonical sequence

```text
MuscleMemory, Veneration, RapidSynthesis(success), TrainedPerfection,
PrudentSynthesis, Manipulation, PrudentSynthesis, Innovation,
PreparatoryTouch, HastyTouch(success), DaringTouch(success), Innovation,
HastyTouch(success), TricksOfTheTrade, Manipulation, WasteNotII,
HastyTouch(failure), RefinedTouch, HastyTouch(success), DaringTouch(success),
Innovation, PreparatoryTouch, TrainedFinesse, Manipulation, PrudentTouch,
WasteNotII, PreparatoryTouch, GreatStrides, Innovation, Observe, Observe,
GreatStrides, Innovation, ByregotsBlessing, CarefulSynthesis,
HastyTouch(success), CarefulSynthesis
```

### Golden replay

- 正式測試：`tests/golden-traces/playerVideoGoldenTrace.test.ts`
- 斷言範圍：每一步直接可見的 progress、quality、CP，以及除最後一步外的 durability。
- 結果：37 步全部一致，最終 `terminal=completed`。
- mechanics version 註記：`cosmic-craft-mechanics-v0.2.1-tw751-empirical`
- 原始影片不在 repo；fixture 只保存 mechanics 欄位，不保存角色、聊天或伺服器資訊。

## 影片能教我們什麼，不能教我們什麼

### 能支持的結論

1. 開場是通常（白球）。目前 simulator 初始 state 固定 `condition='normal'`，第一個有工次動作後才抽下一 condition。
2. 開場路線有顯著風險：安定球高速製作成功，之後另一段高風險品質技能也多次成功。
3. 玩家會先決定要做的事，再用當前球色提高同一意圖的價值，而不是只照球色改做完全不同的事。
4. active buff refresh 不是一律錯誤。影片在後段重新施放改革；使用者也指出高效球即使 buff 尚餘多回合，半價刷新可能仍有賺。
5. repeated Observe 不能全域 hard-veto。影片確實連續使用兩次 Observe，且最後完成。
6. repeated Observe 有完整 opportunity cost：兩次 Observe 本身花 11 CP，但也燒掉原本闊步，之後另花 32 CP 重開闊步、18 CP 重開改革。不能只把它視為 11 CP 抽兩球。
7. 第二次 Observe 後沒有直接出 Good；球色先回 Normal，接著 Great Strides 抽到 Centered、Innovation 再抽到 Good。影片不證明 Observe 提高 Good 機率。
8. 收尾不是「比爾格 → 倉促 → 製作」三步；比爾格後實際是 Careful Synthesis、Hasty Touch 成功、Pliant Careful Synthesis 完成。

### 不能支持的結論

1. 一場成功 trace 不能估 condition probability，也不能證明這條路的總成功率。
2. 不能把 37 步固定抄成巨集；其中包含 Rapid／Hasty／Daring 成敗與 condition 分支。
3. 不能把 cropped buff／Inner Quiet 寫成影片直接觀測。
4. 不能把後段 Good 歸因於 Observe；所有會推進工次的動作都會抽下一 condition。
5. 不能證明 repeated Observe 應成為常規策略；只能否定「永遠禁止」。

## 本次 code／model 行為改動

### Safety v1.4

目前 `packages/solver/src/policySafety.ts` 只 hard-veto：

- illegal action；
- 品質未達標卻會直接完成作業；
- 非有效完成時的立即耐久歸零；
- active Final Appraisal 再次施放造成的 no-step deterministic loop；
- `comboFrom=observe` 且沒有完整品質爆發／保守作業收尾預算的 repeated Observe。

以下行為不再全域 hard-veto：

- active buff 尚有多回合時刷新；
- 第一次 Observe；
- 具完整 finishing budget 的 repeated Observe；
- 高效球提早刷新 Manipulation／Waste Not／Innovation／Veneration。

正式 runtime policy version：`cosmic-titanium-lookahead-fallback-v1.4.0`。

### Simulator no-step RNG 修正

舊 `runEpisode` 在每次 action 都消耗 condition／success random stream，即使 action 是 `noStep`。Final Appraisal 不推進遊戲工次、也不換球，但舊 simulator 會偷偷跳過一個未來 condition draw，使 rollout teacher 誤以為 Final Appraisal 能避開壞球。

目前行為：

- no-step action 的 `nextCondition` 保持 current condition；
- no-step action 不消耗 condition random stream；
- no-step deterministic action 不消耗 success random stream；
- 下一個真正推進工次的 action 取得與「未插入 no-step action」相同的 paired draw。

測試：`packages/simulator/tests/episode.test.ts`。

### Offline sampler／labeler／scorer

- reachable state sampler 在不同 source policies 間 round-robin，不再由第一個 policy 壟斷資料。
- state bucket 保存主要 buff 的精確剩餘回合，不只 active／inactive。
- root candidate 比較所有 legal、non-catastrophic actions，不再只取 preferred 前 12 個。
- state seed 加入 condition 與精確 buff duration。
- feature schema 擴為 47 維，加入 condition × buff、phase pressure、quality finisher readiness 等 interactions。
- compact scorer 由 linear softmax 升為單 hidden layer、64 hidden units 的 deterministic MLP。
- sampling policies 包含 target、Pliant refresh、budgeted condition fishing、lookahead baseline、guide greedy、progress commit、quality commit、resource safe，以及選配前代 artifact。
- continuation modes：`broad`、`target-only`、`bootstrap-only`。
- runner manifest 現記錄 continuation IDs 與 `samplesPerProfile`，避免錯誤 resume 不同標註預算的 checkpoint。
- `tools/analyze-policy` 可分類完整 episode、action counts、停在步數上限或提前無 action、平均 progress／quality／D／CP 與代表性失敗 trace。

## 評估設計與重要限制

### 固定 72 場

- 3 個 condition profiles：Balanced、Normal-heavy、Resource-scarce。
- 每個 profile 24 seeds，共 72 episodes。
- 這些 profile 目前是 sensitivity assumptions，不是 Recipe 36282 經實戰校準的 condition distribution。
- 固定 72 場在多輪迭代中被反覆查看，後期只能當 regression corpus。

### 新 72 場

- 使用不同 seed start：`2882400001`。
- 仍使用相同 3 個 assumed profiles × 24 seeds。
- target reference：`4／72`。
- round-12 best compact：`0／72`。
- target 平均 progress ratio 約 `91.91%`、平均 quality ratio 約 `67.34%`。
- compact 平均 progress ratio 約 `61.11%`、平均 quality ratio 約 `51.30%`。

### 指標陷阱

- `failureRate=0` 不代表策略沒有失敗。許多 episode 在 CP／耐久不足、沒有 legal action 或 policy 回傳 null 時以 `terminal='none'` 停下，沒有被計入 `failed`。
- 下一版 evaluator 應把 `terminal='none'` 分成 stalled、no-legal-action、policy-null、step-limit，並在 promotion 中視為未完成。
- training accuracy 只表示模型能否模仿 labels，不表示 labels 能否組成一致完整路線。
- 本次約 93% training accuracy 仍是 0／72，正是 action-only imitation 不足的證據。

## 訓練實驗矩陣

`candidate tail` 是固定 regression 72 場的 lower-tail balance。Round 9 之前 simulator 尚未修正 no-step RNG；早期結果只作歷史診斷，不能與修正後輪次直接比較。

| 輪次 | 核心改動 | labels | futures／候選 | 模型 | 時間 | reference | candidate | candidate tail | 判斷 |
| --- | --- | ---: | ---: | --- | ---: | --- | --- | ---: | --- |
| round-1 | 早期小型 targeted pilot | 12 | 1 profile × 1 | linear | 89.5s | 尚未成形 | 0／72 | 5.5% | 只證明 pipeline 可跑 |
| round-2 | reachable states 擴到 46 | 46 | 1 × 1 | linear | 167.5s | baseline 1／72 | 0／72 | 0% | 擴資料沒有救回 |
| round-3 | phase intent target、50 steps | 16 | 2 × 1 | linear | 178.1s | target 4／72 | 0／72 | 12.4% | 小資料 overfit，未 promotion |
| round-4 | 納入玩家影片訊號 | 16 | 2 × 1 | linear | 186.6s | target 4／72 | 0／72 | 12.4% | 影片改善 runtime reference，不改善 compact |
| round-5 | 所有合法非致命 root、平衡來源 | 64 | 3 × 2 | linear | 86.3s | target 4／72 | 0／72 | 0% | 19 種 label；linear 容量不足 |
| round-6 | states 擴至 256 | 256 | 3 × 2 | linear | 130.7s | target 4／72 | 0／72 | 1.7% | accuracy 降至 52.3% |
| round-7 | 64 hidden-unit MLP | 256 | 3 × 2 | MLP | 56.3s | target 4／72 | 0／72 | 10.6% | accuracy 88.3%，容量改善但未完成 |
| round-8 | candidate-state DAgger | 512 | 3 × 2 | MLP | 297.4s | target 4／72 | 0／72 | 5.2% | **受 no-step RNG／Final Appraisal loop 汙染** |
| round-9 | 修 no-step RNG、Final Appraisal loop | 512 | 3 × 2 | MLP | 239.8s | target 4／72 | 0／72 | 16.8% | simulator 修正有效 |
| round-10 | 修正後 candidate-state DAgger | 512 | 3 × 2 | MLP | 239.6s | target 4／72 | 0／72 | 22.3% | 中間指標改善，值得續試 |
| round-11 | 每候選 futures 由 6 增至 24 | 512 | 3 × 8 | MLP | 662.4s | target 4／72 | 0／72 | 10.9% | 更穩定 labels 反而退步；不是單純抽樣不足 |
| round-12 | 單一 target continuation | 512 | 3 × 8 | MLP | 155.9s | target 4／72 | 0／72 | **31.6%** | 本次最佳 compact；一致 continuation 有效但不足 |
| round-13 | round-12 artifact 作單一 continuation | 512 | 3 × 8 | MLP | 205.1s | target 4／72 | 0／72 | 29.9% | 自我 policy iteration 退步，停止此分支 |

另有兩個 `round-5-technical-smoke*`，只有 2 states、10 epochs、20 steps，純粹量測 labeling throughput；不得拿來判斷 policy 品質。

## 每輪假設與結果

### 有效或部分有效

1. **影片直接反例比抽象規則有價值**：它推翻 active buff refresh 與 repeated Observe 的絕對禁止。
2. **平衡來源與精確 buff duration 必要**：舊 sampler 會被第一個 policy 路徑壟斷，active／inactive bucket 也無法區分剩 1 回合與 3 回合。
3. **模型容量確實是部分瓶頸**：同一 256 labels，linear accuracy 52.3%，MLP 提升至 88.3%；但仍不是完整成功的充分條件。
4. **no-step RNG 修正是實質 mechanics／simulation 修正**：Final Appraisal labels 從 round-8 的 55／512 降至修正後約 10／512，虛假抽球優勢消失。
5. **精準 loop gate 有效**：active Final Appraisal 重複曾在 72 場累積 1,663 次；修正後不再形成同狀態死循環。無預算 repeated Observe gate 保留影片型有預算第二次 Observe。
6. **單一 continuation 比多 continuation action-only label 更一致**：round-12 tail 31.6%，高於 corrected broad／DAgger 的 16.8%／22.3%。

### 無效、被推翻或不應重複

1. **「小樣本沒漲就停止」過早**：本次刻意擴到 512 × 24 futures，得到更有力的結構性負結果。未來仍應讓有意義假設取得足夠樣本，但不是無限擴大同一錯誤 label 形式。
2. **只增加 state 數量無法解決 action-only inconsistency**：64 → 256 → 512 沒有 completion。
3. **只增加 epochs／training accuracy 無法解決完整路線**：約 93% accuracy 仍 0／72。
4. **只增加每候選 futures 無法解決教師不一致**：6 → 24 futures 的 round-11 反而從 tail 22.3% 降至 10.9%。
5. **多 continuation 取每題最佳 action，但丟掉 continuation identity**：不同題的答案暗中假設不同後續 persona，compact model 會把互斥片段拼成不存在的路線。
6. **讓尚未成功的 compact 自我當教練不保證改善**：round-13 tail 29.9%，低於 round-12 31.6%。
7. **不應把 Observe 或 buff refresh 重新做成粗暴絕對 veto**：這會排除玩家成功 trace；應處理資源預算、意圖與循環，而不是看到負例就封技能。
8. **不應把固定 72 場繼續稱 untouched held-out**：它已被用於選方向。需要預先凍結的新 corpus。

## 為什麼目前的「教練」還不是真正 oracle

continuation policy 的角色只是固定候選第一步之後的後半場，使 A／B 技能比較公平。它能當 continuation，不代表它是高手：

- target reference 本身只有 4／72；
- assumed condition profiles 尚未校準；
- 某候選若把 state 帶到 continuation 不熟悉的分布，評分可能低估；
- broad teacher 會挑 action A + continuation X、action B + continuation Y 的最佳組合，但 compact artifact 最後只學 action，沒有 X／Y；
- bootstrap-only policy iteration 若 continuation 本身是 0／72，許多候選後半場都不可救，label 容易失真。

因此下一版若仍使用「教練」概念，必須把 continuation／option identity 一起保留到 artifact，或直接學 route value／短期 option，而不是只輸出一個 action class。

## 建議下一個核心研究方向

### 1. Hierarchical option／route learning

讓 artifact 同時輸出：

- 當前 option：progress setup、quality stack、quality burst、condition fishing、resource recovery、safe finish；
- option 內的下一 action；
- option termination／switch condition；
- progress finish reserve、quality burst reserve 與可承受賭球次數。

球色應是 option 內的機會加成與切換訊號，而不是完全取代原先意圖。例如「原本要續 Manipulation，Pliant 使它更值得」與「原本要品質爆發，Good 使 Precise／Byregot 更值得」應能被同一 option 表達。

### 2. 保留 route intent 的 labels

可考慮：

- label `(optionId, actionId)`，而不是只有 `actionId`；
- 將 continuation policy ID 或 route signature 納入 supervision；
- 學 action-value／option-value，再由固定 planner 選 route；
- short-horizon option rollout + terminal value，而不是每題任意切換整套 continuation；
- 對同一 state 保留多個近似等價 route，不強迫 noisy single class。

### 3. 評估修正

- 凍結 train／validation／final test seeds，不依 final test 反覆調整。
- 以完整 CrafterProfile 與 trace source 分組，禁止同 profile state 隨機散到 train/test。
- 將 `terminal='none'` 細分並計入未完成。
- 除 completion 外報告 progress deficit、quality deficit、CP exhaustion、durability exhaustion、loop／stall、first irreversible mistake。
- 分 profile 報告，不能只看 72 場總數。
- 在 condition distribution 未實證前，清楚標示 sensitivity result，不稱真實成功率。

### 4. 新實戰資料優先級

下一批最有價值的不是再錄一場只看最終成功，而是：

1. 完整成功與失敗各數場，保留從開場到結束。
2. 特別收錄 Pliant 提早續 buff、有預算 repeated Observe、Good quality burst、Centered 高風險技能、Malleable progress commit。
3. 失敗場記錄第一個「事後認為做錯」的決策與當時原意。
4. 若可能顯示完整 buff icon／Inner Quiet；保持右側作業、品質、耐久、CP 可讀。
5. 原始 trace 應記 actual action、success／failure、next condition；只記球色不足以重建 state。

## 目前檔案與產物地圖

### 持久、應由下一位 Agent 先讀

- 本交接：`expert-crafting-training-handoff-2026-08-11.md`
- 完整研究來源快照：`cosmic-expert-crafting-solver-poc-handoff.md`
- 玩家影片 golden trace：`tests/golden-traces/playerVideoGoldenTrace.test.ts`
- safety：`packages/solver/src/policySafety.ts`
- simulator episode：`packages/simulator/src/episode.ts`
- target policy：`packages/policy-lab/src/targetCrafterPolicy.ts`
- sampler：`packages/policy-lab/src/reachableStates.ts`
- labeler：`packages/policy-lab/src/labelStates.ts`
- features／model：`packages/policy-lab/src/features.ts`、`packages/policy-lab/src/compactScorer.ts`
- policy population：`packages/policy-lab/src/policyPopulation.ts`
- training CLI：`tools/train-policy/index.ts`
- failure analyzer：`tools/analyze-policy/index.ts`
- canonical roadmap：`.agents/roadmaps/poc_implementation_plan.md`

### 本機暫存、可能被清理

- `.tmp/video-analysis-actions.md`
- `.tmp/video-analysis-states.md`
- `.tmp/policy-training/round-1` 到 `round-13-policy-iteration-512`
- rejected artifact JSON 總計約 1.3MB；checkpoint 總計約 31MB；report 約 35KB。

這些 raw artifacts 都沒有 promotion，不得移入 runtime。若 `.tmp` 仍在，可用它們做 error analysis；若被清理，本文件的參數、矩陣與 CLI 足以重跑關鍵輪次。

### 關鍵重跑命令

單一 target continuation、目前最佳 compact 實驗：

```powershell
npm run train:policy -- --max-states 512 --sampling-seeds 32 --held-out-seeds 24 --samples-per-profile 8 --label-profile-count 3 --epochs 1600 --max-episode-steps 50 --time-limit-minutes 30 --continuation-mode target-only --bootstrap-artifact .tmp/policy-training/round-10-dagger-corrected-512/artifact.json --output .tmp/policy-training/round-12-consistent-teacher-512
```

一輪 bootstrap policy iteration：

```powershell
npm run train:policy -- --max-states 512 --sampling-seeds 32 --held-out-seeds 24 --samples-per-profile 8 --label-profile-count 3 --epochs 1800 --max-episode-steps 50 --time-limit-minutes 30 --continuation-mode bootstrap-only --bootstrap-artifact .tmp/policy-training/round-12-consistent-teacher-512/artifact.json --output .tmp/policy-training/round-13-policy-iteration-512
```

新 72 場診斷：

```powershell
node tools/analyze-policy/run.mjs --artifact .tmp/policy-training/round-12-consistent-teacher-512/artifact.json --seed-count 24 --seed-start 2882400001
```

## 最後驗證快照

2026-08-11 本機結果：

- `npm run typecheck`：通過。
- `npm test`：9 files、52 tests 通過。
- `npm run benchmark:solver`：120 scenarios，p50 `30.381ms`、p95 `45.867ms`、p99 `54.965ms`；p95 低於 50ms 目標。
- `npm run build`：Vite production build 通過。
- `git diff --check`：通過，只有 Windows LF／CRLF 提示。
- 最長單次正式訓練：round-11，`662.4s`，約 11.0 分鐘；所有單次都低於 40 分鐘。

## 工作樹與交付狀態

- 目前 branch：`main`。
- `origin/main` 在本機顯示 `[gone]`。
- 本次研究、程式、測試與文件變更尚未 commit。
- 不得把 dirty worktree 當成可丟棄暫存；下一位 Agent 應先跑 `git status --short --branch` 與 `git diff`。
- 沒有 push、deploy 或把 rejected artifact 接回 runtime。

## 下一位 Agent 的最短接手清單

1. 先讀本文件，再讀 `AGENTS.md` 路由的 operating contract、mission、architecture、solver safety 與 roadmap。
2. 檢查 dirty worktree，不要重做或覆蓋現有 37-step trace、no-step RNG fix、safety v1.4、sampler／MLP／training tools。
3. 重跑 typecheck、tests、benchmark；build 依本機 AGENTS 指示使用必要 permission。
4. 不要 promotion 任何 `.tmp` artifact；目前全部 0／72。
5. 把固定 72 場當 regression，不再當 untouched held-out。
6. 若延續演算法研究，先寫出 option／route intent 如何進 state、label、artifact、evaluation；不要先把 states 從 512 盲增到 1,024。
7. 若提出重新 hard-veto buff refresh／Observe，必須先重播玩家 37 步 trace，證明不會排除已發生的成功路線。
8. 將 mechanics correctness、condition profile confidence、policy quality 分開報告。

## 最誠實的問題定義

這個難題不是「找一條固定高品質巨集」，也不是「看見某顆球就按固定技能」。它要求 policy 在隨機 condition、技能成敗、進度、品質、耐久、CP、Inner Quiet、buff duration 與安全收尾之間維持一個跨多步的計畫，並在球色出現時利用機會但不失去原本意圖。

本次工作證明了：擴資料、加模型容量、修局部規則都必要，但 action-only imitation 仍不足。下一個突破點最可能是讓模型保留「接下來要完成什麼」的 route intent，並用完整 episode 驗證該意圖能否跨球色與失敗持續成立。

## 2026-08-11 接手重評增補

使用者放寬了 web-only、極小模型與 50ms 限制：強規劃器現在可在本機使用約一秒，並確認藥水把同一裝備的 CP 由 722 提高 27 至 749。722 歷史 trace 不回寫；749 是獨立 profile／benchmark。

### 為何舊 0／72 訓練會崩塌

- round 12 的 512 labels 中，316 個最佳 route 在 24 futures 完全沒有 completion；304 個 top-vs-second 由 lower-tail surrogate 決定，92 個由 `averageSteps` 決定，其中 90 個是零完成，等於獎勵更快 stall。
- round 12 開場 label 是 Prudent Touch；其他 rounds 會改成 Reflect，沒有一輪保留玩家成功 route 的 Muscle Memory。round 11→12 只改 continuation population 就有 139／512 labels 翻轉；round 12→13 的共同 states 有 346／429 翻轉。
- 93% action classification accuracy 因此只表示擬合不穩定 labels，不表示懂得完整路線。

### 本次落地的評估修正

- `EpisodeResult.stopReason` 分成 completed、failed、policy-null、no-legal-action、illegal-action、action-limit；所有未完成都留在 denominator。
- objective 升為 `completion-viability-lexicographic-v5`：hard stops 的 progress／quality viability 固定為 0，正常 action-limit 才可保留 horizon surrogate；步數只在雙方都有成功時比較。
- 修正 dual-gain action 同步補足 progress／quality 時被誤判 premature completion，以及 exact ties 被 action／policy ID 拼字決定的問題。
- inner rollout 與 outer execution 共用 safety projection／explicit fallback；每個 episode 使用獨立 policy factory，outer action limit 與 inner rollout horizon 分開並依剩餘 budget 縮短。
- artifact 保存 exact recipe／CrafterProfile／objective／feature schema，checkpoint 完整比對 objective、profile、seeds、condition profiles、population 與 horizon，拒絕混接 labels。
- condition profile 可表達 previous-condition transition weights；目前三個 POC profiles 仍只有 assumed marginal weights，不能稱真實成功率。

### 749 CP regression 結果

相同 3 個 assumed profiles × 24 seeds：

| Corpus | 749 reference | continuation MPC | Paired candidate-only | Paired reference-only | MPC p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy regression | 6／72 | 7／72 | 2 | 1 | 160.8ms |
| secondary regression | 6／72 | 10／72 | 5 | 1 | 158.2ms |
| combined | 12／144 | 17／144 | 7 | 2 | — |
| development 前 24 seeds/profile | 6／72 | 6／72 | 2 | 2 | 153.3ms |

三組皆為零 safety violation；secondary 首次在 Normal-heavy 得到 1／24，但 Resource-scarce 仍 0／24，故 worst-profile completion 仍為 0。MPC raw unfinished quality 也低於 reference，而 development 子集沒有重現 completion gain。這是支持繼續 route-aware search 的 signal，不是統計確證或 promotion 證據；兩組 regression 與本次 development 子集都已被查看，不得改稱 held-out。frozen validation／reserved final 尚未執行。

### 下一個實作方向與已落地 contract

不再增加 action-only labels。單一 `video-informed-mainline-v1` route contract 已落地：`progress-window → inner-quiet-build → quality-cycle → quality-burst → safe-finish`，並以 `resource-recovery`、`bounded-condition-fishing` 作帶 `resumeOptionId` 的 suboptions。現有 controller 已有 status／termination、serializable memory、action budget、observed transition advance、單層 resume 與 per-episode factory isolation；Good／Pliant／Centered 不會自行改 route。第一版每 option 暫時只用 target policy 的一個 mainline candidate，尚缺 finisher reserve／certificate、1–3 個 intra-option candidates、episode adapter 與 MPC scoring，不是完成的 solver。

真 option MPC 穩定後，以 search visits／full returns 訓練 distributional policy-value ensemble：預測 completion、hard-stop、resource／balance quantiles 與 option prior，不再把 noisy argmax action 當 one-hot truth。線上以 common random numbers＋successive halving 分配約一秒 budget；850ms 開始收尾、硬 deadline 前回傳，否則 fallback 到現行 versioned lookahead。frozen validation 與 reserved-final corpus 只在設計與 gate 凍結後各自使用。

本增補完成後的驗證：`npm run typecheck` 通過；`npm test` 10 files／67 tests；`npm run test:policy-lab` 2 files／20 tests；runtime benchmark 120 scenarios 為 p50 `31.457ms`、p95 `47.875ms`、p99 `53.613ms`；Vite production build 通過。所有 MPC 結果皆由 research CLI 產生，沒有 artifact promotion、runtime 接線、push 或 deploy。
