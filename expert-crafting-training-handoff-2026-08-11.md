# Frozen Rabbit Expert：玩家實戰影片與漸進訓練完整交接

`last_verified: 2026-08-12`

## 文件責任

本文件是 2026-08-11「宇宙鈦鐵錠」玩家實戰影片、solver 改良與離線漸進訓練，以及 2026-08-12「宇宙鈦鐵釘」completion-first policy 重整的完整研究交接快照。它保存各輪工作做過什麼、哪些證據可靠、哪些假設錯誤、哪些實驗無效，以及下一位 Agent 應從哪裡重新評估。

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

## 2026-08-12 宇宙鈦鐵釘 completion-first 優化增補

### 本輪結果與版本邊界

本輪目標配方改為宇宙鈦鐵釘（Cosmotized Ilmenite Nails）：

- Recipe ID：`36283`
- Item ID：`48361`
- RecipeLevelTable：`746`
- 作業：`10000`
- 耐久：`55`
- 品質上限：`27400`
- mechanics 必要品質：`0`
- practical pilot profile：`5408／5237／749／宇宙工具 ON`

與宇宙鈦鐵錠最重要的差異是：釘只要作業滿就完成，品質是完成後的分數目標。因此 objective 必須是 lexicographic：

1. 先最大化 completion，所有未完成都算失敗，不能只看 `terminal='failed'`。
2. 在能完成的路線之間，再最大化最終品質／收藏品價值。
3. 暫定品質 tier 只作觀察指標，不能取代連續品質分布，也不能為了跨最低 tier 提前犧牲高品質尾端。

已提交 runtime version：`cosmic-titanium-nails-guide-integrated-v1.1.0`。

對應 commit：`11fb794 Fix: 改善宇宙鈦鐵釘完成與品質決策`。

這個 commit 包含 solver、protocol model version、evaluator、兩場玩家 export 的回歸與 canonical 文件同步。提交後 `main` 工作樹乾淨；當時比 `origin/main` ahead 1，未 push／deploy。

### 最嚴重的評估誤判

最初把 `328／512` 看成「表現不錯」是錯誤的。這個數字只代表 328 場完成，不代表這 328 場滿品質，也沒有滿足釘應近乎每場完成的產品目標。後續 v1.0.1 也只有 `343／512`；完成品中暫定 tier 累積為 `227／84／3／3`。它改善最低 tier，卻仍有 169 場 `policy-null`，並大幅犧牲高品質尾端。

這次教訓應固定保留：

- score recipe 的首要 dashboard 必須先顯示 `completed / all episodes`，不能只報 true failure 或只統計完成品品質。
- `terminal='none'`、`policy-null`、`no-legal-action`、`action-limit` 都是未完成，必須留在 completion denominator。
- 品質報告至少包含 min、p10、p25、median、p75、p90、max、平均品質與 completion-weighted quality。
- tier counts 是累積計數，不是互斥 bucket；文件與口頭報告都要避免讓讀者誤以為四個數字相加等於總場數。
- development corpus 已反覆參與調整，只能比較版本；即使得到 `512／512`，也不能稱真實 100% 或正式 promotion。

### 兩場玩家 export 帶來的證據

第一場匿名 export：

- 35 手，停在 progress `9571`／quality `14242`／durability `5`／CP `22`。
- 尚差最後一手作業，不是 completed trace。
- 球色 Normal 15、Good 5、Centered 4、Sturdy 4、Pliant 3、Malleable 4。
- Rapid `3／6`、Hasty `2／3`；沒有支持異常倒楣。
- 它揭露 Good 時作業 cashout 與 Byregot 時機問題，但只修這兩個 exact states 的 v1.0.1 仍不夠。

第二場匿名 export：

- 39 手，以 progress `10000`／quality `17224`／durability `0`／CP `12` 完成，只達暫定第一 tier。
- 球色 Normal 17、Good 4、Centered 5、Sturdy 6、Pliant 5、Malleable 2。
- Rapid `3／7`、Hasty `1／2`；結果稍差但不構成「單純運氣不好」的充分證據。
- 第 31 手玩家用了 Byregot；當時 v1.0.1 推薦 Daring Touch，顯示 policy 沒有保留 IQ10 cashout 的 CP 邊界。
- 末段依序出現 Trained Perfection、四次 Basic Synthesis、Good Tricks、IQ0 Innovation、Careful Synthesis。Basic Synthesis 本身是在走保證作業路線，但舊 reason code 誤標成 build Inner Quiet；真正浪費的是 IQ0、低資源時仍花 CP 開 Innovation，而 Good 當下其實可以直接用 Intensive Synthesis 完成。

