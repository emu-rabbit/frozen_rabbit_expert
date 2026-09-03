# 資料來源、證據與授權規範

## 核心原則

每項會影響 mechanics、objective、condition 或對外 claim 的資料，都要能回答：來源是什麼、對應哪個 patch／identity、哪些是觀察、哪些是推論。

## 來源層級

1. **Official**：繁體中文版／全球版官方技能指南、patch notes、遊戲內 tooltip 與 Crafting Log。
2. **Canonical game data**：固定 revision 的 XIVAPI／EXD schema 與 WKS tables。
3. **Empirical**：玩家截圖、錄影、逐步 trace、可重播 session。
4. **Community／datamined analysis**：Teamcraft、社群資料庫與公開 source。
5. **Assumption**：為了敏感度或 POC 明示採用的假設。

較低層來源可以補足較高層沒有的資訊，但不能無標記地升格。來源衝突時保存差異與版本，不以文件語氣決定真偽。

## 必要 metadata

資料或 report 依用途保存：

- game／patch version、locale 與取得日期；
- canonical recipe、item、mission、job IDs；
- source URL、revision、schema 與 content hash；
- crafter stats、specialist／tool／buffs；
- initial state、action、success、condition 與 observed result；
- mechanics、solver、condition、catalog 與 session identities；
- assumption／empirical／official 分類；
- 可重播命令或 fixture。

Exact 欄位由 owning schema 決定，不為文件方便另造第二份 identity。

## Catalog identity

宇宙探索 catalog membership 同時檢查 WKS mission membership、expert recipe 與等級條件；不能只用單一 `IsExpert` flag。

Family identity 只包含會影響單件求解的 mechanics、condition set 與 objective semantics。不同名稱配方目前可共用 family evidence；若遊戲實證矛盾，先修正 family data，不直接加 recipe-specific policy。

Recipe identity、mission identity 與 display name 分開。雖然目前產品不處理跨件 Mission controller，仍保留來源中的 mission identity，避免日後無法追溯。

## Objective evidence

- Mechanics completion rule、recipe `qualityMax`、收藏價值四檔與 HQ 機率分開保存。
- `qualityMax` 是唯一品質上限；objective 只保存 outcome mode 與可驗證的品質 milestones。
- Hard `requiredQuality` 需要直接來源；它決定 mechanics completion，但 solver 的 hard-quality utility 仍追求 `qualityMax`。
- 一般收藏品保存 100／300／700／滿品質四檔；門檻比例或逐任務實值要標出 official、game data、玩家 UI、community 或 assumption 層級。
- Master 收藏品沒有一般四檔 evidence 時，只保存滿品質 milestone 並使用連續品質 utility，不發明中間 threshold。
- HQ 類不保存收藏品品質檔，使用 versioned HQ 機率曲線；50%／75%／100% protected floor 由曲線反查原始品質，曲線來源與不確定性必須可追溯。
- Family 共用 objective 前，確認單件 completion 與品質語意完全相同。

## Condition evidence

Condition availability、transition 與自然機率是三件事：

- Availability：此配方能否出現某 condition。
- Transition：forced／forbidden next state。
- Probability：自然出現機率與前一狀態依賴。

Assumed IID／Normal-heavy／opportunity-scarce worlds 只作敏感度。報告列出完整 transition matrix、sample size、patch、recipe grouping 與 confidence interval；有限樣本的零次觀察不等於機率為零。

## 玩家 trace

只收錄玩家主動提供或明確授權的資料。預設：

- 不讀 process memory、network packet 或 automation log；
- 匿名化角色、伺服器與非必要個資；
- 原始 evidence 和人工 transcription 分開；
- 修改、裁切或補值都留下 provenance；
- 能逐步重播並解釋 mismatch 後才升為 golden trace。

工作流見 [validate-golden-traces.md](../../workflows/validate-golden-traces.md)。

## Evidence 與 claim

| Evidence | 可以支持 | 不能支持 |
| --- | --- | --- |
| Unit／fixture | 實作符合已寫 contract | 遊戲 contract 本身正確 |
| Golden trace | 指定 patch／配方／裝備逐步一致 | 所有配方或自然成功率 |
| Synthetic matrix | 模型內敏感度與回歸 | 真實玩家分布 |
| Paired evaluation | 相同案例下的策略差異 | 未建模世界的保證 |
| Live／held-out traces | 限定 envelope 的實戰 claim | 全域最佳 |
| Relaxed bound | 某些 negative impossibility | 尚未排除即代表可達 |

## 漂移與更新

Patch、schema、formula、objective 或 source revision 改變時：

1. 更新 owning data／identity。
2. 重新生成 catalog 或 fixtures。
3. 跑 mechanics、parity 與受影響 evaluation。
4. 更新 `current_state.md` 的 evidence pointer；不把新 hash 複製到 stable docs。
5. 舊 evidence 若仍有回歸價值留在 versioned evaluation output，不能和新結果混算；已失效的操作文件由 Git history 保存。

## 授權

- 保存 URL、作者、license、revision 與修改狀態。
- 不因公開可讀就假設可複製。
- UI、圖示、攻略文字與 source implementation 在 reuse 前逐項確認權利。
- `THIRD_PARTY_NOTICES.md` 只在依賴或資產實際改變時更新。
