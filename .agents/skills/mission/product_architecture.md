# 產品架構：Recipe Catalog、Craft Policy、Mission Controller 與 Session

## 概述

產品由廣泛配方 catalog、單件製作決策、跨件任務控制、使用者回報／修正與研究評估五個 surface 組成。底層共用同一 mechanics、generic state-feedback solver 與 versioned data contract；配方差異保留在 data、objective 與必要的 mission adapter，不以手寫獨立 solver 複製共通能力。

## 1. Recipe catalog

Catalog 是使用者可選配方與 solver context 的產品入口。每個 catalog entry 至少綁定：

- canonical recipe／item／mission identity 與 patch-aware source metadata；
- `RecipeProfile` 與 mechanics family；
- reachable／sampled condition set；
- recipe-owned `CraftObjective`；
- support level 與明示 equipment／evidence envelope；
- UI 顯示名稱、圖示與必要的 mission binding。

Catalog 不擁有 solver route。已知 mechanics family 的新配方，預設只新增或組合上述 data；不得要求修改 generic solver control flow、加入 recipe-specific worker switch 或複製一份 policy owner，才能列入 catalog。

第一批 catalog 的產品邊界是目前全部宇宙探索高難配方，而不是少數 onboarding sample。來源邊界必須以 WKS mission membership 與 expert recipe data 交叉驗證；相同 mechanics signature 的多個名稱／職業 recipe 都保留可搜尋 identity，但共用 family-level mechanics 與 evaluation。代表 recipe 只用來降低驗證重複成本，不能用來縮小使用者可選範圍。

若新配方只改 progress、quality、durability、recipe-level modifiers、condition availability 或 objective target，這些都應由 data 注入。只有出現現有 domain 無法表達的新 action effect、condition transition、terminal semantics 或任務資源，才改 mechanics／protocol owner。

## 2. Generic craft policy

Craft policy 處理一件 craft 內的下一步推薦：

```text
CraftState + RecipeProfile + CraftObjective + CrafterProfile + RiskPreference
  -> legal action mask
  -> mechanics preview and tactical dominance checks
  -> phase / recipe signals / optional guide priors
  -> route option / candidate set
  -> finisher feasibility and recovery reserve
  -> fixed-budget stochastic planner and/or policy-value model
  -> recommendation + alternatives + reasons + confidence
```

它只根據目前 state 與獨立的 `PlannerContext` 推論，不 materialize 完整 future tree。允許在本機以固定預算執行 full-episode rollout、option-level MPC 或後續 search；每次玩家回報 action outcome 後重新執行。route intent 屬 planning control，不可混入 mechanics `CraftState`。

共用求解器不是單一平均化 action score，而是三層可組合策略：

1. **Core route policy**：所有配方共用 legality、terminal semantics、資源帳、phase／route memory、progress finisher、recovery 與避免過早完成的 invariants；回答「整場是否還有能活著走完的路」。
2. **Objective options**：依 hard required quality、collectability／score、HQ utility、maximize quality 與 stable／balanced／aggressive，提出不同 progress commitment、quality floor、burst／cashout 與可接受 variance；回答「這場值得用什麼方式贏」。
3. **Condition interrupts**：Good、Malleable、Pliant、Primed、Centered、Sturdy／Robust、Good Omen 各自提出能利用當步機會的少量 actions；只有在不違反 core route invariant，或 risk/objective 明示接受代價時，才中斷／改寫 active option。

最後 resolver 比較完整後綴的完成、品質尾端、資源與失敗分布，回傳 action、替代方案與原因。同一球色可同時觸發多個互相競爭的 interrupts；不能以固定 `condition -> action` 表，也不能讓每個 recipe 複製一套核心策略。

通用的是 decision process，不是固定 rotation：