兩場 export 都沒有逐步遊戲畫面 observed values，因此是 replay／policy evidence，不是 mechanics golden oracle。永久測試位於：

- `tests/live-sessions/cosmicTitaniumNailsLowTierSessionReplay.test.ts`
- `tests/live-sessions/cosmicTitaniumNailsCompletedLowQualitySessionReplay.test.ts`

後者鎖住完整 39 手重播、大進展作業機會、IQ0 低資源直接收尾，以及 Basic Synthesis reason code。

### 169 場未完成的系統性診斷

不能只看玩家指出的單步案例。本輪另外把 v1.0.1 的 512 場所有未完成 episode 分類，169 場主要是 `policy-null`，常見終局為：

- CP `0`；
- durability `5` 或 `10`；
- 尚差 progress `2500–5500`；
- history 中出現 Final Appraisal／Observe／Veneration 等不推進或錯置 setup；
- 絕大多數 stalled state 已不存在一手可完成的 progress action。

這表示問題不是「最後少補一個 fallback」，而是整條 route 太晚處理作業，已在前中期花完 CP／耐久。若只在 terminal state 加規則，會繼續逐案例打地鼠。

### v1.1.0 的結構性修正

1. **mechanics safety 與 score target 分離**：舊 policy 把 `qualityTarget=27400` 塞進假的 recipe，再交給 ingot-style `isPolicyActionSafe`。對 `requiredQuality=0` 的釘而言，這會把普通完成誤判成「未達品質卻提前完成」，排除合法收尾並導向 Final Appraisal／Observe loop。v1.1.0 的 adaptive score recipe 使用真實 mechanics recipe 做 legality／safety，外部 `CraftObjective` 只負責品質偏好。
2. **明示 progress reserve**：在 unrestricted quality cycle 前先把 progress 推到 `70%`。這不是要在 70% 完成，而是確保後段不會缺數千作業。
3. **避免低品質提前完成**：progress-reserve selector 只選成功後仍嚴格低於 `progressRequired` 的作業技能；高 gain action 若會直接完成，留給後續安全收尾判斷。
4. **condition-aware 作業機會**：Good 在 IQ 未滿時可 Precise，但 IQ10 時優先 Intensive；Malleable 當下直接用 progress action，不在大進展球上先開 Veneration 浪費倍率；Centered／Sturdy 依成功率與耐久挑作業技能。
5. **Byregot CP reserve**：IQ10 時，若候選 CP action 會讓剩餘 CP 低於當前 condition 的 Byregot 成本，而 Byregot 後仍保有作業完成證明，先兌現 Byregot。這是 route resource invariant，不是只針對某一場 log。
6. **低資源終局**：Inner Quiet 已耗盡、CP 低於 56 時，如果已有 progress finisher certificate，直接走第一手收尾，不再開 Innovation 或抽球。
7. **理由忠於 action**：progress action 的 reason 優先於抽象 phase；即使 phase derivation 仍顯示 build-inner-quiet，Basic Synthesis 也回報 `secure-progress`。
8. **不再最低 tier cashout**：`cashOutAtLowestQualityTier=false`。最低 tier 不是 objective；只要完成證明仍成立，policy 應繼續提升連續品質，而不是過早用 Byregot 鎖死尾端。

錠的 default config 保持 `progressFloorBeforeQuality=0`，上述 nails-specific config 不應無證據外溢到宇宙鈦鐵錠。

### 調參與 ablation 紀錄

所有結果都是同一 `nails-development-512-v1`，3 個 assumed sensitivity profiles 加 1 個由錠 Observe trace 暫借的 empirical marginal，每組 128 seeds。這些不是釘的真實 condition oracle。

逐步結果：

