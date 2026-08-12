# 待實證問題與資料收集清單

## 文件角色

這些問題不能只靠公開資料或推理擅自定案。每個答案應附 patch、canonical mission／recipe、player setup、截圖／錄影／trace、來源日期與 confidence；確認後更新 domain／data／spec owner 與 tests，再從本清單標記 resolved。

`last_reviewed: 2026-08-12`

## P0：Phase 0／WR.01 blockers

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

## P1：WR.02 Material Miracle blockers

- [ ] Duty Action activation 是否增加 crafting step、tick buffs、影響 combo。
- [ ] Material Miracle 啟動瞬間是否立即重抽目前 condition，或從下一 step 生效。
- [ ] Material Miracle 是否跨 craft 持續；進出 crafting window 時倒數是否照常流逝。
- [ ] 45 秒以 client／server 哪個時間點為準；animation／network latency 是否影響可用步數。
- [ ] 啟動期間實際 condition distribution、sample size 與是否依 recipe／job 改變。
- [ ] mission 9 分鐘倒數的起點、暫停／取消／失敗／重開行為。
- [ ] supplies、Duty Action uses 與 accumulated score 在取消／失敗／重開後的精確變化。
- [ ] 真實玩家 game↔tool 切換、condition input 與 next recommendation 的時間。

## P2：TR.01 blockers

- [ ] 「一次都不能失敗」是 craft terminal failure，還是任何 action failure。
- [ ] Stellar Steady Hand 的三步是否被 Observe、no-step specialist action、Duty Action 或 failed action 消耗。
- [ ] Stellar Steady Hand 與 Centered 的 success rate 疊加／clamp。
- [ ] Duty Action uses 是否固定適合一件一次，或可跨件不對稱分配。
- [ ] 第一件 score／remaining resource 如何影響第二件 Gold target。

## 首批請玩家提供的資料

1. WR.01 主件 mission／recipe 畫面與 Potential Conditions List。
2. 實際 craftsmanship、control、CP、specialist、food、medicine、tool。
3. 一場成功 WR.01 的完整逐步錄影或 event log。
4. 一場 failure／recovery／偏離建議的完整紀錄。
5. Rapid／Hasty 在 Centered 與非 Centered 下的前後數值樣本。
6. Robust 出現與下一步 Sturdy 的紀錄。
7. Primed 對 Manipulation、Innovation、Veneration 等 duration 的紀錄。
8. WR.02 Material Miracle activation／expiry 前後錄影與 timestamp。
9. TR.01 Stellar Steady Hand 搭配 RNG actions 的紀錄。

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
