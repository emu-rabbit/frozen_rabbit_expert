# 待實證問題與資料收集清單

## 文件角色

這些問題不能只靠公開資料或推理擅自定案。每個答案應附 patch、canonical mission／recipe、player setup、截圖／錄影／trace、來源日期與 confidence；確認後更新 domain／data／spec owner 與 tests，再從本清單標記 resolved。

`last_reviewed: 2026-08-11`

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
- [ ] `Robust -> Sturdy` forced transition 的完整 step record。
- [ ] WR.01 前置 recipe 的 `19600 required for synthesis` 在遊戲中的精確操作與 failure condition。
- [ ] 最終 quality／collectability 如何映射為 980／1080 等 mission score。
- [ ] Cosmic Tool Good `1.75x` 是否適用所有目標 recipe，以及如何辨識玩家是否裝備。
- [ ] specialist／Delineation 在 Cosmic mission 的可用性與玩家可接受成本。
- [ ] no-step actions、buff tick、combo、Manipulation、Final Appraisal、Pliant／durability rounding 的 golden evidence。

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