| 候選 | 完成 | scored | mid | high | max | median／avg | 判斷 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| v1.0.1 baseline | 343 | 227 | 84 | 3 | 3 | 未建立完整分位報告 | 不可接受；169 policy-null |
| progress floor 0.65＋取消最低 tier cashout | 510 | 236 | 148 | 24 | 17 | avg 16508 | completion 大幅改善，但仍非全完工 |
| floor 0.60 | 510 | 229 | 144 | 19 | 13 | median 15689／avg 16262 | 更早回品質，完成不變但品質退步 |
| floor 0.625 | 510 | 229 | 142 | 19 | 13 | avg 16316 | 無優勢 |
| floor 0.675 | 510 | 237 | 150 | 25 | 19 | median 15778／avg 16535 | 高尾較好，仍有 2 場未完成 |
| floor 0.70，尚未阻止 overshoot | 512 | 245 | 158 | 35 | 26 | median 16041／avg 16233 | 完成全數，但曾有 quality 975 的過早完工 |
| floor 0.70＋non-completing progress reserve | 512 | 258 | 167 | 35 | 26 | median 16549／avg 17019 | 修正 overshoot，成為可靠基線 |
| max Manipulation 2 | 512 | 248 | 139 | 22 | 18 | median 16085／avg 16488 | recovery 減少使品質退步 |
| Great Strides threshold 0.5 | 512 | 265 | 158 | 33 | 22 | median 16633／avg 16957 | lower-tail 略升，但平均與高尾下降 |
| max Innovation 4 | 512 | 250 | 154 | 26 | 18 | median 16290／avg 16776 | 過度限制品質循環 |
| freeQualityCpFloor 125 | 512 | 262 | 171 | 31 | 24 | median 16695／avg 17097 | 可用，但不如 100＋Byregot reserve |
| freeQualityCpFloor 100，未加 Byregot reserve | 512 | 266 | 176 | 29 | 23 | median 16736／avg 17200 | 平衡候選；IQ10 仍可能沒兌現 |
| **v1.1.0：floor 0.70＋free CP 100＋Byregot reserve** | **512** | **272** | **176** | **41** | **22** | **median 16879／avg 17331** | 本輪採用 |

注意：`scored／mid／high／max` 是累積 tier counts；例如 max 22 已包含在 high 41 內。不同候選的 latency 會受機器負載影響，不應用單次 max 做微調依據。

嘗試結果的核心解讀：

- completion 的最大突破來自 objective／safety 修正與 progress reserve，不是某個玩家案例的特殊 if。
- 0.70 是這批 development profiles 上第一個穩定全完成的 floor；它不是跨裝備、跨配方常數。新 profile 必須重新以 base progress、可用 CP／耐久與 recipe progressRequired 評估。
- lowering Manipulation／Innovation 次數看似節省 setup，實際破壞了可持續品質輸出。
- 提早 Great Strides 會把品質從後段尾部搬到中位附近，未改善整體 objective。
- `freeQualityCpFloor=100` 加通用 Byregot reserve，比單純拉高 CP floor 更能同時保留平均與 high tail。

### 最終 development 報告

`npm run evaluate:nails-policy`：

- episodes：`512`
- completed：`512`
- true failure：`0`
- policy-null／no-legal／illegal／action-limit：全 `0`
- safety violations：`0`
- suspicious endgame recommendations：Final Appraisal `0`、Observe `0`、IQ<2 且 CP<56 的 Innovation `0`
- completed quality min／p10／p25／median／p75／p90／max：`5214／11700／13819／16879／20636／23929／27400`
- average completed quality／completion-weighted quality：`17330.96`
- 暫定累積 tiers：`272／176／41／22`
- average actions：`36.12`

分 profile：

| Profile | Evidence | 完成 | median quality | average quality | high／max |
| --- | --- | ---: | ---: | ---: | ---: |
| balanced-six-condition-sensitivity-v1 | assumption | 128／128 | 22306 | 22015 | 30／19 |
| normal-heavy-six-condition-sensitivity-v1 | assumption | 128／128 | 14478 | 14387 | 0／0 |
| resource-scarce-six-condition-sensitivity-v1 | assumption | 128／128 | 13323 | 13539 | 0／0 |
| ingot-observe-95-iid-marginal-v1 | empirical for ingot, transfer assumption for nails | 128／128 | 19522 | 19383 | 11／3 |

最後一次同機量測 18,494 decisions：p50 `1.28ms`、p95 `29.23ms`、p99 `58.19ms`、max `508.67ms`。仍低於 web 3 秒 watchdog，但這是 Node development run，不等於 browser input-to-recommendation latency。

### 39 手 condition sequence 的反事實重播

為檢查整條 route 而非只修 exact states，本輪曾把第二場玩家的 condition sequence 餵給 v1.1.0，必成功技能固定成功，風險技能借用同工次 export 的 observed success flag。這不是可比較 RNG 的正式實驗，只是診斷工具；不同推薦技能會改變 RNG 消耗語意，因此不能宣稱「同一場一定會得到這結果」。

該 diagnostic route 在第 29 手完成，quality `19621`，比原 export 的第 39 手 quality `17224` 高。它具體展示：

- 前段先把 progress 推到 `8607`，後段才集中品質，沒有在收尾時尚差數千作業。
- Good IQ10 時保留並使用 Byregot；未加 reserve 的候選曾在 CP 36 時繼續花 CP，最後 IQ10 沒有兌現。
- Byregot 後使用 Trained Perfection、Groundwork、Basic Synthesis 完成，沒有 IQ0 Innovation。

