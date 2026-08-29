# Raphael 500 組：300 秒加時重試

本次只重試上一輪 refinement中狀態不是 `optimal` 的 14 組；既有 case JSON、raw JSONL 與 frozen binary／input 均未覆寫。加時結果保存在獨立目錄，單格預算 300,000ms、2 個單執行緒 worker。

已保存 **14/14** 組重試；重試狀態 {"interrupted":5,"optimal":9}。原目標狀態 {"interrupted":14}。

- 新取得可重播路線：0 組。
- 品質高於原 incumbent 或原本無路線：11 組；正向 Q 合計 46,733。
- 新證明 `optimal`：9 組；與原始 corpus 合併後共有 495/500 組完成 upstream 搜尋。
- 合併後至少有可重播路線：500/500 組。

這裡的 `interrupted`／`hard-timeout` 只表示本次時間預算內未完成搜尋，不是無解。`optimal` 才是 upstream 回報完成搜尋；可重播 incumbent 只能作已找到路線。

## 300 秒後仍未完成搜尋

| index | 原狀態 | 重試狀態 | 原 Q | 重試 Q | Q 差 | 重播 |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 9 | interrupted | interrupted | 11148 | 15376 | 4228 | 有 |
| 72 | interrupted | interrupted | 11847 | 11847 | 0 | 有 |
| 82 | interrupted | interrupted | 11847 | 11847 | 0 | 有 |
| 92 | interrupted | interrupted | 11847 | 11847 | 0 | 有 |
| 389 | interrupted | interrupted | 11131 | 14627 | 3496 | 有 |

後續再加時必須建立新的 attempt 目錄與預算 manifest；不得把本報告剩餘格改寫成 `no-solution`。
