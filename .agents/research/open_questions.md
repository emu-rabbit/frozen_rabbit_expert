# 待實證問題與資料收集清單

## 文件角色

這些問題不能只靠公開資料或推理擅自定案。每個答案應附 patch、canonical mission／recipe、player setup、截圖／錄影／trace、來源日期與 confidence；確認後更新 domain／data／spec owner 與 tests，再從本清單標記 resolved。

`last_reviewed: 2026-08-11`

## P0：Phase 0／WR.01 blockers

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
