# Solver Policy、Objective 與安全規範

## 文件角色

本檔定義主／快速求解器的決策契約。Mechanics correctness 由 domain／verification owners 管理；目前 implementation 看 [current_state.md](../../current_state.md)。

## 共用輸入

兩種求解器都只讀 runtime 可觀測資料：

~~~text
RecipeProfile
CraftObjective
CrafterProfile
CraftState
actual action history
RiskPreference
PlannerContext（若有）
~~~

不能讀 recipe ID、equipment ID、future RNG、evaluation label 或 reserved corpus membership 來選特例。Recipe 差異要來自可解釋的 mechanics、condition set 或 objective signal。

## 共用安全順序

1. 驗證 input 與 state invariants。
2. 產生 legal action mask。
3. 排除會立即違反 terminal／必要品質的 action。
4. 評估完工路線、耐久／CP reserve 與品質機會。
5. 依 Stable／Balanced／Aggressive 比較 outcome。
6. 回傳 action、理由、替代選擇與計算 metadata。

Mechanics 沒有合法技能、state 已終局或輸入損壞時明示原因，不捏造推薦。

## 主要求解器

主要求解器可以使用 fixed-budget stochastic planning、route options 與跨步 `PlannerContext`。目標是在 3 秒內比較較完整的完成、品質與 recovery trade-off。

- 每一步都依玩家實際 history 重新規劃。
- Deadline 是 work contract；不能以無上限 search 期待平均很快。
- 逾時、錯誤或無結果後交給快速求解器，不使用舊 guide。
- Recommendation explanation 來自實際比較訊號，不由 recipe-specific 文案假裝。

## 快速求解器

快速求解器是獨立 bounded policy，共用 authoritative mechanics，但不必複製主要求解器的昂貴規劃。

優先順序：

1. 合法。
2. 避免立即且確定的失敗。
3. 保留可證明的完工路線。
4. 依 risk preference 追求有意義品質。
5. 無法證明完成時提供誠實 best-effort。

### 無建議定義

`Policy-null` 只指：state 合法、尚未終局、至少有一個 legal action，但 solver 沒有回傳 action。

以下不算 policy-null：

- 已完成／失敗 terminal；
- mechanics 證明沒有 legal action；
- 損壞或不完整 input，系統要求 resync。

快速求解器的 contract 是 valid nonterminal state 下 0 policy-null。接近計算上限時，final selector 掃描 legal actions 並依上述順序選一個；不能因昂貴 route search 未完成而回空。

### 延遲

- 固定 work budget。
- 指定目標裝置 p95 小於 100ms。
- 同時報 p50／p99／max 與 final-selector 使用率。
- 不宣稱所有裝置與所有系統負載都有絕對 100ms wall-clock 保證。

## Objective

Mechanics completion rule 和 solver utility 分開。配方品質上限由 recipe `qualityMax` 唯一擁有：

- `requiredQuality > 0`：進展與必要品質都是 mechanics hard gate，solver 仍追求 `qualityMax`。
- `requiredQuality = 0`：進展完成可交貨；solver 不把 protected floor 偽造成遊戲失敗條件。
- 一般收藏品完整保存 100／300／700／滿品質四檔；四檔共同構成所有 risk 都使用的完整品質效用。
- Stable 使用第一檔、Balanced 使用第三檔、Aggressive 使用第四檔作當次 `protectedQualityFloor`。它只是失去安全追品路線時可保住的退路，不是滿足點；到達後仍以滿品質為路線目標。
- 四檔的數值是原始品質點數，由 objective data 宣告；完整四檔不會因 risk 不同而被截短。
- Master 收藏品沒有套用一般四檔，utility 在 `0..qualityMax` 連續增加；其 protected floor 由 continuous-quality risk policy 推導，到達後仍繼續追求 `qualityMax`。
- HQ 類完整使用品質對應的 HQ 機率曲線。Stable／Balanced／Aggressive 分別以 50%／75%／100% HQ 作 protected floor，再由 versioned HQ 曲線反查所需的最小原始品質點；三者仍共用完整 0% 到 100% HQ 機率效用。
- Quality objective 不能改寫 mechanics terminal。