- 同一 engine 必須直接讀取實際 craftsmanship、control、CP、tool／specialist capability 與離散 mechanics gain；
- recipe objective、可用 condition、硬完成門檻、收藏價值／HQ utility 仍各自 versioned；
- condition 專屬技能必須進入有意義候選比較。若 Good 時沒有選 Precise Touch／Intensive Synthesis 等機會技能，recommendation 必須能以 route、reserve 或 objective 說明，而不是因規則沒有列到；
- stable／balanced／aggressive 改變 outcome utility 與可接受風險，不建立三套互不相容的 solver；
- 低裝備採 best-effort 與明示 capability boundary，不以 exact-profile 長期調參或假裝高分穩定來維持 coverage。

## 3. Mission controller

Mission controller 管理單件 craft 以外的 objective：

- supplies remaining；
- crafts completed；
- accumulated score；
- mission failure state；
- mission deadline；
- Material Miracle／Stellar Steady Hand 使用與剩餘時間；
- 下一件 craft 應採取的 risk target。

`MissionState` 與 `CraftState` 必須分離。大部分 crafting actions 只改 Craft state；完成一件、消耗 supply 或使用 Duty Action 才改 Mission state。沒有 mission adapter 的 recipe 仍可先支援單件 craft，不因跨件任務資料未齊而阻塞 catalog／generic solver。

## 4. Session interaction

Session surface 負責：

- 呈現本步使用 condition、建議 action 與玩家實際 action；
- 只在 action 可能失敗時要求 success／failure；
- 接收結算後的下一 condition；
- 顯示預測 state；
- undo／edit／resync；
- 保存 event path 與 model versions；
- 匯出可匿名化的 debug／golden trace。

玩家偏離推薦不是錯誤；系統應以實際 action 更新 state。若預測與遊戲不符，建立 `stateResynced` event，不能無聲覆寫歷史。常見的「照建議按下去」路徑應讓玩家主要只需回報成敗與下一球色，但完整 event contract 仍需能處理偏離與校正。

## 5. Support levels

支援層級描述產品能力與證據，不是行銷名稱：

| Level | 定義 | 可提供的產品能力 |
| --- | --- | --- |
| `catalogued` | 已有 canonical identity、來源與足以顯示的基本 data，但 mechanics／objective 尚未完整綁定 | 可搜尋、可查看缺口；不提供 recommendation |
| `mechanics-ready` | 現有 mechanics family 能合法 replay／preview，此 recipe 的 condition set 與 objective 已綁定 | 可模擬與檢查 state；此欄只描述 data／mechanics 成熟度，不等同 recommendation maturity |
| `development-preview` | mechanics-ready recipe 已接 generic recommendation，但尚未通過 experimental gate | 可讓玩家明示試用、回報 trace，並在 policy-null 時顯示無路線與手動恢復入口；不得稱為可靠支援 |
| `experimental` | generic solver 已通過 legality、terminal safety、明顯 tactical-error、bounded equipment／condition smoke 與 fallback gate | 可在明示 experimental／OOD 邊界下提供 recommendation，不宣稱實戰成功率 |
| `supported` | 在代表性可行裝備範圍、多組 plausible worlds 與壓力序列達到 recipe 有意義的完成／品質 floor，且 runtime UX 達標 | 可作一般建議，顯示支援 envelope 與殘留未知 |
| `validated` | 另有隔離 evaluation、足夠 live／held-out／frozen evidence 支持更強 claim，並可重現與 rollback | 可使用明確限定範圍的量化 claim；仍不宣稱全域最佳或保證成功 |

Catalog／mechanics maturity 與 recommendation maturity 是兩個軸：同一 recipe 可以是 `mechanics-ready`，而 recommendation 仍只是 `development-preview`。Support level 可以隨 mechanics drift、新 evidence 或 regression 升降。`experimental` 不需要先完成真正 unseen loadout population、reserved-final 或每個配方的玩家 trace；`validated` 才承擔較重的 claim evidence。UI、catalog 與 debug export 必須保存該次 recommendation 的 level、model versions 與 envelope。