只能把它當 causal debugging evidence，不能當 39 手 live A/B 或新成功率數字。

### 下一位 Agent 應如何繼續榨品質

目前 completion 問題在 development corpus 已被壓到 0，但品質 lower tail 仍明顯不足：resource-scarce median 只有 `13323`，normal-heavy median `14478`，兩者沒有 high tier。下一輪不要再用「512／512」掩蓋品質差距。

建議優先順序：

1. **先取得 v1.1.0 玩家實戰 exports**：至少 3–5 場完整 session，包含低品質、正常品質與任何未完成。逐場報 completion、quality、condition counts、Rapid／Hasty results、與 recommendation deviations；不要見一個怪步就立刻改 code。
2. **建立 nails-specific condition evidence**：目前第四個 profile 是錠的 95-condition marginal，對釘只是 transfer assumption。把每場自然 transition 分開保存；Duty Action／Careful Observation／forced transition 不混入。
3. **分析 512 場品質 lower tail 的完整 route clusters**：按 profile、final quality decile、Byregot timing、IQ cashout quality、progress floor 達成手數、Manipulation／Innovation 使用數、Good／Malleable conversion 分群。先找重複出現的資源錯配，再改策略。
4. **把 completion certificate 變成每步可量化 reserve**：現行 `progressFloorBeforeQuality=0.7` 是有效 heuristic，但仍是固定比率。更好的方向是以「最壞可接受 success branch 下，剩餘 CP／durability 能完成多少 progress」計算動態 headroom，讓好球多的場次更早追品質、resource-scarce 場次更早保作業。
5. **提升品質 burst scheduler**：目前 Byregot reserve 只避免 CP 被花光，尚未共同比較 Innovation、Great Strides、condition multiplier、剩餘免費 Trained Finesse／Hasty 與 progress finisher opportunity cost。下一步應比較完整 burst schedule，不是獨立 root action。
6. **保留 lexicographic gate**：任何品質候選若讓 completion 從 512 降到 510，除非有明示、可接受的 risk profile，否則不能當預設版本。品質比較只在 completion 相同時進行。
7. **做 profile／裝備敏感度，不立即宣稱泛化**：至少測 craftsmanship／control／CP 邊界。固定 70% progress floor 與 CP 100 很可能依 base gain 改變；不同裝備應由 config 或動態 reserve 決定，不把 5408／5237／749 寫成通用真相。
8. **暫時不要執行 frozen／reserved corpora**：v1.1.0 還需要玩家重驗與下一輪設計。只有 policy、metrics、profiles 與 promotion gate 真正凍結後才使用，避免再次把已看資料冒充 held-out。

### 不建議重走的路

- 不要只修「Good 應按哪一招」或「末段不要 Innovation」的單一案例；本輪最大的提升來自完整 episode stall taxonomy。
- 不要把最低 tier 當成功目標；產品要求是完成後品質越高越好。
- 不要只報完成品平均品質；未完成必須以 0 留在 completion-weighted objective，並另報 lower-tail 分布。
- 不要把 `512／512` 寫成實戰保證；這是反覆調整過的 assumption corpus。
- 不要直接把 nails config 套到 ingot 或未來配方；共用 mechanics／certificate primitive 可以，recipe objective、progress reserve、球色與裝備門檻必須重新估。
- 不要由 counterfactual replay 宣稱相同 RNG 下必然更好；action 改變後，success stream 與工次語意可能不再對齊。
- 當時先暫緩後兩個新任務；此限制已由下方 2026-08-12 第二輪收尾取代，後續優先順序改為 UI 與新配方。

### 本輪驗證與最短接手指令

已完成：

- `npm test`：24 files／155 tests 通過。
- `npm run typecheck`：通過。
- `npm run build`：Vite production build 通過。
- `npm run evaluate:nails-policy`：上述 512 場結果。
- `git diff --check`：通過。

下一位 Agent 開始前：

```powershell
git status --short --branch
git log -1 --oneline
npm test
npm run typecheck
npm run evaluate:nails-policy
```

Vite build 依根 `AGENTS.md` 的 Windows 指示使用必要 permission。接手時先確認 commit `11fb794` 是否仍是目前 policy ancestry；若 code、profiles 或玩家 exports 已更新，以 current checkout 重新產生 metrics，不要直接引用本快照數字。

## 2026-08-12 第二輪：任務分數量尺、專家證與高分尾端

本節取代上方 v1.1.0 的「下一位 Agent」優先順序。使用者已在本輪結束時要求停止繼續 solver 調參，下一階段先處理 UI 與新增其他配方；除非有新玩家 trace 或使用者重新要求，不再延伸本輪策略分支。

