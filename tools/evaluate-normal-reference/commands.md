# Raphael 參考評測操作

用途與判準由 [研究計畫](../../reports/normal-reference/plan.md) 擁有。這是離線研究程式，不是玩家 runtime。使用者已在 2026-08-29 授權本次 500 組由 Agent 執行，其他 unattended overnight 仍需使用者啟動。

## 固定來源與建置

本機已下載 upstream 至 `.tmp/raphael-reference/upstream`；固定 revision `411168605989d573d89f2d71c01acac9f099e55a`，不要把之後漂移的 main 當成同一份參考。首次重建需要下載公開 source 及 Cargo dependencies，managed sandbox 的網路／Cargo cache 權限不足時需明確升權。

~~~powershell
git clone https://github.com/KonaeAkira/raphael-rs.git .tmp/raphael-reference/upstream
git -C .tmp/raphael-reference/upstream checkout --detach 411168605989d573d89f2d71c01acac9f099e55a
C:/Users/User/.cargo/bin/cargo.exe build --release --locked --manifest-path tools/evaluate-normal-reference/native/Cargo.toml
~~~

產品的 native binary 需已建置；下列 `plan-only` 只生成 500 組輸入，不跑 solver。從 repository root 執行：

~~~powershell
node tools/evaluate-native-generic-cosmic/run.mjs --plan-only --equipment=all --world=all-normal --seed-count=1 --risk=balanced --max-episodes=2000 --baseline-solver=generic-craft-route-portfolio-v1.1.0 --candidate-solver=generic-craft-route-portfolio-exp-condition-route-risk --output=.tmp/raphael-reference/cases.json
node node_modules/rolldown/bin/cli.mjs tools/evaluate-normal-reference/catalog.ts --file .tmp/raphael-reference/catalog.mjs --format esm --platform node
~~~

## 執行、續跑、狀態

run directory 首次建立時保存 input／binary snapshot、hash、source revision 及參考假設。必須使用新 directory 開始不同 binary／input 的實驗。30,000 為單格搜尋的毫秒預算；500 為本次最多覆蓋的前 N 格。每個程序單核心、同時最多 2 個，搜尋只受時間預算控制，無遊戲內或持續熱負載保證。

~~~powershell
node tools/evaluate-normal-reference/run.mjs run evaluation-runs/normal-reference/raphael-main-500 .tmp/raphael-reference/cases.json.candidate.tsv 30000 500
node tools/evaluate-normal-reference/run.mjs status evaluation-runs/normal-reference/raphael-main-500
node tools/evaluate-normal-reference/run.mjs resume evaluation-runs/normal-reference/raphael-main-500 .tmp/raphael-reference/cases.json.candidate.tsv 30000 500
~~~

`resume` 只跳過已保存的格、補尚未保存的格；已中止搜尋的格不會自動重算。500/500 表示每格已留下結果，不代表每格都證明最佳。`optimal`、`interrupted`、`hard-timeout`、`no-solution` 分開判讀，未證明最佳的格要另作延長預算的研究。Ctrl+C 結束當前 runner 及兩個 native children，已保存格保留；中途 raw JSONL 保留暫時解。

## 未完成搜尋加時重試

原始 30 秒 corpus 不可覆寫。以下命令只挑選原始狀態不是 `optimal` 的 88 組，將 120 秒重試另存到獨立目錄；`resume` 只補尚未保存的重試紀錄。

~~~powershell
node tools/evaluate-normal-reference/refine.mjs run evaluation-runs/normal-reference/raphael-main-500 evaluation-runs/normal-reference/raphael-main-500-refine-120s 120000
node tools/evaluate-normal-reference/refine.mjs resume evaluation-runs/normal-reference/raphael-main-500 evaluation-runs/normal-reference/raphael-main-500-refine-120s 120000
node tools/evaluate-normal-reference/refine.mjs status evaluation-runs/normal-reference/raphael-main-500 evaluation-runs/normal-reference/raphael-main-500-refine-120s 120000
~~~

重試紀錄分開標示首次取得可重播路線（`newlyReplayable`）、品質高於原 incumbent（`improved`）、搜尋正式完成（`newlyOptimal`）。`interrupted`／`hard-timeout` 仍只代表預算內沒有完成搜尋，不能記成無解。

## 報告與測試

~~~powershell
node .tmp/raphael-reference/catalog.mjs evaluation-runs/normal-reference/raphael-main-500/catalog.json
node tools/evaluate-normal-reference/summary.mjs
$env:NORMAL_REFERENCE_TEST_INPUT = (Resolve-Path .tmp/raphael-reference/cases.json.candidate.tsv).Path
C:/Users/User/.cargo/bin/cargo.exe test --release --offline --locked --manifest-path tools/evaluate-normal-reference/native/Cargo.toml
~~~

測試用固定生成輸入檢查全部 500 格的三類 action prefixes，不執行 500 次最佳化搜尋。完整逐招 trace、候選暫時解及兩版各 8 次技能成敗抽樣保存在 run directory。摘要可以在執行中生成，會明示已保存格數；未完成結果不得當成全矩陣結論。
