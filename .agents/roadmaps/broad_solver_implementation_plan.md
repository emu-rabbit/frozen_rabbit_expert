# Frozen Rabbit Expert 目前 Roadmap

## 文件角色

本 roadmap 只管理下一個產品決策、交付 gate 與停止條件。Current facts 看 [current_state.md](../current_state.md)；單次 run 數字留在 evaluation output 或 archive。

## 交付目標

在對外發布前，全部 432 個 catalog 配方都要通過使用者接受的整體 evidence review。產品不以成熟度分級掩蓋弱 family；發現系統性失敗就修正，或由使用者重新決定產品範圍。

## 目前產品決策

- 主要使用者是有滿等巧匠、願意逐步回報球色，希望學習高難製作或把即時計算交給工具的玩家。
- 正式支援裝備以有食物、藥與合理鑲嵌的 720／750 裝備為主；不足裝備提供誠實 best-effort。
- 產品只保留單一預設策略（code 中仍稱 `Balanced`）。先把它的球色安排、作業地板與滿品質能力做好；Stable／Aggressive 不進 UI、release gate 或後續 solver 迭代，除非預設策略足夠好後由使用者重新開啟支援。
- 玩家收益先看完成，再看已完成成品是否跨過有意義獎勵檔位；HQ／Master 的滿品質尾端優先於未跨檔的小幅平均增益。
- v1.12 是目前採用的 Rust solver 基礎；它已通過 completion-aware full-run gate，保留 v1.11 的主要一般收藏品收益並改善相對 v1.1 的完成。新策略、測試與改善只在 Rust，並以通用 mechanics／objective／condition／state signal 選擇。
- 目前的主策略候選是 `generic-craft-route-portfolio-v1.13.0`：讓所有 objectives 共用同一 portfolio，以球色當下真正增值的工作插隊，錯配且可延後的準備／資源工作讓位，之後恢復原 funded route；已支付 setup 且 consumer 可用時，沒有球色收益或完整 funded continuation 的工作不得棄置它。它曾通過含三個歷史 risk axes 的 50-family 結構 gate並取得候選版號；目前只以預設策略的完整結果決定是否取代 v1.12。
- F36／F46 bounded study 沒有找到可泛化且無 completion regression 的新 hard-quality selector；這條假說已按停止條件結案，不再追加相同 seeds。
- Web compute owner 已選定 Rust→WASM；stateful ABI 在兩個 development corpora 與 native v1.12 0 action／context mismatch。Node-WASM 支持工程方向，但 browser／mobile gate 尚未完成。
- 使用者已決定暫停 Web wiring，先持續投資 Rust solver optimization；只有形成可泛化、可重播且重要切片無退步的里程碑，才升數字版並準備下一次 overnight。
- 2026-08-29 的 route-aware learned candidate scorer 方向已重新啟動。它只替 Rust 已驗證合法的候選路線排序；先證明較深離線 teacher 勝過 v1.12，再生成大量訓練資料，不把 imitation accuracy 當 solver 改善。
- 第一輪 teacher preference smoke 已否決 top-1 hard label：16→32 與 32→64 都有 27／254 個多候選決策翻轉下一招，沒有因 samples 增加而下降；翻轉都在 paired uncertainty 或同分邊界內，因此下一步改用連續／pairwise／近似同分證據並直接驗 closed loop，不加大資料量掩蓋標籤問題。
- Raw teacher closed loop 中，32-sample 的 8／10 completion 沒被 64-sample 保留；baseline／64 都是 7／10。這否決直接把較多 samples 的 top-1 當強老師；下一個 bounded slice 只測 paired-uncertainty consensus／reference fallback，通過前不凍結 fresh labels 或啟動長跑。
- Paired-uncertainty consensus 也未通過：8／325 confident overrides 仍把完成檔位 21→19、滿品質 6→5。這個 learned-teacher 定義已依停止條件結案；不調更高 SE 門檻、不擴 seeds、不生產教材。實驗基礎保留，等新的 route-level player-outcome signal 才重開。
- 長跑只由使用者啟動；本 roadmap 不以 wall-clock 時程代替產品結果。

## 球色題目的玩家解法

策略先由遊戲題目推出，再用 evaluator 否證與比較；不得從少量勝敗反推技能規則。

1. **先保留交貨能力，不急著交貨。** 作業是必須兌現的地板；求解器要維持足夠的可靠完工能力，其餘耐久、CP 與回合優先追求品質獎勵。
2. **通常球負責讓工作就緒。** 通常球要實際推進製作，同時維持配方球色組可利用的工作：為大進展保留作業、為高品質／好兆頭保留品質與內靜、為高效保留尚可延後的高 CP 工作、為長持續保留有 consumer 的 buff 工作。不能為等球而停工，也不能在球到來前把所有對應工作做完。
3. **特殊球負責兌現最適工作。** 結實／高耐久優先比較會消耗耐久的工作，高效比較高 CP 的準備與恢復，安定比較原本有失敗風險的工作，大進展比較作業，長持續比較有後續 consumer 的 buff，高品質比較品質兌現；好兆頭則安排下一步高品質要接到的工作。這些是 work classes，不是固定技能表。
4. **已投資工作有倒數。** 掛上的 setup 與它的 consumer 是一份工作；consumer 已可用時，通常球上的無關單步分數不能讓求解器棄置投資。真正能吃到當前球色的工作可以插隊，完成後恢復原工作。
5. **球色組是 readiness 約束，不是未來預言。** Runtime 只知道配方可能出現哪些球，不知道下一顆；它應維護各類工作是否仍可兌現，而不是把假想未來球色直接加減 utility 或空等 RNG。

