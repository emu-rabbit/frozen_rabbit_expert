# Rust solver overnight brief：v1.14 完工契約與 Artisan 三臂基準

`last_updated: 2026-09-03`

## 目前決定

`generic-craft-route-portfolio-v1.14.0` 是本輪 active overnight candidate；`generic-craft-route-portfolio-v1.12.0` 是 fresh 產品基準。完整評測新增第三臂 `artisan-expert-default@882202ce04fcd4fe405812ea24d78b660d8ff64e`，用來提供外部公開策略的效果與速度座標，不取代 v1.12 的版本回歸基準。

v1.13 的 64-seed run 雖然總完成 27,338→27,548、滿品質 18,640→19,168，仍有 1,046 個 paired completion wins 與 836 losses；步數也廣泛增加。這代表球色工作排程有實質能力提升，但不能用淨增加掩蓋原本會完成的案例被換掉。v1.14 不再把這些損失交給 aggregate：球色可以為後續階段預付，但只有在目前 state 已能完整支付交貨契約後才啟用；尚未具備完整收尾 witness 時沿用 v1.12 的 completion-aware route。取得 witness 後，每個提案仍須讓成功／失敗分支都保有 action-budget 內的完整收尾。這是 mechanics、state 與剩餘 budget 的通用交易規則，不讀 recipe／equipment ID、seed、未來 RNG 或評測勝敗。

最終 release binary SHA-256 是 `e5d314c8ee82b3e633510c523bf3cca4a144e02c88aa8563c5a8fe54f20c05fa`。若 build 後 hash 不同，不得沿用本 brief 的命令宣稱同一 candidate；先重做 bounded gate 並更新 identity evidence。

## v1.14 bounded gate

最後 promotion gate 使用 50 families × Balanced × E02／E03／E07／E09／E10 × `balanced-iid`／`normal-heavy-iid` × 4 seeds，共 2,000 paired cases／6,000 三臂 rows；fresh v1.12、v1.14 與 Artisan 共用相同 mechanics、initial state、condition tape、success tape 與 80-step 上限。

- v1.12→v1.14：完成 1,701→1,704，paired completion `3 wins / 0 losses`；滿品質 1,155→1,177，`83 wins / 61 losses`；objective utility total `+25.386063`。
- 560 個 hard-quality cases 的完成、滿品質與 utility 逐 case 完全相同；先前版本相對 v1.12 的 31 個 completion losses 已全部消失。
- 1,440 個 progress-only cases 完成 `3 wins / 0 losses`。五套裝備與兩個 world 分開看也都是 0 completion loss；品質交換留給完整 run 判讀，不當成完工證據。
- v1.14 為 0 policy-null、0 illegal、0 action-limit。單次推薦 mean 10.803 ms、p50 4.433 ms、p95 42.533 ms、max 138.133 ms，位於 3 秒主要求解器契約內。
- Artisan 為完成 1,715、滿品質 1,493、utility total 1,640.147147；單次推薦 mean 0.130 µs、p50 0.100 µs、p95 0.200 µs、max 105.5 µs，但有 150 個 action-limit。它的規則判斷約比 v1.14 平均快 83,000 倍，製作路線卻更長：完成件 A p50／p95 為 42／70，v1.14 為 29／43；共同完成的 1,585 cases 中，v1.14 平均少 14.36 招。快不是效果或產品契約自動通過，完整報告要同時呈現其完成、品質與長度。

四表見 [v1.14 三臂 bounded 報告](../reports/generic-cosmic-overnight/v114-isolated-contract-vs-v112-vs-artisan-50f-5equipment-2world-s4.md)。這批是 synthetic／assumed-world development evidence，不是真實遊戲自然成功率，也不能取代 64-seed overnight。最終隔離檢查另確認 v1.12 在這 2,000 cases 的 outcome、步數與 planner context 均與既有 64-seed v1.12 evidence 完全相同；三臂共 6,000 rows 也與隔離前 gate 的非計時結果完全相同。

## Artisan Expert 基準邊界

第三臂是把 PunishXIV/Artisan 的預設 Expert decision tree 固定到 commit `882202ce04fcd4fe405812ea24d78b660d8ff64e`，移植到本專案 Rust kernel 後執行；不是啟動 Dalamud、Artisan plugin binary 或自動按鍵。它使用本專案 mechanics，才能與 v1.12／v1.14 消耗完全相同的 condition／success tapes。

