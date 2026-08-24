# 待實證問題與資料收集清單

## 文件角色

這些問題不能只靠公開資料或推理擅自定案。每個答案應附 patch、canonical mission／recipe、player setup、截圖／錄影／trace、來源日期與 confidence；確認後更新 domain／data／spec owner 與 tests，再從本清單標記 resolved。現行 generic 主線先處理跨 family 重複出現的 evidence gaps；下方 WR／TR 與舊五配方的 P0／P1 標籤是 POC 時期優先級，只在對應 regression 或 mission controller 工作時使用。

`last_reviewed: 2026-08-24`

## 現行 generic 主線的 P0 evidence gaps

- [ ] 以 50 個 mechanics families 為單位建立多裝備帶、stable／balanced／aggressive、合理 condition worlds 與壓力序列的 closed-loop 結果；分開回報 mechanics completion、有意義品質門檻、high tail、terminal failure 與 policy-null，不以單 seed assumed world 冒充實戰率。
- [ ] 找出多個 family 重複發生的 route／option／recovery failures，先修共用策略結構；不得為舊五配方繼續堆 recipe-specific rule。
- [ ] 收集自然玩家 trace，優先涵蓋實際裝備、球色轉移、失敗技能、偏離建議與 recovery；少量 trace 用於 mechanics／策略錯誤定位，不反推虛假精準 condition probability。
- [ ] 逐 mission family 補齊精確收藏價值／HQ／任務分數效用。未知區間保留 provisional objective，不得把品質上限或線性 proxy 改稱已驗證滿分門檻。
- [ ] 跨多件任務另建 Mission controller evidence；432 個單件 catalog／development-preview 不代表跨件材料、分數、時間與 Duty Action 已支援。

## 歷史 P0：Phase 0／WR.01 blockers

- [x] TW 7.51 宇宙鈦鐵錠在加工精度 5140、通常、內靜 3＋改革時，上級加工的品質取整。
  - resolvedAt: 2026-08-11
  - patch / mission / recipe: TW 7.51／Recipe 36282／Item 48360
  - evidence: 玩家截圖 `1786427113729.jpg`、`1786427155682.jpg`、`1786427178106.jpg`
  - conclusion: 遊戲內預測與實際皆為 935；Teamcraft simulator revision `74e167a` 為 936。runtime 僅對此 exact observed state 套用 empirical correction。
  - confidence: verified for this recipe, stats, condition, action and buff state only
  - updated owners/tests: `packages/domain/src/qualityCorrections.ts`、`packages/domain/tests/transition.test.ts`、mechanics `v0.2.1-tw751-empirical`
- [ ] 上述上級加工差 1 的取整行為，是否適用其他加工精度、內靜階數、condition、buff 組合、配方或非 TW client。
  - 2026-08-11 additional evidence: 玩家截圖 `codex-clipboard-41a62132-a5a5-4437-9319-7a6dbae9e328.png` 的另一配方，在同為加工精度 5140、通常、內靜 3＋改革時，從各技能預測反推出 efficiency-100 base quality 為 407；加工／中級加工／上級加工／坯料加工分別為 793／992／1190／1587，皆符合既有公式。這排除「所有上級加工固定減 1」。
  - 2026-08-11 A／B evidence: 玩家截圖 `codex-clipboard-d5dbf9c9-e109-4bc4-88e4-6f076c9c2924.png` 與 `codex-clipboard-8a856bda-bdca-40a0-b0c8-0dd44cd81588.png`。宇宙鈦鐵錠在加工精度 5140、高效、無改革時，IQ2 的加工／中級加工／上級加工／坯料加工為 384／480／576／768，IQ3 為 416／520／624／832，皆符合既有公式。
  - 2026-08-11 opportunistic evidence: 玩家截圖 `codex-clipboard-8e6a13a9-723f-4627-894d-3fed9aed09be.png`。宇宙工具、高品質、IQ3＋改革時，加工／中級加工／上級加工／精密加工／坯料加工為 1092／1365／1638／1638／2184，皆符合既有公式；同 potency 的上級加工與精密加工一致。
  - 既有 IQ4＋改革截圖為 672／840／1008／1344；綜合上述結果，已排除「進階加工固定減 1」、action-specific 差異與將所有品質效率一律改成 `float32(efficiency / 100)` 的簡單替代。下一輪需改以能區分中間浮點／取整順序的配方基礎品質邊界與更多 control 值測試。