對 progress-only 配方，低品質完成要和四檔／連續品質／HQ 機率結果分開；不能以 completion aggregate 冒充產品成功。`protectedQualityFloor` 是 solver 依完整 milestone 與 risk 當下推導的退路檢查點，單位為原始品質點數；達到後完整品質效用仍繼續上升。HQ 報告要同時顯示 50%／75%／100% 語意檔位及其換算品質。

## Risk preference

- 三者共用同一條單調增加到 `qualityMax`／100% HQ 的品質效用；risk 不降低品質慾望，也不把 protected floor 當成任務完成。
- **Stable**：在持續追求更高品質時，對失去已取得退路、完工路線與災難性失敗給最高下行成本，結果較集中。
- **Balanced**：使用中間的完工保證、失敗分支與 route-destruction 成本。
- **Aggressive**：允許較高、可解釋的下行風險追求品質尾端，因此可形成較多高分與低分／失敗結果，仍遵守 hard-quality 與合法性。

三者的差異由 versioned objective／policy code 擁有。文件不複製暫時 weights；評測要證明行為真的有差異。

架構與策略改善以隨機世界中的成功機率、完整品質價值與可接受成本判斷，允許個別 paired seed 勝負互換。正確性、效果驗收與按需診斷由 [algorithm_verification.md](algorithm_verification.md) 擁有。

## PlannerContext

`PlannerContext` 可以記錄：

- route／option intent；
- 已建立的 setup 與預期 consumer；
- completion reserve／finisher certificate；
- recovery mode；
- 剩餘 work budget。

它不可以修改或偽裝 `CraftState`。玩家偏離、resync 或 forced outcome 後，context 要依實際 state 更新、失效或重建。

## Condition opportunities

高品質、高效、安定、結實、大進展、長持續、高耐久與好兆頭都必須進入候選比較。Condition-specific action 未採用時，理由要來自 legality、resource、objective 或完整路線 trade-off，不是 selector 忘了加入。

Specialized behavior 只有在多個 families 反覆出現相同可觀察 failure，且由 mechanics／objective／condition signal 選擇時，才可升為 generic option。Recipe-ID patch 不進 runtime。

## 策略候選組合

目標架構使用共同 candidate portfolio；目前是否已完成實作以 current state 為準，實施順序與交付里程碑由 [roadmap](../../roadmaps/broad_solver_implementation_plan.md) 擁有：

1. 每個 progress、quality、condition、resource、specialist option 只產生 legal candidate 與理由證據。
2. 共用 scorer 同時比較 completion certificate、完整品質 utility、下行風險、資源與 action budget。
3. 最終只在一處決定 action；null recovery 與 bounded final fallback 另有明確 contract。

Candidate evidence 使用共同型別，至少包含來源、legal preview、成功／失敗分支、完工證明、品質 utility、CP／耐久與預估 continuation。新增 producer 時以 overlap 與 interaction tests 驗證它和既有 producers 的共同命中；升為 runtime policy 前在保留集跨 family／裝備／world 重現效果。

## 玩家自由與 recovery

- 玩家可採主推薦、快速推薦或其他 legal action。
- 每個 resolved step 記錄 actual action／success／next condition。
- 下一步永遠重新嘗試主要求解器，不因曾 fallback 永久降級。
- Manual action 造成的弱 state 仍由 solver best-effort；不能只接受自己產生的路線。
- Mismatch 先 resync，保留 event history。

## 發布 gate

不使用 per-recipe support level。發布前 evidence package 必須覆蓋全部 mechanics families，並逐 family 顯示：

- illegal／terminal／policy-null；
- progress-only delivery 與 meaningful quality；
- 四檔收藏品質量、hard-quality 滿品質與 HQ 機率；
- equipment × risk × assumed world；
- main／fast latency；
- player deviation 與 recovery；
- synthetic、live 與未知 evidence boundary。

任何系統性 family failure 都要先修正或由使用者重新決定產品範圍；不能靠把配方降級後照常發布。最終發布由使用者明確批准。

## 歷史 policy

舊五配方 guides、TypeScript thresholds、named configs、scorecards 與 policy-lab experiments只作 archive／regression evidence。它們不是 runtime fallback、不是新 solver owner，也不構成逐招相容義務。