### 任務效用不是平均品質

玩家遊戲內畫面確認：

- 宇宙鈦鐵錠完成固定給 `80` 分，且必須同時滿作業與必要品質才成功。
- 宇宙鈦鐵釘作業滿即完成；收藏價值 `1644–1917` 給 `100` 分、`1918–2465` 給 `300` 分、`2466–2710` 給 `700–1000` 分。
- Silver 為 `980`、Gold 為 `1080`。實際時間通常只容許一錠一釘，因此 `80+900=980` 才有 Silver，`80+1000=1080` 才有 Gold；即使釘進入 700 分區間但未達 900，對這個一錠一釘策略仍只是普通繳納。
- `2466` 只是 `700–1000` 區間下端，不是 1000 分；區間內精確換算與 rounding 尚未由結算證據確認，不得假設線性，也不得把 `quality>=24660` 報成銀星率。
- 釘的配方 mechanics 品質上限是 `27400`，但任務表 1000 分上端是收藏價值 `2710`，所以 `CraftObjective.qualityTarget` 已由 `27400` 修正為 `27100`。超過 27100 不再當額外任務效用。

釘的 promotion metric 因此改為：先守住 completion，再增加高分尾端質量；平均與中位品質只作診斷。精確 900 分品質門檻未知期間，evaluator 分開報 `>=95%`、`>=97%`、`>=97.5%` 任務滿分品質與 `>=27100`，這些是 high-tail proxies，不是銀星率。

### 主要球色環境與專家 profile

玩家提供一條純 Observe 的 95 球資料：通常 `36`、高品質 `14`、安定 `13`、結實 `13`、高效 `10`、大進展 `9`。`ingot-observe-95-iid-marginal-v1` 保留這組計數，並依玩家要求作本輪主要調整環境；balanced／normal-heavy／resource-scarce 降為壓力參考，不再讓過嚴假設主導預設策略。

這份資料仍只有 marginal：IID replay 不是自然 transition matrix，也不能代表真實成功率；設計變動、forced transition 與 Duty Action 換球仍要和自然換球分開記錄。

目前專家證最終角色面板為 `5428／5257／764／宇宙工具 ON／specialist=true`。這三個數字已含專家證 `+20／+20／+15`，任何 consumer 都不得再加一次。網站已加入專家證開關、三個專家技能輸入與剩餘資源顯示；這只是 solver 所需的功能接線，不代表後續 UI 調整已完成。

### 錠 v1.1.0

runtime version 升為 `cosmic-titanium-guide-integrated-v1.1.0`。錠仍以作業與品質都滿才算 completed；本輪只把 `freeQualityCpFloor` 由 `150` 調為 `100`、Great Strides 品質門檻由 `0.70` 調為 `0.72`。

- 同一專家 profile、95 球 empirical marginal、128 seeds：舊 config `90／128`，v1.1.0 `96／128`，0 safety violation。
- 三個 assumed stress profiles、各 128 seeds：舊 config `159／384`，v1.1.0 `163／384`，0 safety violation。
- 舊非專家 `5408／5237／749` 在同一 empirical marginal 為 `77／128`；換到專家最終面板但仍用舊 config 已是 `90／128`。不得把 stats uplift 與 policy uplift 混成同一效果。

專家收尾、專心致志→集中加工及兩者合併在 empirical 128 場都沒有提高錠完成數，所以錠預設不啟用 specialist finisher，也不主動投資專心致志；僅保留原本低 CP 時的專心致志→秘訣 bridge。這是 recipe-specific 負結果，不影響釘的專家策略。

### 釘 v1.2.0

runtime version 升為 `cosmic-titanium-nails-guide-integrated-v1.2.0`，objective 升為 `cosmotized-ilmenite-nails-score-max-v2`。在 v1.1.0 的 70% progress reserve 與完成 certificate 上新增：

1. Great Strides 品質門檻由 `0.70` 下修到 `0.65`，讓高分爆發窗不至於太晚，但不採會抬高中位、壓低極高尾端的 `0.55`。
2. 作業 reserve 建立後，Normal 且 IQ `<=8` 時可用專心致志→集中加工；每步仍要求保留保證作業收尾。
3. IQ10／闊步已生效且祝福後仍保有完成證明時，先用可用的快速改革，再以設計變動等待高品質；高品質立即祝福，三次設計變動耗盡便兌現，不形成無限抽球。
4. 自動普通觀察設為 `0`。在 empirical ablation 中 0／1／2 次普通觀察沒有增加 95%／97% 尾端，只多花 CP／步數；玩家仍可現場偏離，但預設不推薦無收益賭運。

