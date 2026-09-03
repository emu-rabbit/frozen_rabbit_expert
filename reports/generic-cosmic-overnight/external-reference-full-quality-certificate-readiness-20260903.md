# 外部基線滿品質證明候選：overnight readiness

`generic-craft-external-reference-exp-full-quality-certificate` 是描述性實驗，不是已採用數字版本，也尚未切入 Web。它完整保留固定 Artisan Expert decision tree，只在當前可觀測 state 能證明最多三招內必定「滿品質且完成」時接管。

## 問題與方法

主要量尺是滿品質交貨，不是步數或 action limit。候選只考慮目前合法且成功率 100% 的技能；對 recipe 宣告的每個可能下一球色都建立 continuation，且每一分支都必須在剩餘 action budget 內存在滿品質完工招。下一步收到實際球色後重新證明，因此不依賴預先承諾但可能被 replanning 丟棄的固定 suffix。

Selector 只讀 recipe／crafter mechanics、當前 state、declared condition set 與 action budget，不讀 recipe ID、equipment ID、seed、未來 RNG 或 evaluator-private condition weights。Action limit 只用來判定證明能否真的執行，不是候選的優化目標或採用理由。

## 主要配對 gate

三批皆為 50 families × Balanced、same-tape paired synthetic evaluation；Baseline 固定為 `artisan-expert-default@882202ce04fcd4fe405812ea24d78b660d8ff64e`。

| Gate | 軸 | Base seed | Paired cases | 完成 Baseline→Candidate | 完成 勝／敗 | 滿品質 Baseline→Candidate | 滿品質 勝／敗 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | E02／E03／E07／E09／E10 × `balanced-iid`／`normal-heavy-iid` × 8 seeds | 20260824 | 4,000 | 3,433→3,440 | 7／0 | 3,007→3,020 | 13／0 |
| B | 同 Gate A 的獨立 base seed | 20260903 | 4,000 | 3,451→3,460 | 9／0 | 3,020→3,036 | 16／0 |
| C | 全 10 裝備 × 全 4 worlds × 4 seeds | 20260903 | 8,000 | 4,003→4,010 | 7／0 | 2,725→2,748 | 23／0 |

Gate A、B 的五套裝備與兩個 world 各自都是滿品質正增且 0 losses。Gate C 另外確認弱裝、未食藥、`opportunity-scarce-iid` 與 `all-normal`：10 套裝備各自都有滿品質 wins；三個隨機 world 各自正增；全 Normal 壓力 world 為 0 勝／0 敗。

## 廣域 Gate C 切片

| Equipment | 滿品質 勝／敗 | 完成 勝／敗 |
| --- | ---: | ---: |
| E01 玩家無食藥 | 1／0 | 0／0 |
| E02 玩家食藥 | 6／0 | 2／0 |
| E03 玩家食藥專家 | 2／0 | 0／0 |
| E04 720／690 裸裝 | 1／0 | 0／0 |
| E05 720／690 裸裝食藥 | 3／0 | 1／0 |
| E06 i750 裸裝 | 3／0 | 0／0 |
| E07 i750 裸裝食藥 | 1／0 | 1／0 |
| E08 i750 五鑲嵌 | 2／0 | 1／0 |
| E09 i750 五鑲嵌食藥 | 2／0 | 0／0 |
| E10 i750 五鑲嵌食藥專家 | 2／0 | 2／0 |

| World | 滿品質 勝／敗 | 完成 勝／敗 |
| --- | ---: | ---: |
| `balanced-iid` | 7／0 | 2／0 |
| `normal-heavy-iid` | 11／0 | 5／0 |
| `opportunity-scarce-iid` | 5／0 | 0／0 |
| `all-normal` | 0／0 | 0／0 |

| Completion contract | 滿品質 勝／敗 | 完成 勝／敗 |
| --- | ---: | ---: |
| `progress-and-required-quality` | 7／0 | 7／0 |
| `progress-only` | 16／0 | 0／0 |

50 families 中 20 個有滿品質 wins、30 個持平、0 個有 losses；完成為 6 個 family 有 wins、其餘持平、0 個有 losses。這表示 aggregate 沒有掩蓋負向 family。

## 效能與可重現身份