- [ ] WR.01 主件 canonical mission ID、recipe ID、job variants 與 Potential Conditions List。
- [ ] WR.01 主件 progress、quality、durability 與 score table 的遊戲內確認。
- [ ] WR.01 各自然 condition 的實際 probability；未知期間使用哪些 plausible profiles 做 sensitivity evaluation。
  - 玩家預計進遊戲後連續使用一般 `Observe` 收集資料。每筆至少保存 `recipeId`、patch、specialist／Material Miracle 狀態、step、previousCondition、action、nextCondition；保留完整順序，不只彙總各顏色總數，才能估計「前一球 → 下一球」而非錯誤假設每步互相獨立。
  - `Careful Observation`、forced transition、Duty Action 或其他切球技能必須另外標記，不可混入自然 Observe transition。記錄中斷、CP 耗盡與只在特定狀態取樣造成的 bias。
  - 錠與釘先分開保存；即使 sampled condition set 與 RecipeLevelTable 相同，也要有 evidence 才能共用 transition profile。
  - 2026-08-12 first user Observe trace：單一 craft 連續 95 conditions／94 transitions；通常 36、高品質 14、安定 13、結實 13、高效 10、大進展 9。暫以 i.i.d. empirical marginal 作主假設：37.895%／14.737%／13.684%／13.684%／10.526%／9.474%。
  - previous-condition dependence 暫無足夠支持：固定 marginal permutation 100,000 次得到 observed adjacent mutual information 的 empirical `p=0.17873`；add-1 leave-one-transition-out predictive NLL 亦由 i.i.d. `161.068` 優於 row-specific `163.526`。這只表示目前不值得增加複雜度，不是證明遊戲一定 i.i.d.。
  - 相同 guide-integrated v1.0.0／5408／5237／749／宇宙工具 ON 的暫存 sensitivity：i.i.d. profile 為 42／72、211／384；raw row transitions 為 47／72、234／384，兩種 smoothing 的 384 結果為 245 與 207。小樣本補法會明顯改變成績，故此 profile 尚不進正式 runtime／promotion，繼續以 craft boundary 分批收集。
- [ ] `Robust -> Sturdy` forced transition 的完整 step record。
- [ ] WR.01 前置 recipe 的 `19600 required for synthesis` 在遊戲中的精確操作與 failure condition。
- [ ] 最終 quality／collectability 如何精確映射為 980／1080 等 mission score。
  - 2026-08-12 玩家遊戲內畫面已鎖定：錠完成固定 80；釘 1644–1917→100、1918–2465→300、2466–2710→700–1000；Silver 980、Gold 1080。一錠一釘因此需要釘 900／1000。仍未知 700–1000 區間內的精確換算與 rounding，不得假設線性或把 2466 稱為 Silver／1000 分。
