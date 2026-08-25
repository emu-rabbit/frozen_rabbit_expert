# Frozen Rabbit craft kernel

這個無外部 dependency 的 crate 是 `oracle-parity-v0.3` native transition／rollout kernel。
它重現 TypeScript oracle 的 seeded random streams、base progress／quality 公式與完整
單步製作狀態轉移，讓大量離線 rollout／benchmark 能把最密集的重複計算留在 Rust
批次內執行。

目前涵蓋：

- 全部 action 的合法性、CP／耐久消耗、作業與品質增益；
- buff、連段、Inner Quiet、Good Omen、Primed、no-step action；
- Final Appraisal、Manipulation、Trained Perfection 與專家資源；
- terminal／failure reason 與 simulator 的獨立 condition／success RNG streams；
- `native-transition-batch-v2` stdin/stdout protocol，可做逐欄 parity 或 summary-only
  hot-path benchmark；
- 獨立的 `native-rollout-batch-v2` protocol 與 `craft-kernel-rollout-batch`
  binary，在單一 native operation 內跑完整固定 action sequence，不改動單步 transition
  protocol；
- `native-root-plan-matrix-v2` 與 `craft-kernel-root-plan-matrix` binary，在同一
  recipe／crafter／state、paired seeds 與 shared fixed continuation 下，一次展開多個
  root candidates。TS 仍負責 objective score、safety shield 與 tie-break；
- `native-adaptive-policy-matrix-v1` 與 `craft-kernel-adaptive-policy-matrix`
  binary，讀取與 TypeScript 相同的 `craft-adaptive-policy-program-v1` 資料，逐步解讀
  guard、preview、safety、settle／resume、flags 與 counters；每次套用實際 outcome 後
  才重新選下一手。Rust 不硬編配方路線或 equipment/profile ID。
- `native-generic-episode-batch-v2` 與
  `craft-kernel-generic-episode` binary；一個 process 內完成 generic recommendation、
  condition／success RNG、transition、可序列化 `PlannerContext` 與 terminal，並回報
  compact outcome 或完整 trace。batch 在任何 episode 前先驗證 case／transition／output
  hard caps，handshake 另回 ABI、target、rustc、release profile 與 solver identities。

Rust offline generic solver 現在以 `generic-craft-budgeted-condition-v0.20.0` 作增量 baseline、
`generic-craft-ts-v0.6-semantic-port-v0.21.0` 作下一輪 overnight 候選。v0.21 將 frozen TS
migration oracle 的 objective／safety、finisher certificate、generic route 與 balanced 最後一擊
依原決策順序移入 Rust，但保留既有 native mechanics、episode runner 與 ABI。1,000-case balanced
migration gate 的兩類 completion、policy-null／failed 與 hard-quality target 計數完全一致；完整
action sequence 為 `93.9%`、aligned actions 為 `99.886%`，因此只宣稱 outcome parity，不宣稱
逐步 exact parity。相對 v0.20 的三個 1,000-case native gates，Stable／Balanced／Aggressive
completion 分別為 `+80／-16`、`+40／-18`、`+44／-21`，屬明確淨提升但不是逐 cell dominance。

曾另測「v0.21 回傳 null 才交給 v0.20」的閉合 rescue bundle；只有 completion `+1／-0`、
target `+1／-0`，且多一個 failed episode，收益不足以負擔第二套 fallback，已撤回且不廣告其
solver identity。v0.20 的策略規則保留作 regression baseline；native engine、handshake、snapshot、
resume 與 parity infrastructure 則繼續共用，不因策略候選撤回而丟棄。

它目前尚未接入 web runtime。TypeScript v0.6.0 migration identity 只作凍結的 cutover oracle；
v0.21 的近函式級 semantic port 用來追回已證明的策略立基點，不把永久逐招一致變成長期產品
契約。後續新策略只在 Rust A/B 演進；Web cutover 要嚴格對齊同一 Rust core 的 native↔WASM／
TS wrapper，不能建立第二套長期 solver truth。

2026-08-25 已採納的目標是把 objective／risk、decision memory、safety、certificate、
route／lookahead／fallback、RNG／transition 與 terminal 納入同一 Rust generic
whole-episode core，供日間／overnight native batch 與 Web WASM 共用。這不是把策略再複製
一份到舊 protocol：遷移期以凍結 TS oracle 鎖逐步 parity，cutover 後 Rust 是唯一持續演進的
solver compute owner；Node／TypeScript 只保留 data、orchestration、session、protocol 與 UI。

獨立驗證與 release build：

```powershell
cargo test --offline --manifest-path native/craft-kernel/Cargo.toml
cargo build --release --offline --manifest-path native/craft-kernel/Cargo.toml
```

`craft-kernel-batch` 會一次讀完整個 stdin batch，避免每個製作步驟都支付 process
startup。一般模式逐 case 輸出 preview／observed outcome／next state／RNG cursor，最後
附上 parse + transition + format 的 batch timing。若第一行是：

```text
native-transition-batch-v2\t__batch__\tbenchmark\t<repetitions>
```

則後續 case 只 parse 一次，timed section 內重複執行 native core 並輸出單一
operation count、`kernelNs` 與 deterministic FNV-1a checksum；這個數字不包含
process startup 與 stdin/stdout 成本，呼叫端必須另列端到端時間。

## Generic whole-episode protocol