移植保留 upstream 預設 Expert profile 的決策順序；排除遊戲 automation 與可選 Cosmic Duty Action。Pinned 預設 profile 不使用 Material Miracle 或 Stellar Steady Hand，本 kernel 也尚未建模兩者。報告可以稱「Artisan Expert 預設策略移植基準」，不能稱原插件實機 outcome parity。來源、revision、修改狀態與 BSD-3-Clause notice 同時保存在 source header 與 `THIRD_PARTY_NOTICES.md`。

## Active overnight 契約

run ID 固定為 `generic-native-v114-vs-v112-vs-artisan-balanced-e02-e03-e07-e09-e10-2world-64seed-20260903`。範圍是 50 families × Balanced × E02／E03／E07／E09／E10 × `balanced-iid`／`normal-heavy-iid` × 64 seeds，共 32,000 paired cases／96,000 executed arm rows；`base-seed=20260824`、action limit 80，中途不增減 strategy、裝備、world 或 reference 設定。三臂都 fresh 執行，不使用 `--baseline-dir`。

主要彙整固定分成兩組、每組四表：

1. `1.14 vs 1.12`：版本提升、完工守門與品質交換。
2. `1.14 vs Artisan Expert`：外部策略效果、長度與速度座標。

不把三臂混成單張 aggregate 表，也不把 `1.12 vs Artisan` 放進主要彙整；raw shard JSON 仍保存三臂逐 case 結果。判讀順序如下：

- v1.14 對 v1.12 先看總完成與 paired wins／losses，再拆 completion contract、family × equipment × world。完工率必須守住；少量 paired 退步只有在完成率不降且滿品質／有意義品質數量有足夠提升時才可能視為有效交換，不能隱藏。
- hard-quality 的完成即達 required quality。任何結構性 family × equipment × world 下滑都阻擋採用；不能用品質總量抵銷。
- progress-only 在交貨守住後，才比較收藏品 100／300／700／滿品質、HQ 機率與 Master 連續品質。品質不要求逐 case 零退步，但要明示 wins／losses 與集中切片。
- Artisan 是研究 reference，不是 promotion floor；它的 action-limit、較長路線或 mechanics 移植限制必須與優勢一起列出。
- 三臂都要報告 policy-null、illegal、action-limit、完成／未完成 A／S 長度與推薦 latency。v1.14 單次推薦不得越過 3 秒主求解器上限。

## 使用者啟動命令

先在管理員 PowerShell 啟動 temperature reader：

~~~powershell
& 'C:\Users\User\Documents\GitHub\frozen_rabbit_cosmic\tools\evaluate-generic-cosmic-overnight\read-amd-temperature.ps1' -OutputPath 'C:\Users\User\Documents\GitHub\frozen_rabbit_cosmic\.tmp\overnight-cpu-temperature.json' -DurationMinutes 720
~~~

再在 repository 的一般權限 PowerShell 啟動完整 run：

~~~powershell
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=native/craft-kernel/target/release/craft-kernel-generic-episode.exe --native-baseline-solver=generic-craft-route-portfolio-v1.12.0 --native-candidate-solver=generic-craft-route-portfolio-v1.14.0 --native-reference-solver=artisan-expert-default@882202ce04fcd4fe405812ea24d78b660d8ff64e --family-limit=50 --risk=balanced --equipment=E02,E03,E07,E09,E10 --world=balanced-iid,normal-heavy-iid --seed-count=64 --base-seed=20260824 --workers=4 --max-workers=8 --temperature-file=C:\Users\User\Documents\GitHub\frozen_rabbit_cosmic\.tmp\overnight-cpu-temperature.json --thermal-window=5m --time-budget=8.5h --shard-timeout=30m --retries=2 --output=evaluation-runs/generic-cosmic-overnight --run-id=generic-native-v114-vs-v112-vs-artisan-balanced-e02-e03-e07-e09-e10-2world-64seed-20260903
~~~

續跑使用完全相同命令。只看狀態時重送相同命令並在末尾加 `--status-only`，不需啟動 temperature reader。最終 4-seed gate 在 4 workers 約 5 分 25 秒完成；按 seed 數線性估算約 1 小時 27 分，實際時間會受溫控、family 成本與系統負載影響。8.5 小時是單次可續跑上限，不是完成時間承諾。長跑只能由使用者啟動；agent 不代為啟動或保持對話等待。