- [ ] 宇宙鈦鐵釘（Recipe 36283／Item 48361）的遊戲內配方畫面、`requiredQuality=0` 實證與精確 score mapping。
  - 2026-08-12 XIVAPI current game data 已驗證 RecipeLevelTable 746、progress 10000、durability 55、quality max 27400、RequiredQuality 0 與 collectable tiers；domain regression 已依此把品質未滿的作業完成判為 completed，而非宇宙鈦鐵錠式 synthesis failure。仍需遊戲內畫面／trace 獨立確認 datamined semantics。
  - 2026-08-12 anonymous player export：5408／5237／749／宇宙工具 ON，保存 35 手至 progress 9571／quality 14242／durability 5／CP 22，尚差最後一手作業，因此不是完整 completed trace。球色為 Normal 15、Good 5、Centered 4、Sturdy 4、Pliant 3、Malleable 4；Rapid 3／6、Hasty 2／3，沒有支持「異常倒楣」。此 export 沒有逐步遊戲畫面 observed values，只能作 replay／policy evidence，不能升為 mechanics golden oracle。
  - 2026-08-12 second anonymous player export：同為 5408／5237／749／宇宙工具 ON，39 手以 progress 10000／quality 17224／durability 0／CP 12 完成。球色為 Normal 17、Good 4、Centered 5、Sturdy 6、Pliant 5、Malleable 2；Rapid 3／7、Hasty 1／2，仍沒有支持異常倒楣。末段在 IQ0、progress 9541 時先用 Good 技巧回收 20 CP，再以 Sturdy 改革後才收尾，成為低資源不可再花 CP 與推薦理由 regression；同樣缺逐步遊戲畫面，只能作 replay／policy evidence。
  - 玩家 UI 已驗證任務分數表，並修正 policy target：配方 mechanics 品質上限 27400，但任務 1000 分上端是收藏價值 2710，因此 objective target 為 27100。700–1000 分區間內的精確換算仍需至少兩個「最終收藏價值＋實得點數」結算畫面驗證。
- [ ] Cosmic Tool Good `1.75x` 是否適用所有目標 recipe，以及如何辨識玩家是否裝備。
- [x] specialist／Delineation 在目前 Cosmic mission 的可用性與玩家可接受成本。
  - 2026-08-12 玩家採用專家證後的最終面板為 5428／5257／764；已確認願意消耗能工巧匠圖紙使用設計變動、專心致志與快速改革。數值已含專家證 +20／+20／+15，不得重複加成。
- [ ] 新藥水 profile 的 canonical item／HQ 狀態、持續時間與其他屬性效果。
  - 2026-08-11 user evidence: 玩家確認目前可把同一套裝備的 CP 上限由 722 提高 27 至 749；policy-lab 已把 722 歷史 profile 與 749 medicine profile 分開評估，不回寫 37 步舊 trace。
  - exact medicine identity 尚未記錄，因此目前只把 `maxCp=749` 視為玩家提供的 profile input，不推定其他 stat bonus。
- [ ] no-step actions、buff tick、combo、Manipulation、Final Appraisal、Pliant／durability rounding 的 golden evidence。
  - 2026-08-11 partial golden evidence: 玩家成功影片 `錄製內容 2026-08-11 193225.mp4`，Recipe 36282、5408／5237／722、宇宙工具 ON。37 步可見 progress／quality／durability／CP 全步與 mechanics replay 一致，涵蓋 Manipulation、Waste Not II、Pliant CP 半價、Centered RNG、Hasty failure、Daring Touch、最後一回合 Innovation refresh、連續兩次 Observe 與 durability 邊界完成；buff icon／Inner Quiet 因畫面裁切仍是 replay-derived，不能把此單一成功 trace 擴大成所有 timing 已驗證。

## 歷史 P1：製作工匠所需的複方藥 Recipe 36582 blockers

- [ ] 宇宙探索用的巨匠藥收藏價值 1020–1200 在 700–1000 分區間內的精確換算與 rounding。
  - 目前只確認 Recipe 36582／Item 48570、作業 10000、耐久 55、品質上限 12000、`requiredQuality=0`，以及 600–719→100、720–1019→300、1020–1200→700–1000 的區間。
  - 品質 10800／收藏價值 1080 是把頂段假設為線性後得到的 provisional 800 分 proxy，不是已驗證門檻。至少需要一張頂段區間說明，或兩個以上「最終收藏價值＋實得點數」結算畫面確認公式與 rounding。