`craft-kernel-generic-episode` 的每個 input row 固定為 141 個 TSV cells：protocol、case
identity、`episode`、solver／risk／objective／trace mode，接既有 recipe、crafter、full
state、RNG cursor、`maxSteps` 與 9×9 transition weights。每個 output row 固定為 51 個
cells，包含 solver／risk、objective、terminal／stop reason、實際 actions、兩條 final RNG
cursor、recommendation calls／nanoseconds、`PlannerContext` fingerprint、完整 final state 與
可選 trace。最後一列 batch summary 保存 cases、transitions、kernel time、output bytes 與
FNV-1a64。

TypeScript bridge 在 [`tools/evaluate-native-generic-cosmic`](../../tools/evaluate-native-generic-cosmic/README.md)
建立 catalog matrix，一個 paired A/B report 只啟動一個 Rust process。正式 shard／resume／
lock／retry 入口由 `tools/evaluate-generic-cosmic-overnight` 擁有；在 worker thermal calibration
完成前只允許明示的 native preview。

## Fixed-action rollout protocol

`craft-kernel-rollout-batch` 的每個一般 input row 固定為 129 個 TSV cells：version、
case ID、`rollout`、既有 10 個 recipe fields、6 個 crafter fields、24 個 full-state
fields，接著是 uint32 seed、condition／success RNG cursor、`maxSteps`、依
`Normal, Good, Good Omen, Centered, Sturdy, Pliant, Malleable, Primed, Robust` 兩軸
row-major 排列的 9×9 transition weights，最後是 comma-separated fixed actions。

成功 output row 固定為 35 個 TSV cells：terminal、stop reason、實際執行的 actions、
transition count、final cursor、24 個 final-state fields，以及單一 trace cell。trace 以
`;` 分 step、`|` 分欄；每步保存 action、success、next condition、前後 RNG cursor、
explanation codes 與完整 after-state。初始 state 與前一步 after-state 可精確重建每步
before-state。非法 action 會回 `illegal-action` 且不套用該步；malformed TSV、無效數值、
不一致 state、無效 weight 或未知 action 則回 error row。

若第一行為：

```text
native-rollout-batch-v2\t__batch__\tbenchmark\t<repetitions>
```

後續每一 case 的一次完整 rollout 才算一個 operation；summary 另回所有 operation
實際執行的 transition count。timed section 不含 TSV parse／format／stdout，並以 exposed
result fields 的 deterministic FNV-1a32 防止 benchmark 路徑省略結果計算。一般 batch
summary 則以逐 output row 加換行的 FNV-1a64 保護完整輸出。

## Root-plan matrix protocol

`craft-kernel-root-plan-matrix` 把「同一局面要比較多個第一步」壓成單一 batch request。
每個 request 攜帶完整 scenario model identity、condition profile、root candidate IDs、paired
sample IDs／seeds 與一條共用 fixed continuation。Rust 在 process 內展開 candidate × seed，
回傳每組完整 outcome／trace；protocol 會 echo model／plan identity，並拒絕重複、遺漏或
內容 hash 漂移。TS encoder 會從實際 recipe＋objective 重算 scenario identity，不信任
caller 自報的舊 hash。

一般 batch 在任何 rollout 前會先做整批 projection：每個 request 上限 1,000,000 episodes，
整批上限 2,000,000 episodes、100,000,000 projected transitions 與 240 MiB projected
stdout；binary 在輸出前另核對實際 bytes，超限時整批拒絕、不吐 partial outcomes。
benchmark 上限為 10,000,000 episodes／100,000,000 projected transitions。TS runner 與
Rust 使用相同 hard caps，現有 1,000,080-episode large evidence run仍在界內。

這層刻意不複製 TS 的策略判分，也不把固定 continuation 冒充 adaptive guide。它證明的是：
當未來路線已固定時，大量第一步候選比較可由 Rust 加速且逐步對齊；真正的 adaptive
continuation 則由下節的獨立 versioned protocol 驗證。兩者都不是策略 promotion 或 generic
search。

## Adaptive-policy matrix protocol

`craft-kernel-adaptive-policy-matrix` 接受一份經 TypeScript 內容 hash 綁定的 data-only
program，以及多個 recipe／crafter／initial-state／condition-world cases。每一步都依當下
完整 state 執行相同的 ordered transition／decision 規則，再用共用 mechanics 套用 outcome、
更新可序列化 memory 並繼續。輸出保存 node、decision、action、前後 memory、完整前後 state、
RNG cursor 與 terminal reason，讓兩個語言可以逐手 deep-compare，而不只比較最後總分。

目前 parity fixture 是巨匠藥 research artifact 的 18 cases／386 transitions，兩條 Good
`Precise Touch` 分支都有實際命中。這只證明「同一份策略資料由兩個引擎解讀時行為一致」；
不證明該策略優於現行 guide，也不代表 session restore ABI、web runtime 或通用搜尋已搬進
Rust。

為避免錯誤或惡意輸入在拒絕前耗盡記憶體，TS 與 Rust 都會在 rollout／format 前檢查：
每個 protocol cell 最多 1,024 UTF-8 bytes、最多 256 nodes、64 cases、每 case 64 actions、
合計 4,096 projected transitions、25,000,000 evaluation units 與 64 MiB projected output。
超限 batch 原子拒絕，不輸出 partial outcomes。

本機與 CI 的必要跨語言檢查分開執行 fixed/root 與 adaptive contracts：

```powershell
npm run test:native-parity
npm run test:native-adaptive-policy-parity
```
