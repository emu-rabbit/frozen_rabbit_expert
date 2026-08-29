# v1.11 completion-aware bounded review

`reviewed_at: 2026-08-29`

## 結論

目前的描述性候選 `generic-craft-route-portfolio-exp-completion-aware` 已足以作為 v1.11 經驗的穩固延伸，進入使用者啟動的完整 same-tape 確認。它保留一般收藏品的九球色機會提案，並以通用 state evidence 守住已存在的完工路線；沒有 family、equipment、seed 或 future RNG selector。

Bounded evidence 已同時證明兩件事：

- v1.11 的奇怪未交貨不是高裝備能力不足，而是品質路線曾放棄已可證明的完工能力；completion-aware 候選已在 exact tapes 全部修正。
- 讀取球色機會對一般收藏品有玩家可感知的檔位價值。在未見修改的新 seed 小矩陣中，候選相對球色機會消融的完成率不變，完成成品檔位淨上升 **5.38 percentage points**。

這仍是 bounded gate，不是新數字版號或公開採用結論。完整矩陣要確認收益能跨正式支援裝備與主要 worlds 重現，也要確認滿品質尾端；目前小矩陣中一般收藏品的滿品質為候選少 2 件，因此不把讀球的滿品質收益寫成已證明。

## 候選行為

- Stable 與 hard-quality 使用 v1.1 的既有安全基準。
- HQ 與 Master 使用 v1.1。HQ 的小批 exact replay 出現不穩定滿品質尾端，Master 的完整 overnight 尾端沒有正回報；兩者先保留可靠基準。
- Balanced 一般收藏品使用 v1.11 的九球色機會提案與 funded routes。已找到符合剩餘 action budget 的 deterministic finish 時，只保留成功與失敗分支都仍有 bounded 完工能力的提案，並把該 finish suffix 放回候選集。
- 已滿品質且仍未完工時，直接讓有資金的完工 suffix 參與決選。
- Aggressive 保留 v1.11 的風險空間；Balanced 的完工保護不限制 Aggressive 願意承擔的額外失敗。
- 球色機會消融 `generic-craft-route-portfolio-exp-condition-opportunity-ablation` 與候選共用 mechanics、完成保護與 established continuation，只關閉 condition-specific proposal／coordination。它量測的是額外球色機會決策的邊際價值，不代表完全忽略 condition mechanics 的一般求解器。

## Exact-tape 完工驗證

| 案例 | 參考行為 | Completion-aware | 淨結果 |
| --- | ---: | ---: | --- |
| F25／E09／Balanced／`all-normal`，64 seeds | 完成 58、滿品質 55 | 完成 64、滿品質 61 | +6 完成、+6 滿品質 |
| F26／E09／Balanced／`all-normal`，64 seeds | 完成 58、滿品質 54 | 完成 64、滿品質 60 | +6 完成、+6 滿品質 |
| F27／E09／Balanced／`all-normal`，64 seeds | 完成 59、滿品質 49 | 完成 64、滿品質 54 | +5 完成、+5 滿品質 |
| F44／E09／Balanced／`normal-heavy`，2 seeds | v1.1 完成 2；未加 finish witness 保護時完成 0 | 完成 2，品質檔 1／2 與 2／2 | 守住完成並保留較高品質 |
| F50／E01／Balanced／`balanced-iid`／seed 53 | action-limit 80 | 42 步完成 | 移除合法非終局空轉 |

五組 replay 都是同一 RNG tape；最終候選沒有 completion loss、illegal、policy-null 或 action-limit。F25／F26／F27 的 17 個 v1.11 損失全部救回，且新增的完成結果同時為滿品質。

## 未見 seed 的主戰小矩陣

範圍：E02／E09 × Balanced × `balanced-iid`／`normal-heavy`／`opportunity-scarce` × 50 families × base seed 20260830；每個 arm 300 episodes。

### 相對 v1.11

| Objective | n | 完成 v1.11→候選 | 檔位上升／下降 | 檔位淨變動 | 滿品質 v1.11→候選 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 一般收藏品 | 186 | 186→186 | 1／5 | −2.15 pp | 113→112（−0.54 pp） |
| Hard-quality | 84 | 32→32 | 0／0 | 0.00 pp | 32→32 |
| HQ | 12 | 12→12 | 2／1 | +8.33 pp | 4→5 |
| Master | 18 | 18→18 | 1／1 | 0.00 pp | 3→3 |
| 全部 | 300 | 248→248 | — | — | 152→152 |

