# Frozen Rabbit 姊妹專案參考規範

## 文件角色

`frozen_rabbit_tome`、`workshop` 與其他姊妹專案只能提供可檢查的參考，不是本專案的隱性 owner。

## 何時查看

只有下列情況主動查看姊妹專案：

- 使用者要求系列視覺、命名或操作一致；
- 本專案 canonical owner 明確缺少資料，且參考專案可能有可重用實作；
- 任務要求遷移、比較或重播某個已知機制。

一般 solver、文件或 UI 任務不為了「也許有用」讀取其他 repository。查看前先確認路徑、branch、current code 與授權；舊 handoff 不能代替目前 checkout。

## 可以借用的經驗

- Series-level 品牌語氣、顏色與互動習慣。
- 已證明有效的 state-feedback interaction、undo／resync 與 debug export。
- Solve 與 tree／distribution materialization 分離，避免 UI 為顯示用途拖慢 runtime。
- WASM capacity failure、wrapper／materialization failure 與演算法無解分開處理。
- 資料 schema、tests 或 build pattern，前提是本專案 owner 接受且依賴方向合理。

## 不能直接繼承

- 配方規則、condition 機率、objective、solver versions、thresholds 或裝備 envelope。
- 為 deterministic macro 或 gathering solver 設計的成功條件。
- 舊平台限制、bundle 目標、timeout 或 memory assumptions。
- 參考專案的 UI copy、圖示與 source implementation，除非授權已確認。
- 任何會覆寫本專案 product mission、architecture 或 current state 的「系列慣例」。

## 採用方式

1. 說明要解決的本專案問題。
2. 指出參考專案的具體檔案與 current evidence。
3. 抽取可重用的原則或最小實作，不整包搬運。
4. 依本專案 mechanics、tests、效能與授權重新驗證。
5. 把最後決策寫回本專案 owner；後續 agent 不需要再次讀姊妹專案才能理解。
