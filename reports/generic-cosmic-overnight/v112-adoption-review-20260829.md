# v1.12 completion-aware 採納報告

`reviewed_at: 2026-08-30`

## 結論

`generic-craft-route-portfolio-exp-completion-aware` 通過事前固定的完整確認條件，已以 commit `44031e2` 取得正式 identity `generic-craft-route-portfolio-v1.12.0`。採納理由不是「更多策略」本身，而是它在正式支援的 Balanced 一般收藏品範圍，同時交付了三項可重現的玩家價值：

- 相對 v1.1，完成率淨上升，沒有以大量未交貨交換品質；
- 完成成品的獎勵檔位與滿品質都有大幅提升，並保留 v1.11 超過 80% 的既有收益；
- Stable、hard-quality、HQ 與 Master 的基準語意沒有被可選品質策略改變。

因此 v1.12 成為 Rust solver 的目前採用基礎。這仍是 synthetic／assumed-world policy evidence，不是真實遊戲自然成功率、target-device Web latency 或公開發布批准。

## Evidence identity

- 完整 run：`generic-native-completion-aware-vs-v110-history-64seed-20260829`。
- 狀態：150/150 shards completed，0 failed；新執行 384,000 candidate episodes，另沿用 384,000 個已逐案例核對的 v1.1 歷史 baseline rows。
- Matrix：50 families × 3 risks × 10 equipment × 4 assumed worlds × 64 paired seeds。
- Config fingerprint：`2f4ba5c92c492b56271fec63e9d4d2dc0b1d6fb4f03aa037e0607b4e30fb17ab`。
- Native binary SHA256：`f47d7eb2b7a9fe44311c7750aaafb7019c92e74467bd62027675fb10133d1c7a`；ABI `native-generic-closed-loop-abi-v7`。
- 自動四表：[完整輸出](generic-native-completion-aware-vs-v110-history-64seed-20260829.md)，SHA256 `a21b870a692aca791bc5d9ad545496d86ecc097136454fc4a849ca6fab8a9d72`。
- 事前契約：[封存 brief](../../.agents/archive/handoffs/completion-aware-full-review-2026-08-29.md)；開發 gate：[bounded review](v111-completion-aware-bounded-review-20260829.md)。

## 主要玩家結果

正式支援的主要比較範圍固定為 Balanced、31 個一般收藏品、E02／E03／E05／E07／E09／E10 與三個主要 assumed worlds，共 35,712 paired cases。

| 量尺 | v1.1 | Completion-aware | 差異 |
| --- | ---: | ---: | ---: |
| 完成 | 35,647 | 35,710 | +63；65 wins／2 losses，+0.176 pp |
| 完成成品檔位淨變動 | — | — | +19.828 pp |
| 滿品質 | 16,991 | 19,801 | +2,810；+7.869 pp |
| v1.11 檔位收益保留率 | — | — | 97.939% |
| v1.11 滿品質收益保留率 | — | — | 96.398% |

兩項保留率都高於 brief 的 80% promotion gate。更重要的是，31 個一般收藏品 family 依正式支援裝備與主要 worlds 合計後，檔位淨變動全部為正；最低的 F23 仍為 +1.128 pp。這支持收益來自通用 objective／condition／state 行為，而不是少數 family 拉高 aggregate。

Balanced × `balanced-iid` × E02／E09 的首要切片共 3,968 cases：完成 3,960→3,968，8 wins／0 losses；完成成品檔位 +13.609 pp，滿品質 +7.762 pp；相對 v1.11 的收益保留率為 95.745%／96.552%。它直接通過 brief 要求先看的非極端主戰切片。

| Assumed world | 完成差 | 檔位淨變動 | 滿品質差 |
| --- | ---: | ---: | ---: |
| `balanced-iid` | +0.277 pp | +13.811 pp | +7.787 pp |
| `normal-heavy` | +0.218 pp | +21.262 pp | +8.451 pp |
| `opportunity-scarce` | +0.034 pp | +24.412 pp | +7.367 pp |

三個主要 worlds 都保留正向完成、檔位與滿品質結果；這是跨 assumption 的敏感度證據，不代表三者的自然發生率。

## 安全與既有 objective

- 全部新 candidate episodes 為 0 illegal、0 valid-nonterminal policy-null。
- 既有 9 個 hard-quality action-limit 與 v1.1 完全相同：Aggressive 3、Balanced 5、Stable 1；沒有新增 action-limit。
- 排除 timing 後，Stable 128,000 rows、hard-quality 107,520 rows、HQ 15,360 rows、Master 23,040 rows 的宣告語意欄位都是 0 mismatch。這符合 v1.12 對這些 objective／risk 路由回 v1.1 的設計。
- Candidate main solver 共 11,319,654 次 recommendation，native throughput run 的平均約 4.003ms、max 348.821ms；worst-shard p95 69.647ms、p99 126.798ms，遠低於 3 秒主求解器 gate。這不是 target-device Web 或 UI latency 證據。

## 兩個完成損失的意義

正式支援 Balanced 一般收藏品只有兩個 paired completion loss，且完成淨值仍為 +63：

1. F25／E05／`normal-heavy`／seed 47：v1.1 以 29 actions 完成且滿品質；候選在 action 6 轉入闊步式品質路線，之後多次高速製作失敗，最終 8,991／9,700 進展、8,779／11,600 品質、43 actions 未完成。
2. F09／E05／`normal-heavy`／seed 52：v1.1 完成；候選停在 8,100／10,000 進展、7,738／12,000 品質。同一 64-seed cell 的檔位仍 +17.188 pp、滿品質 +9.375 pp，但完成 −1.563 pp。

這兩例揭露的是現有 finish witness 的可見範圍：completion guard 只在當前 state 已找到最多 8 actions 的 deterministic finish 時成為硬保護；較早期仍可能選擇高品質路線，直到進展證明進入 horizon。它是可重播的後續診斷，不足以否定 promotion：兩例只占此正式比較範圍 0.0056%，而且沒有形成 family aggregate 反向。為這兩例直接擴大 search depth／beam 會增加所有推薦的計算與維護成本，目前沒有相稱證據。

## 因果與裝備解讀邊界

完整 run 證明 completion-aware 整體策略相對 v1.1 的結果，不能把 +19.828 pp 全部歸因於「讀球」。直接 causal evidence 仍是 bounded candidate-vs-ablation 比較：一般收藏品完成持平、檔位 +5.38 pp、滿品質 −1.08 pp。完整 run 則證明該整體策略能跨裝備與主要 worlds 保留 v1.11 收益。兩者合起來支持保留 condition-specific proposals，但不支持宣稱全部滿品質增益都由 condition proposal 單獨造成。

裝備間也不能用相同 `seedIndex` 作嚴格 causal 單調性比較，因為不同 equipment cell 取得不同 `pairedSeed`；本 run 支持「正式裝備 aggregate 沒有系統性反向」，不證明每條 condition tape 上 E10 一定優於 E09。若未來這個問題會改變產品決策，應使用共用 condition tape 的小型 profile ablation，而不是再跑一輪相同 overnight。

## 下一步

先進行一次 F36／F46 hard-quality 通用能力研究，依 [active brief](../../.agents/overnight_review_brief.md) 比較成功與 near-miss exact tapes、面板與專家技能收益、Good Omen／Robust 延遲價值。只有通過全 14 個 hard-quality families 的 bounded no-regression gate，才保留新的 runtime 行為；否則保存負結果並轉入 Web runtime 採用。