下一個架構工作是把這張工作清單做成 mechanics-derived `WorkReadiness`：描述剩餘作業、品質、資源與 buff consumer 對配方球色組的可用性。先寫出不依賴評測勝敗的 dominance／排程規則，再用 broad same-tape corpus 檢查它是否真的跨 family／seed 成立。

## 實施順序

### 1. 持續 Rust solver optimization

依 [active brief](../overnight_review_brief.md) 先完成 condition-aware route portfolio 的預設策略 64-seed overnight 評測。評測前不為 bounded 敗場追加規則；結果依完成地板、滿品質、objective utility、family × equipment × world 與成本判讀。不要把 objective 綁定舊 solver、不要把 future-condition reservation 做成逐步分數稅、不要另建 greedy 子求解器，也不要靠大量 Normal bridge 候選碰運氣；這些 broad 方向已造成 completion／滿品質退步並移除。只有完整結果通過，才考慮採用；若不通過，下一個大決策才回到 mechanics-derived `WorkReadiness`，定義 Normal 回合該準備哪種工作，不追少量敗場補洞。

### 2. 使用者恢復 Web 時接入已選定核心

依 [暫停交接](../archive/handoffs/rust-wasm-web-integration-paused-2026-08-30.md) 把 Rust/WASM main solver 接入 persistent Worker，建立 session reset／continue／deviate、3 秒 hard watchdog 與明確 failure metadata。接著交付獨立 Rust fast solver的 fixed-budget／0 policy-null gate；main＋fast 都成立後移除 frozen TypeScript runtime dependency。

## 每輪實驗契約

每輪先聲明玩家結果、可觀測 selector signal、比較身份、same-tape corpus、主要切片、practical effect、可接受代價與停止條件。實驗使用描述性 identity；只有經驗證的有意義推進才取得新數字版號。

專用行為必須由 mechanics、objective、condition 或 state signal 選擇。Recipe／equipment ID、seed、future RNG 與 evaluation label 不進 runtime。增加樣本只縮小已知效果的不確定性，不取代因果重播或結構修正。

### 主／快速求解器

交付：

- 主要求解器 3 秒 hard watchdog；
- 快速求解器 fixed budget、target p95 小於 100ms；
- valid nonterminal state 有 legal action 時 0 policy-null；
- bounded final selector；
- 每一步依 actual history 重試主要求解器；
- UI 明示主要／快速結果與 fallback 原因。

### 清理舊 runtime contract

在 implementation task 中乾淨移除：

- `development-preview` 等配方成熟度欄位與 UI；
- 舊 guide live fallback；
- 讓 frozen TS 看似仍是策略 owner 的 router／copy；
- 不再使用的 Mission controller 型別或 UI 預留。

## Release evidence

使用者最後 review 的 evidence package 至少包含：

- 50 families 的 mechanics／golden evidence；
- 預設策略的 family × equipment × assumed world matrix；
- progress-only delivery／meaningful quality；
- 四檔收藏品質量、hard-quality 滿品質與 HQ 機率 utility；
- 主／快速 solver illegal、policy-null、timeout 與 latency；
- 玩家偏離、undo、resync、reload 與 export；
- target-device browser／mobile UX；
- synthetic／assumption／live evidence 界線；
- 所有仍存在的 systematic failures。

只有使用者明確批准後才發布全部 432 配方。`README.md` 與部署另由使用者下指令，不屬本 roadmap 自動步驟。

## 研究停止規則

- 正確性、evidence identity 或明示 runtime 契約違反時，停止 promotion 並定位問題；個別配對損失按策略效果契約分析。
- 主要效果未達事前目標，或重要切片／成本的可信損失超出約定界線時，不直接切換；修正、停止實驗或交使用者決策，不以 aggregate 掩蓋。
- Effect interval 完整落入事前 immaterial band，停止該 hypothesis。
- Bound 仍結構性過鬆時停止擴樣本，先改善模型。
- Fixed-tape witness 只支持 route existence，不作 live success claim。
- 無法連到玩家可見 blocker 的 infrastructure／evidence work 不搶產品主線。
- Historical five-recipe threshold 或 exact-profile uplift 不作 milestone。

## Roadmap 更新規則

- 只保留目前 decision、next slices、gate 與 stop rule。
- Run 數字放 evaluator output；結論只連 evidence pointer。
- 完成的階段從本檔刪除或封存，不累積時間線。
- 每次更新同步 `current_state.md`，但不複製相同敘述到 `AGENTS.md`。