- [ ] Recipe 36582 的 Normal／Good／Malleable 自然 transition matrix，以及是否依專家狀態或任務階段改變。
  - 現有 balanced、Normal-heavy、Good-scarce／Malleable-stress profiles 只作 assumed sensitivity；不得把 evaluator rate 當玩家自然球色分布。
  - 2026-08-12 assumed development：食藥非專家 primary `384／384`、adversarial stress `64／64` 完成且滿品質；食藥＋專家 stats aggregate 完全相同，三種 specialist actions 使用 0 次。無 buff primary 完成 `384／384`、滿品質 `145／384`。2026-08-13 condition-responsive candidate 首次 frozen exact 食藥非專家為 primary `768／768`、stress `128／128` 完成且滿品質，paired 手數 `78` 較短／`0` 較長／`690` 相同；該 checkpoint 當時尚未執行 reserved。2026-08-23 已開封的 final 與 120 組 synthetic screening 仍不得外推真實球色、真實裝備人口或玩家成功率。
  - 玩家紀錄需保留完整 previousCondition→nextCondition 順序、step、action 與是否為 no-step reroll；只給三色總數不足以判斷轉移。
  - 2026-08-13 已收到四筆匿名 web exports（exact 食藥非專家 `5408／5237／749`、宇宙工具 ON），保存完整 action／success／condition path。三筆 clean sessions 都以近乎相同序列在 25 手滿品質完成；一筆含 8 次高速製作失敗，export 於 37 手仍在 recovery。樣本可作 replay／macro candidate regression，但沒有逐步 observed state、任務得分，且四筆不足以估 transition matrix。
- [ ] 一場滿品質、一場安全 contingency，以及 Malleable 即將提前完成時的完整逐步 trace。
  - 需包含面板、專家證、宇宙工具、每步實際 action／成敗／球色、最終收藏價值與任務得分，才能驗證 quality-first route、10800 guardrail 是否合理，以及 specialist gate 的實際成本效益。
  - 複方藥三件的 recipe identity 都已進全量 catalog 並可作單件 development-preview；若要處理三件合計 2800／3000 分，仍需取得各件精確分數、材料、時間與 mission-state evidence，不能把單件 generic recommendation 擴寫成已完成 mission controller。
  - exact 食藥非專家 25 手 common route 在全 Normal replay 只到作業 9762／滿品質 12000；尾端加 100% 製作後的 26 手候選可在全 Normal 與上述四筆 observed condition streams 滿品質完成。仍需玩家實際跑這份巨集並回傳最終收藏價值／任務分數，才能把 mechanics candidate 提升為遊戲內完整成功 evidence。
  - `v1.2.0` 已在四筆 observed condition streams 對固定路線產生不同且局部支配的 Good／Malleable 決策，未增加任一場手數；仍需玩家用網站實跑並確認推薦體感、最終收藏價值／分數與 event export，因 assumed IID frozen 不能取代遊戲內自然 transition。

## 歷史 P1：高空作業用的腳手架 blockers

- [ ] Recipe 36205／Item 48263 的繁中遊戲內正式物品名是否確為「宇宙探索用的硬化木板」，以及 14900 必要品質、20 耐久與可用 condition list 的配方畫面。
- [ ] Recipe 36208／Item 48311 的品質 0–22500 如何精確映射 HQ 機率。
  - 2026-08-12 provisional cross-check：目前 evaluator 依 Patch 7.4 Lodestone 玩家研究，品質低於 50% 時用 1%→15% 線性式、50% 以上查非線性表，並與 Teamcraft table cross-check；NQ 200／HQ 800 暫算 expected points。這是 community reference，不是本任務遊戲內 oracle 或真實 HQ rate。
  - 仍需至少數個遊戲內最終品質、完成前顯示 HQ 百分比與實際 NQ／HQ 結算樣本；若表格與 current patch 不一致，更新 utility owner／tests，不為了保留既有 benchmark 改 observed value。
- [ ] 腳手架任務 Normal／Good／Good Omen／Sturdy／Pliant／Malleable／Primed 的自然 transition matrix；Good Omen 強制下一 Good 與 Primed +2 steps 仍需本任務逐步畫面獨立確認。
- [ ] 三組玩家 exact profiles 之外的低裝等／高裝等、食物／藥水與宇宙工具 ON／OFF frozen corpus。
  - 目前 versioned development matrix 已固定 `5408／5140／630` 無 buff、`5408／5237／749` 食物＋藥水、`5428／5257／764` 食藥＋專家，皆宇宙工具 ON；三組都已參與 adaptive cashout／risk／progress-floor 調整，不得當 held-out 或任意裝備泛化證據。
  - `elevating-platforms-frozen-validation-768-v1` 已用於否決無品質門檻 CP100 cashout並驗證木板 joint certificate；互斥 v2 已一次驗證 exact 食藥 75% projected-quality gate。兩者都已查看，只能作 regression evidence。reserved-final 尚未執行。