- Gate A candidate recommendation p95／p99／max：0.281／0.388／4.710 ms。
- Gate B candidate recommendation p95／p99／max：0.289／0.397／0.749 ms。
- Gate C candidate recommendation p95／p99／max：0.259／0.365／3.553 ms。
- Gate A／B／C evidence binary SHA-256：`50260e45d3547022114ef4db22cd1f10dc2b308afe430a944b474e620fb1e9ef`。
- Overnight 交接前從目前 source 重建的 release binary SHA-256：`75bc3ccfaa854f44d50442642448cdf7136b46b129b4941b404936c94d186030`。
- 重建後以新 binary 重跑 Gate B，仍為完成 9 勝／0 敗、滿品質 16 勝／0 敗；排除三個 recommendation timing 欄位後，8,000 arm rows 與原 Gate B 的語意 SHA-256 同為 `737eb3c029bb732561d2776a34316b634d0526bad536d748fd975ab3c419620f`，逐列完全一致。
- Raw bounded evidence：`.tmp/full-quality-certificate-depth3-5equipment-20260824-s8.json`、`.tmp/full-quality-certificate-depth3-5equipment-20260903-s8.json`、`.tmp/full-quality-certificate-depth3-all10equipment-all4world-20260903-s4.json`、`.tmp/full-quality-certificate-preovernight-current-binary-20260903-s8.json`。

## 判讀

這個候選已達到「可進 overnight 完整能力盤點」的信心門檻：主要與獨立 base seed 都相對 Artisan 增加滿品質，paired losses 為 0；五套正式盤點裝備、全 10 裝備、三個隨機 world、兩種完成契約與 family 切片都沒有發現反例。改善幅度仍小，所以目前只能叫 readiness candidate，不能先宣稱已超越完整 64-seed Artisan 基線或升成正式版本。

這些結果是 synthetic／assumed-world development evidence，不是真實遊戲自然成功率。下一步是由使用者啟動 50 families × E02／E03／E07／E09／E10 × 兩個主要 worlds × 64 seeds 的完整 paired run；結果仍以滿品質率、paired 滿品質 wins／losses 與 family × equipment × world 為首要判讀，action-limit 只列為次要失敗原因。

## 已驗證的 overnight 交接

目前交接 binary `75bc3ccfaa854f44d50442642448cdf7136b46b129b4941b404936c94d186030` 已用相同 identities、裝備／world 語意與新 base seed `20260904` 完成 1 family、10 paired cases、20 arm rows，binary handshake 與 shard validation 通過。完整長跑依專案邊界由使用者啟動；起跑前不要再次重建或替換 release binary。

先在另一個「系統管理員 PowerShell」啟動溫度 reader：

```powershell
& '.\tools\evaluate-generic-cosmic-overnight\read-amd-temperature.ps1' -OutputPath '.\.tmp\overnight-cpu-temperature.json' -DurationMinutes 720
```

再於 repository 的一般權限 PowerShell 啟動完整 run；相同命令也是中斷後的 resume：

```powershell
npm run evaluate:generic-cosmic-overnight -- --engine=rust-native --native-preview --native-binary=native/craft-kernel/target/release/craft-kernel-generic-episode.exe --native-baseline-solver=artisan-expert-default@882202ce04fcd4fe405812ea24d78b660d8ff64e --native-candidate-solver=generic-craft-external-reference-exp-full-quality-certificate --risk=balanced --equipment=E02,E03,E07,E09,E10 --world=balanced-iid,normal-heavy-iid --seed-count=64 --base-seed=20260904 --workers=4 --max-workers=8 --temperature-file=.tmp/overnight-cpu-temperature.json --thermal-window=5m --time-budget=2h --shard-timeout=15m --retries=2 --output=evaluation-runs/generic-cosmic-overnight-native --run-id=generic-native-full-quality-certificate-vs-artisan-balanced-e02-e03-e07-e09-e10-2world-64seed-20260904
```

只查狀態時使用同一完整命令並在最後加上 `--status-only`；status 不需要 reader 持續運作。正常中止請按一次 Ctrl+C，等待 runner 保存 manifest；不要連按或強制關閉。溫控 reader 與 runner 是獨立程序，run 結束後需在 reader 視窗按 Ctrl+C。