## 6. Research and evaluation

研究 surface 與實戰 runtime 分開：

- deterministic replay 與 mechanics mismatch diagnosis；
- fixed-budget policy rollout；
- common-random-number candidate comparison；
- condition profile sensitivity；
- held-out／adversarial benchmark；
- disagreement、recovery、mistake 與 OOD state corpus；
- policy artifact promotion／rollback。

大型分析、distribution materialization 與訓練不得阻塞玩家的下一步推薦，也不得自動成為 catalog onboarding 的 gate。驗證成本必須和 support level／對外 claim 相稱：experimental 先抓 illegal、terminal、明顯策略錯誤與大幅 outcome regression；supported／validated 才增加完整 population、sealed corpus 與統計證據。

研究工作必須先說明它會解除哪個可觀察的產品 blocker。若只改善證據封裝、artifact identity、native parity 或單一舊配方的微小 threshold，而不能擴大 catalog、改善 generic decision quality、修復 live failure 或降低使用成本，預設不得排在產品主線前面。

## 7. 五配方 POC 的歷史邊界

宇宙鈦鐵錠、宇宙鈦鐵釘、宇宙探索用的硬化木板、高空作業用的腳手架與宇宙探索用的巨匠藥已完成各自的 live POC 任務。它們證明了手動球色回報、完整 state replay、recipe-specific objective、guide／certificate／bounded-risk policy、worker fallback 與跨配方 UI 可以運作。

從目前階段起：

- 舊五配方 policy 不再是 generic solver 必須逐手相容的 runtime 義務；
- 舊 route、guide、player trace 與 promotion corpus 只作歷史、teacher 或 regression evidence；runtime fallback 必須由 generic contract 提供，不依賴保留舊逐配方 policy；
- 除非 live mechanics bug、使用者可見策略錯誤或 generic solver 的跨配方共通缺陷能由它們重現，不再把逐配方 threshold／exact-profile 微調列為主線；
- 新 engine 可以在 objective／risk trade-off 上做出不同但更有證據的選擇，不因未重現舊 policy action sequence 而被拒絕。

## 8. 產品文案與信心邊界

- 使用「推薦」、「依目前模型」、「估計」、「目前仍保有完成路線」。
- 只有被 deterministic mechanics／finisher proof 支持的內容才能稱 guaranteed；其他一律稱 estimate／high-confidence。
- confidence 必須至少拆為 mechanics version、condition profile confidence、policy coverage 與 support level。
- alternatives 描述完成率、品質／分數門檻、資源、步數或 variance 的 trade-off，不列無意義的 raw score 排名。
- 低裝備的 best-effort 與高裝備的 high-tail potential 必須分開呈現，不用一個模糊 overall rate 掩蓋能力差異。

## 9. 目前產品演進順序

1. 建立廣泛、patch-aware 的高難度 recipe catalog 與 mechanics-family binding。
2. 證明已知 family 的新 recipe 可 data-only 進入 mechanics-ready，不再新增 solver branch。
3. 建立讀取 recipe／objective／實際裝備／risk preference 的 generic state-feedback solver，先以 `development-preview` 接到 mechanics-ready catalog 收集失敗 family 與 trace。
4. 逐 family 通過 legality、terminal、tactical、closed-loop 與 fallback gate 後，才把 recommendation maturity 升為 `experimental`。
5. 依實際使用、失敗 family 與產品價值選擇代表性 recipes 提升為 supported／validated；不要求所有 recipes 同時畢業。
6. 再以同一 craft-policy contract 擴充跨件、倒數與 Duty Action mission controller。

詳細交付與 gate 由 `.agents/roadmaps/broad_solver_implementation_plan.md` 管理。舊 `.agents/roadmaps/poc_implementation_plan.md` 只保存已完成 POC 的歷史進度，不再是目前工作順序。
