<!-- doc-status: archived -->

> 已於 2026-08-30 完成並封存。結果與停止決策見 [F36／F46 hard-quality bounded study](../../../reports/generic-cosmic-overnight/f36-f46-hard-quality-bounded-study-20260830.md)；目前入口已轉為 [Web core adoption brief](../../overnight_review_brief.md)。

# F36／F46 hard-quality bounded study brief

`last_updated: 2026-08-30`

本輪只研究一個小範圍、可由 mechanics／condition／crafter／state 解釋的 hard-quality 能力，回答 F36／F46 的成功邊界能否在不傷害其他 12 個 hard-quality families 的前提下提高。它不是 unattended overnight；若沒有清楚的 exact-tape 因果，不建立 candidate、不擴大 beam／depth／seeds，直接轉入 Web 主線。

## 比較身份與不變邊界

- Baseline：`generic-craft-route-portfolio-v1.12.0`。Hard-quality 在此 identity 下精確使用 v1.1 行為。
- Candidate：只有 exact-tape 診斷支持一個通用能力後，才建立描述性 experiment identity；沒有通過 bounded gate 前不取得數字版號。
- Selector 只能讀 recipe mechanics、declared condition set、crafter stats／specialist capability、risk、CraftState 與 PlannerContext。不能讀 family／recipe／equipment ID、seed、future RNG 或 evaluation label。
- Mechanics、required-quality terminal、合法性、主求解器 3 秒上限與既有 action-limit 判定不變。

## 假說

目前 F36／F46 多數 near-miss 已使用最終確認（Final Appraisal，`finalAppraisal`）保存進展 bank，最後停在 11,999／12,000 或 12,499／12,500，並耗盡 CP／耐久。第一假說不是「收尾搜尋不夠深」，而是前中段的 quality／progress／resource 配置，尚未把 condition set 的延遲價值與可支付 continuation 放進同一比較。

F36 含好兆頭（Good Omen）但不含高耐久（Robust）；F46 含高耐久但不含好兆頭。若同一 resource-aware continuation 能合理估價「好兆頭→高品質機會」與「高耐久→結實（Sturdy）的多步耐久收益」，它應由這些可觀測訊號選中，不需要 family patch。

## 診斷順序

1. F36／E10／Balanced／`balanced-iid`：成功 seed 0 對照 near-miss seed 53；後者為 12,000 進展、31,846／32,300 品質，只差 454。
2. F46／E10／Balanced／`balanced-iid`：成功 seed 15 對照 near-miss seed 21；後者為 12,499／12,500 進展、31,104／33,500 品質。
3. 對照每步 condition、action、success、buff、IQ、CP、耐久、進展 bank、candidate source 與 continuation evidence；先定位可以由當時資訊做出的不同決定。
4. 把 E09→E10 拆成「只增加 +20 作業／+20 加工／+15 CP」與「同面板再開放 specialist actions」，判斷 F36 13→24、F46 1→8 的既有完成差主要來自 stats 還是 routing capability。
5. Aggressive 只作 risk 診斷：F36 會受益，F46 未高於 Balanced。Candidate 不得用更高風險名稱掩蓋相同資源錯配。

## Candidate 與驗證規則

- 第一輪最多新增一個 producer、scoring signal 或通用 guard；先在上述 four tapes 證明 action 改變的可解釋原因。
- Exact tapes 是 development evidence。建立候選後，先固定未參與調整的新 paired seeds、base seed、比較 identity 與 binary hash，再跑 promotion gate。
- Promotion matrix：E02／E09／E10 × `balanced-iid`／`normal-heavy`／`opportunity-scarce` × 14 hard-quality families；Balanced 是主要量尺，Aggressive 另列風險反應。
- 必報 family × equipment × risk × world；F36／F46 分開，不能由較容易 family 的 aggregate 抵銷。

## 接受與停止條件

- F36 或 F46 至少一個在正式支援裝備有可觀的 paired completion 淨增益，另一個不得形成可信退步；只有平均品質上升但 required quality 未達不算改善。
- 其他 12 個 hard-quality families 為 0 completion regression；全矩陣 0 illegal、0 valid-nonterminal policy-null、0 新增 action-limit。
- 每步 recommendation 仍低於 3 秒；若收益只來自顯著擴大所有案例的 search cost，不採用。
- Candidate miss、需要 family／equipment ID、只在已調整 tapes 有效、或 bounded gate 沒有清楚淨回報時，保存研究結果但不升版，結束 Rust hard-quality 假說並轉入 Web runtime 採用。
