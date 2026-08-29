# Raphael 500 組：120 秒加時重試

本次只重試原始 30 秒 corpus 中狀態不是 `optimal` 的 88 組；原始 case JSON、raw JSONL 與 frozen binary／input 均未覆寫。加時結果保存在獨立目錄，單格預算 120,000ms、2 個單執行緒 worker。

已保存 **88/88** 組重試；重試狀態 {"optimal":74,"interrupted":14}。原目標狀態 {"interrupted":84,"hard-timeout":4}。

- 新取得可重播路線：79 組。
- 品質高於原 incumbent 或原本無路線：87 組；正向 Q 合計 1,366,922。
- 新證明 `optimal`：74 組；與原始 corpus 合併後共有 486/500 組完成 upstream 搜尋。
- 合併後至少有可重播路線：500/500 組。

這裡的 `interrupted`／`hard-timeout` 只表示本次時間預算內未完成搜尋，不是無解。`optimal` 才是 upstream 回報完成搜尋；可重播 incumbent 只能作已找到路線。

## 120 秒後仍未完成搜尋

| index | 原狀態 | 重試狀態 | 原 Q | 重試 Q | Q 差 | 重播 |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 9 | interrupted | interrupted | — | 11148 | 11148 | 有 |
| 22 | hard-timeout | interrupted | — | 11095 | 11095 | 有 |
| 32 | hard-timeout | interrupted | — | 11095 | 11095 | 有 |
| 42 | interrupted | interrupted | — | 11095 | 11095 | 有 |
| 59 | interrupted | interrupted | — | 16901 | 16901 | 有 |
| 69 | interrupted | interrupted | — | 17033 | 17033 | 有 |
| 72 | interrupted | interrupted | — | 11847 | 11847 | 有 |
| 82 | interrupted | interrupted | — | 11847 | 11847 | 有 |
| 92 | interrupted | interrupted | — | 11847 | 11847 | 有 |
| 362 | interrupted | interrupted | — | 19994 | 19994 | 有 |
| 369 | interrupted | interrupted | — | 24345 | 24345 | 有 |
| 372 | interrupted | interrupted | — | 10477 | 10477 | 有 |
| 379 | interrupted | interrupted | — | 12956 | 12956 | 有 |
| 389 | interrupted | interrupted | — | 11131 | 11131 | 有 |

後續再加時必須建立新的 attempt 目錄與預算 manifest；不得把本報告剩餘格改寫成 `no-solution`。