同一專家 profile、修正後 27100 任務目標、95 球 empirical marginal、128 seeds：

| Policy | 完成 | `>=24660` | `>=95% target` | `>=97% target` | `>=97.5% target` | `>=27100` | median／avg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 無新專家收尾、H&S 只作舊 bridge、GS 0.70 | 128／128 | 11 | 6 | 6 | 6 | 5 | 20084／20285 |
| **v1.2.0** | **128／128** | **27** | **21** | **21** | **21** | **9** | 20009／20862 |

中位品質略降但高尾大幅增加，正是本輪 threshold-mass objective 的預期，不應用平均或中位否定此候選。`>=97% target` 仍只是 proxy；精確 900 分門檻沒有證據前，上表不得改名為 Silver。

完整 `nails-development-512-v1` 壓力回歸：512／512 完成，0 true failure／policy-null／safety violation；`>=24660` 為 88、`>=95%` 74、`>=97%` 69、`>=97.5%` 68、`>=27100` 39。品質 min／p10／median／p90／max 為 `6839／12358／17884／26893／27400`，平均 `18577`。其中 empirical marginal 為 high `27`／滿任務分品質 `9`；balanced `59`、normal-heavy `2`、resource-scarce `0` 只作壓力解讀。技能總計設計變動 `247`、專心致志 `478`、快速改革 `5`、普通觀察 `0`、祝福 `172`，其中 `73` 次祝福落在高品質。

這 512 場仍是已參與調整的 development，不是 held-out、真實成功率或正式 promotion。frozen／reserved corpora 本輪未執行。

### 本輪收尾驗證與下一步

- `npm test`：25 files／159 tests 通過。
- `npm run typecheck`：通過。
- `npm run build`：Vite production build 通過。
- 錠與釘上述 development evaluators 均 0 safety violation。
- 快速 fallback `npm run benchmark:solver` 連跑兩次 p95 `50.260ms`／`50.361ms`，略高於 `<50ms` gate，因此 benchmark 未通過；功能 test 與 build 不受影響，但不得寫成全綠。

下一階段依使用者指示，先調整 UI 並新增其他配方。開始新配方時仍須 canonical recipe／mission ID、獨立 `CraftObjective`、球色／Duty Action 規則與 scenario registry；不可把本輪錠／釘 config 當通用模板。若之後恢復本任務優化，最優先 evidence 是帶「最終收藏價值＋實際獲得任務點數」的釘結算畫面，用來鎖定 700–1000 區間與 900 分門檻。

## 2026-08-12 第三輪：腳手架三裝備量尺與 adaptive cashout candidate

本輪依玩家實際周回選擇，把裝備固定成三個可重現 profile：

| Profile ID | 面板 | 專家技能／成本語意 |
| --- | --- | --- |
| `player-unbuffed-cosmic-tool-v1` | `5408／5140／630／宇宙工具 ON` | 非專家、無食藥 |
| `player-food-medicine-cosmic-tool-v1` | `5408／5237／749／宇宙工具 ON` | 非專家、食物＋藥水；周回優先比較對象 |
| `player-food-medicine-specialist-cosmic-tool-v1` | `5428／5257／764／宇宙工具 ON` | 專家；只有 candidate 明示開 gate 才可推薦專家技能，呼叫數不等於已知圖紙消耗量 |

`packages/policy-lab` 的 route score 已改為接收 recipe-owned `CraftObjective`；`requiredQuality=0` 的釘與腳手架成品若沒有明示正數 `qualityTarget` 會拒絕評分，不再出現除以 0 或把 mechanics 完成條件冒充玩家效用。腳手架另建立互斥的 development、兩代 frozen validation 與 reserved-final seed corpus；v1 frozen 已用於否決無品質門檻的 CP100 candidate 與驗證木板 joint certificate，v2 frozen 只使用一次驗證凍結後的食藥品質門檻 candidate。reserved-final 仍未使用。

### 量尺與證據限制

- 硬化木板只在作業與 14900 必要品質都達成時算 valid completion。
- 高空作業用的腳手架先要求作業完成，再比較品質、暫定 HQ utility 與期望任務分數。
- HQ utility 暫依 Patch 7.4 Lodestone 玩家研究並與 Teamcraft table cross-check：品質低於 50% 時依 1%→15% 線性式取整，50% 以上查非線性表，再以 NQ 200／HQ 800 算 `200 + 600p`。這是 **community-derived provisional utility**，不是 Recipe 36208 遊戲內 oracle；仍需遊戲內顯示 HQ 百分比／結算 trace cross-check。
- 三個七球 condition profiles 都是 assumption sensitivity，不是真實 transition matrix；所有百分比與期望分數只比較同一 development corpus 內的候選，不代表玩家實戰機率。