- [ ] 專家技能每次實際消耗的能工巧匠圖紙數、玩家庫存與可接受的每場成本。
  - 現在 evaluator 只計 `carefulObservation`／`heartAndSoul`／`quickInnovation` invocation；invocation 不是已驗證圖紙單位。專家面板不自動授權消耗，只有明示 candidate gate 才能測。
- [ ] 舊木板 `policy-null`／低 completion failure family 與新 versioned corpus 的實戰可達性及 recovery trace；不得只用增加 risk cap、固定 progress floor 或 seeds 掩蓋路線缺口。
- [ ] 一場木板滿品質 trace，以及成品低品質 NQ、高品質 NQ／HQ 的完整逐步 trace 與任務結算圖。

## 歷史 P1：WR.02 Material Miracle blockers

- [ ] Duty Action activation 是否增加 crafting step、tick buffs、影響 combo。
- [ ] Material Miracle 啟動瞬間是否立即重抽目前 condition，或從下一 step 生效。
- [ ] Material Miracle 是否跨 craft 持續；進出 crafting window 時倒數是否照常流逝。
- [ ] 45 秒以 client／server 哪個時間點為準；animation／network latency 是否影響可用步數。
- [ ] 啟動期間實際 condition distribution、sample size 與是否依 recipe／job 改變。
- [ ] mission 9 分鐘倒數的起點、暫停／取消／失敗／重開行為。
- [ ] supplies、Duty Action uses 與 accumulated score 在取消／失敗／重開後的精確變化。
- [ ] 真實玩家 game↔tool 切換、condition input 與 next recommendation 的時間。

## 歷史 P2：TR.01 blockers

- [ ] 「一次都不能失敗」是 craft terminal failure，還是任何 action failure。
- [ ] Stellar Steady Hand 的三步是否被 Observe、no-step specialist action、Duty Action 或 failed action 消耗。
- [ ] Stellar Steady Hand 與 Centered 的 success rate 疊加／clamp。
- [ ] Duty Action uses 是否固定適合一件一次，或可跨件不對稱分配。
- [ ] 第一件 score／remaining resource 如何影響第二件 Gold target。

## 首批請玩家提供的資料

1. 巨匠藥頂段分數區間／結算畫面，以及一場滿品質、一場 contingency、一次 Malleable 提前完成邊界的完整逐步紀錄。
2. 腳手架木板／成品配方畫面、Potential Conditions List、最終品質與 NQ／HQ 結算。
3. 實際 craftsmanship、control、CP、specialist、food、medicine、tool。
4. 一場木板滿品質與一場腳手架完成的完整逐步錄影或 event log。
5. 一場 failure／recovery／偏離建議的完整紀錄。
6. Good Omen 前後與 Primed 套用 Manipulation／Innovation／Veneration 的逐步紀錄。
7. WR.02 Material Miracle activation／expiry 前後錄影與 timestamp。
8. TR.01 Stellar Steady Hand 搭配 RNG actions 的紀錄。

若不方便逐步手記，以螢幕錄影收集，再依 `.agents/workflows/validate-golden-traces.md` 轉錄。轉錄者不可填補看不到的數字；使用 `unknown`／omitted field 並保存原影片 timestamp。

## 問題結案格式

```md
- [x] 問題描述
  - resolvedAt: YYYY-MM-DD
  - patch / mission / recipe:
  - evidence: path or URL
  - conclusion:
  - confidence:
  - updated owners/tests:
```

如果 evidence 只支持特定 recipe／stats／patch，不把結論擴大成全域規則。
