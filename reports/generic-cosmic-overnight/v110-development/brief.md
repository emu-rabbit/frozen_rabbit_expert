# v1.1 開發與 overnight 準備

## 本輪問題

以 v0.30 為效果對照，改善 v1.0 的必要品質完成率、換路線判斷與 native 計算成本。架構維持候選、證據、比較器、實際事件記憶四個責任；可信的 Rust 能力繼續由 adapter 重用。

## 開發資料與假說

- 初始診斷沿用 v1.0 的 50 families × E02／E09 × Balanced × balanced-iid × base seed 20260824，共 100 pairs。
- 較多共同抽樣及配對增益的不確定性成本，可以降低偶然樂觀的換路線；無交付的預測保留接近目標的距離作同分比較。
- 只有一個方案時，以首步分支證據回傳，將續作預算用於實際存在選擇的 state。
- 已知可完成 suffix 的耐久需求可在已證實可行的區間內二分求解；以逐點窮舉及保留的 binary 檢查語意。
- 簡化續作能力的 pilot 用於確認成本與品質的取捨，按分層效果選擇保留的實作。

## 擴大驗證與停止條件

候選演算法固定後，使用另一組 base seed 20260827，覆蓋全部 50 families、E02／E09 及三種 risk 的有限比較，再補專家裝備與球色壓力情境。這些資料屬 development readiness；overnight 使用另外固定的 seeds。

進入 overnight 的研究價值由以下證據共同判斷：必要品質的初版落差顯著縮小、完整品質有可見收益、progress-only 交付保持可靠、0 illegal／policy-null，以及本機成本能在有時間上限且可續跑的矩陣中有效取得資訊。重要弱切片單獨揭露；正式採用的效果容忍界線由 active overnight brief 事前管理。

每次 development process 限 300 秒，每輪先看結果再決定下一個實驗。完整 unattended run 由使用者啟動。
