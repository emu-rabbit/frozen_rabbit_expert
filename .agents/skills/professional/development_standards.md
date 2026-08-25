# 開發實作規範

## 觸發條件

撰寫、修改、重構或 review 程式碼、設定、資料、測試、建置、效能或 dependency 時讀取本文件。

## 技術選型

- 優先使用 `.agents/skills/professional/technical_architecture.md` 的 target baseline；若 code 已存在，以 current checkout 為準。
- 新 dependency 必須解決具體問題，並評估 bundle size、維護、license、browser compatibility 與供應鏈成本。
- Web、session、protocol、catalog／data 與 orchestration 優先使用 TypeScript、pure functions、explicit types 與 deterministic tests；compute owner 依 `technical_architecture.md`。同一套 solver semantics 不得在 TypeScript 與 Rust 長期共同演進。
- Phase 0／1 不新增 server、database、native／WASM core、state management framework 或 ML runtime，除非有已量測的必要性與使用者確認。generic closed-loop evaluator 已具 profiler 證據，並經使用者確認採 Rust-primary；這個例外只涵蓋完整 generic compute core、native batch 與同 core WASM，不授權無關 framework 擴張。
- solver 的正常 action selection 使用固定 node／evaluation work budget、canonical ordering 與 deterministic tie-break；wall-clock 只作外層 abort／watchdog。效能 benchmark、日間 statistical iteration 與 overnight 使用 Rust release build；debug build 只供開發與 correctness tests。
- hosting、analytics、telemetry 與外部服務都是獨立決策，不從姊妹專案自動繼承。

## 程式邊界

- domain mechanics 不 import Vue、DOM、storage、clock 或 network。
- recipe／condition data 與 transition code 分離；資料可以 versioned 更新，不必改演算法。
- solver 只依賴 domain contract，不直接操作 component state。
- protocol 定義 event／export／model version，不把完整 debug blob 當 local persistent model。
- UI 透過 composable／session controller 使用 domain，不在 component 內重寫公式。
- `MissionState` 與 `CraftState` 不扁平化；wall-clock timing 由 mission／session boundary 注入。

## 數值與狀態

- 明確保存 zero、false、empty 與 unavailable，不用 falsy shortcut 代替 domain state。
- 取整順序、`Math.fround`、`floor`、`ceil`、clamp 與 multiplier ordering 是 mechanics contract，不做看似等價的整理。
- action legality、terminal state、one-use resource、buff tick 與 no-step semantics 應由 type／pure function／test 保護。
- randomness 必須可注入 seeded stream；deterministic replay 不讀全域 `Math.random()`。
- 時間相關邏輯使用 injectable clock／timestamp，不讓 UI timer 成為唯一真相。

## 錯誤與 fallback

- mechanics mismatch、invalid user input、unsupported recipe、unknown condition profile、OOD policy、storage failure 與 environment failure 分類處理。
- OOD 或 policy artifact 載入失敗時 fallback 至 versioned guide policy／safe manual tracking；不得靜默給出高信心建議。
- state 不一致時提供 resync，並保留事件；不要用 reload／清空 storage 當主要修復方式。
- terminal 或 illegal state 不得繼續推薦一般 action。

## 測試分層

- **Unit**：action formula、rounding、buff timing、legality、event reducer、reason codes。
- **Invariant／property**：資源範圍、probability sum、forced transition、terminal behavior。
- **Golden trace**：與遊戲內每一步數值一致。
- **Parity**：若未來新增 WASM／Rust，只比較 summary 不足；需逐 outcome／state parity。
- **Statistical**：policy completion／Silver／Gold／tail risk 與 confidence interval。
- **Browser／E2E**：完整回報、偏離建議、undo、resync、keyboard fast mode、reload/replay。
- **Benchmark**：transition throughput、offline rollout、runtime p50/p95/p99、UI input latency、export materialization 分開量測。

長跑壓力測試不放進預設 unit suite。需要大樣本或高分支的 case 放 benchmark／statistical suite，並保留小型代表性 contract test。

## Model version 硬約束

若同一輸入可能因下列變更得到不同結果或解碼語意，commit 前必須更新對應版本：

- mechanics／formula／action model；
- scenario policy／guide rules／risk objective；
- condition profile；
- finisher certificate；
- session event／export codec。

純 Markdown、layout 或不影響模型的文案不需 bump。若變更跨 shared mechanics 與多個 scenario，所有受影響 runner／scenario version 一起更新，不只 bump 修改檔案最多的一側。

## 完成前驗證

1. 先讀現有 scripts／CI，不猜指令。
2. 執行與變更風險相稱的 test、typecheck、build 或 benchmark。
3. 檢查 model version、data source metadata 與相關文件是否同步。
4. `git diff --check`，再閱讀實際 diff。
5. 無法執行的驗證需說明原因、已有證據與殘留風險。