### 舊 Round 0 只保留為歷史診斷

舊 16 seeds × 3 assumed profiles 的結果曾回報：木板三裝備滿品質完成 `28／48`、`46／48`、`47／48`；腳手架三裝備皆 `48／48` 完成，滿品質 `6／15／16`，品質 median `13296／16866／17509`。這批使用舊 seed corpus，且專家 profile 發生 specialist action leakage；不可與新 versioned corpus 混合，也不可作目前 promotion evidence。

### 負面結果：增加風險次數與固定 progress floor

1. 木板無 buff、32 seeds × 3 profiles 的 baseline valid completion 為 `45／96`。把 risk attempt cap 固定為 1、2、4 時分別降為 `31／96`、`34／96`、`42／96`；小樣本 cap 6 在腳手架成品也退步。固定「多賭／少賭幾次」沒有形成跨 recipe／裝備的改善規則，這條路不應再靠放大 cap 搜尋。
2. 固定提高木板 `progressFloorBeforeQuality` 至 `0.85`，在 8 seeds × 3 profiles 的 valid completion 由 `15／23／24` 降為 `11／19／19`。腳手架把 floor 由 `0.65` 降至 `0.55`，滿品質由 `3／7／8` 降為 `1／6／7`。固定 progress ratio 會在不同 base gain、CP 與耐久邊界移錯資源；下一步應使用 certificate／headroom，而不是替每套裝備猜一個常數。

### Adaptive IQ10 cashout：第一版 32 seeds × 3 profiles

第一版 candidate 使用 CP ceiling 100，但還沒有 Innovation setup。所有數字都是 baseline→candidate；腳手架成品兩邊三套裝備都 `96／96` completion，0 safety violation。

| 裝備 | 滿品質 | p10 | median | avg | 暫定 HQ% | 暫定期望分 | Paired W／L／T | 專家呼叫 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 無 buff | `10→6` | `8496→10020` | `13728→14490` | `14288.3→14897.7` | `35.8→39.1` | `415.0→434.9` | `51／22／23` | 0 |
| 食物＋藥水 | `34→28` | `11553→12552` | `18035→18305` | `17949.8→18097.3` | `61.4→63.0` | `568.4→578.0` | `31／21／44` | 0 |
| 食藥＋專家 | `42→31` | `12247→13069` | `19352→18768` | `18555.0→18439.4` | `65.9→65.8` | `595.4→595.1` | `27／30／39` | 37 |

這個版本改善無 buff／食藥非專家的 lower tail 與暫定 utility，但犧牲滿品質數；專家 profile 則 median、average、HQ utility 與 paired comparison 都沒有改善，並額外觸發 37 次 specialist action。它證明 cashout timing 值得研究，也同時支持「專家 stats 不等於應消耗專家資源」；不構成 promotion。

### 加入 Innovation setup：16 seeds × 3 profiles 初篩

後續 candidate 讓有足夠 CP、且 exact post-sequence 仍保留 deterministic progress finisher 的 IQ10 cashout 先建立 Innovation／Great Strides。它只跑到 development corpus 的一半，數字仍是 baseline→candidate：

| 裝備 | 滿品質 | p10 | median | avg | 暫定 HQ% | 暫定期望分 | Paired W／L／T | 專家呼叫 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 無 buff | `4→3` | `8640→10020` | `12756→14328` | `14131.6→14745.9` | `34.5→36.6` | `407.2→419.8` | `25／12／11` | 0 |
| 食物＋藥水 | `17→13` | `12065→12990` | `17061→18938` | `17943.9→18264.2` | `59.9→61.8` | `559.1→570.6` | `15／12／21` | 0 |
| 食藥＋專家 | `20→17` | `13241→12628` | `19126→19384` | `18494.2→18612.3` | `64.8→65.0` | `589.0→590.1` | `14／13／21` | 22 |

這是當時的 **candidate under evaluation** 初篩；後續完整 development 與兩代 frozen 結果以下一節為準，不可單獨引用本表作 promotion evidence。

## 2026-08-12 第四輪：三裝備收斂、frozen promotion 與網頁接入

### 最一開始 Round 0 對最終策略摘要

下表刻意保留 Round 0 當時的 corpus 與量尺；跨列的樣本數不同，因此「最終直接證據」欄只寫 identical-seed paired delta，不拿兩個不同 corpus 的百分比硬算提升。腳手架 Round 0 raw median 已用目前 provisional 非線性表換成 median HQ 機率。