完整 v1.11 正式支援 Balanced 證據的一般收藏品優勢為檔位 +20.25 pp、滿品質 +8.16 pp。這個新 seed 小矩陣相對 v1.11 的損失量分別相當於 10.6% 與 6.6%，因此跨 corpus 的保留率 proxy 約為 **89.4%** 與 **93.4%**，高於 80% 門檻。這是 bounded proxy；最終保留率仍由完整 same-tape v1.1／候選比較計算。

### 相對球色機會消融

| Objective | n | 完成消融→候選 | 檔位上升／下降 | 檔位淨變動 | 滿品質消融→候選 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 一般收藏品 | 186 | 186→186 | 21／11 | **+5.38 pp** | 114→112（−1.08 pp） |
| Hard-quality | 84 | 32→32 | 0／0 | 0.00 pp | 32→32 |
| HQ | 12 | 12→12 | 0／0 | 0.00 pp | 5→5 |
| Master | 18 | 18→18 | 0／0 | 0.00 pp | 3→3 |
| 全部 | 300 | 248→248 | — | — | 154→152 |

一般收藏品已達成 active brief 的 5 pp 檔位 practical-effect gate，且沒有完成代價。這支持保留 condition-specific proposals 繼續開發。滿品質尾端尚未由這個小矩陣支持，完整確認必須把檔位與滿品質分開判讀。

## 成本與安全

- 兩個 300-case 比較均為 0 illegal、0 policy-null、0 action-limit。
- 候選相對 v1.11 小矩陣的 recommendation p95 為 28.1ms、max 96.3ms；相對球色機會消融執行時為 p95 30.8ms、max 108.5ms。
- 這些是同機研究量測，不是目標裝置正式 benchmark；它們距主要求解器每步 3 秒上限仍有充足空間。
- Overnight 總時間是研究成本，不是玩家等待時間。下一輪以完整矩陣是否重現主要效果決定是否值得繼續，而不為小百分點擴大架構。

## Evidence identity

| Evidence | Report SHA256 |
| --- | --- |
| F25 exact stress | `29b0ae0a8fe5a964f1467c65c5e05a2612a9c64fce17e787f6a347ceccc83bd4` |
| F26 exact stress | `48f08273f1e3fbfe63beccb32fb2ebb4d79c140347f56c8a4236b09ee126735e` |
| F27 exact stress | `185eb7f673298a9e4e2c9f6a711c8002003c9b21462aff868a2bea1b31fffa1b` |
| F44 two-seed replay | `22f28a28e24e5ddcdb0f03d91fefe6ed7efe473875627f68ad6a94f5c2359040` |
| F50 seed 53 replay | `f4864fde187035f45f13b37d700c68d381dda53f0147af4eb2b66c1a9a096830` |
| Candidate vs v1.11，300 cases | `a7cb7f35a65b624f5df54d02756088596a0026b8e44d6d122845cd5edb50b500` |
| Candidate vs condition opportunity ablation，300 cases | `815afd5b68cd804f3f772a9a67e88b861c711b579c9835d0b6d71709fe1c844d` |
| Current ablation identity handshake smoke | `4fd357f573d561a5f9f9c96c5641591d397245befe9c7a5711ffdd40ad6ac884` |

300-case 消融 artifact 產生時使用暫時的實驗顯示名稱；commit `61fcb96` 只將公開 identity 改為 `condition-opportunity-ablation`，策略行為沒有變動。Current identity 已經以 native handshake 與一組 paired episode 驗證。

## 下一個決策

由使用者依 [overnight workflow](../../.agents/workflows/run-generic-overnight-evaluation.md) 啟動完整 same-tape 確認。結果需分別回答：

1. 一般收藏品的完成後檔位收益是否跨正式支援裝備與主要 worlds 重現；
2. 相對 v1.1 是否保留至少 80% 的 v1.11 主要收益；
3. 滿品質尾端是否有正回報；
4. HQ／Master 回到 v1.1 後是否精確守住完成與滿品質；
5. 全矩陣是否維持 0 illegal、0 valid-nonterminal policy-null、0 新增 action-limit。

完整 gate 通過後才取得下一個數字版號，並進入 hard-quality 通用改善與 Web runtime 採用。
