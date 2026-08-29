<!-- doc-status: archived -->

# Rust/WASM Web integration 暫停紀錄

`paused_at: 2026-08-30`

> 本檔保存已完成 compute-owner 選擇後、尚未開始 Web wiring 的交接邊界。使用者已決定先把工作成本投入 Rust solver optimization；目前優先級與下一個 gate 請讀 [active brief](../../overnight_review_brief.md)。

## 已完成邊界

- Web compute owner 已選定為 `native/craft-kernel` 經 `native/craft-kernel-web` 的 Rust/WASM ABI，不再比較另一份 TypeScript 策略核心。
- `rust-web-planner-abi-v1` 已有 stateful reset／continue／deviate bridge，以及 native v1.12 parity 與 Node-WASM engineering evidence。
- 這些提交與證據保留；暫停的是 persistent browser Worker、fast solver、UI wiring 與 frozen TypeScript runtime removal。

## 恢復時的第一個 vertical slice

1. 建立 browser-side ABI encoder／decoder 與 persistent Worker。
2. 以同 session fixtures 驗證 identity、reset／continue／deviate、terminal／action-limit 與 3 秒 watchdog。
3. 建立獨立 Rust fast solver 的 fixed-budget、合法非終局 0 policy-null 與 target-device p95 gate。
4. Main＋fast 都成立後才移除 frozen TypeScript runtime dependency。

完整 runtime 選擇與量測證據見 [Rust→WASM decision report](../../../reports/web-runtime/rust-wasm-core-decision-20260830.md)。