| 配方 | 無 buff Round 0 | 食藥 Round 0 | 食藥＋專家 Round 0 | 最終直接證據／決策 |
| --- | --- | --- | --- | --- |
| 宇宙鈦鐵錠 | 滿品質完工 `9／128` | `79／128` | `96／128` | joint progress-prefix certificate 在 frozen 由 `88→89`、`415→416`、`483→485`；合計 `+4／0` completion win/loss，保留 v1.2.0 |
| 宇宙探索用的硬化木板 | `28／48` | `46／48` | `47／48` | frozen `383→387`、`666→670`、`687→690`；合計 `+11／0`，且兩側都禁專家技能，保留 v1.1.0 |
| 宇宙鈦鐵釘 | high／27100=`0／0` | `9／3` | `27／9` | exact 食藥 observed 128 提至 `12／6`；完整 development high `37→45`、27100 `24→27`，但 p10 `11700→11274`，屬高尾 trade-off，保留 exact-profile v1.3.0 路由 |
| 高空作業用的腳手架 | 完工 `48／48`、median HQ 約 `18%` | `48／48`、約 `42%` | `48／48`、約 `58%` | 只 promotion exact 食藥：frozen-v2 completion `766／768→766／768`，both-complete HQ `+7.36pp`（95% `+6.09～+8.62`），每次任務期望分 `+44.02`（95% `+36.47～+51.57`）；0 safety，v1.2.0 |

### 通過與拒絕的結構性改動

1. **木板／錠 joint certificate 通過**：只有在成熟 IQ／品質狀態下，direct quality certificate 不存在，且「一手必成功作業前綴→滿品質 burst→保證作業收尾」完整可證明時才插入 Careful／Prudent／Groundwork。木板 frozen 三裝備合計救回 11 件、錠合計救回 4 件，均無 baseline-only completion、無 safety regression。
2. **腳手架無門檻 CP100 cashout 拒絕**：v1 frozen 三裝備的 HQ point estimate 皆為負且 CI 跨 0，不能用 development 正訊號 promotion。
3. **腳手架 projected-quality gate 通過**：development 的 0.65／0.70／0.75／0.80 門檻比較後凍結 0.75；只路由 exact 食藥 profile。frozen-v2 的 completion 不變、HQ utility CI 全正。滿品質數 `269→230`，但非線性任務效用顯著增加；因此 promotion owner 是 HQ utility，不是 raw average quality 或滿品質 count。
4. **腳手架專家成本隔離**：木板／成品本次 runtime 都 `allowSpecialistActions=false`。2026-08-12 使用者已解除「腳手架不可使用專家技能」的舊研究限制，後續可全面比較；但因天氣窗口將到、本次先交付已完成 frozen 的食藥策略，不以未完成的 specialist arm 取代周回預設。專家面板既有數據只作 stats shadow，沒有使用 Heart and Soul／Careful Observation／Quick Innovation。
5. **釘 threshold guard 停止**：final 食藥 `.75／.70` 讓 observed high `9→12`、27100 `3→6`；完整 development high `37→45`、27100 `24→27`，代價是低尾退步。Guard A 只改善 `2／512` 且未修 absolute min 2794；Guard B 有 10 losses，拒絕。後續改做 failure-aware／condition-aware Byregot reserve，不再搜尋全域 fixed floor。

### 產品化缺口與下一步

1. 三組玩家 exact profiles、recipe objective、specialist gate、versioned corpus、paired evaluator 與共用 exact-profile router 已落地；這些是從 POC 走向多配方支援的第一層 contract。
2. 仍缺自然 condition transition corpus、完整玩家 failure／recovery traces、Recipe 36208 遊戲內 HQ 顯示／結算 oracle，以及任務層材料、件數、分數、倒數與 Duty Action state。assumption IID 結果不可稱實戰成功率。
3. `CrafterProfile.specialist` 尚不能表達已解鎖技能、圖紙庫存／每次消耗或玩家成本偏好；specialist invocation 不是 consumable units。任意裝備 router 仍需 mechanics-derived buckets、in-distribution promotion 與 OOD fallback，不可只擴大 raw stat envelope。
4. 任意高難配方仍需資料化 objective plug-in、patch-aware recipe／condition owner、objective-specific mission utility、frozen promotion gate與 versioned resolved config。不得為了「通用」抹平滿品質硬門檻、收藏價值高尾與 HQ 非線性三種不同效用。
5. reserved-final corpus 仍未使用；在取得玩家實戰 trace、確認 HQ oracle並凍結下一代 failure-aware route 前不得開封。
