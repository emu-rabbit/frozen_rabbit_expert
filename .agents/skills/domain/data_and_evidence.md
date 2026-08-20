# 資料來源、證據與授權規範

## 核心原則

所有會影響 transition、recommendation、score 或 confidence 的資料都要可追溯、patch-aware、可替換。顯示名稱只用於 UI，不作 identity。

## 來源層級

1. **Official**：Lodestone patch notes、官方 action guide、遊戲內 tooltip／Crafting Log。
2. **Datamined／community database**：Teamcraft、FFXIV Console Games Wiki 等。
3. **Empirical**：玩家截圖、錄影、逐步 trace、統計研究。
4. **Assumption**：POC 為了可執行而暫採的假設。

低層來源可以補足高層來源未公開的資訊，但不得被重新命名成 official。來源衝突時保留兩者、指出差異並建立驗證任務。

## 必備 metadata

資料 record 至少保存：

```ts
interface SourceMetadata {
  sourceKind: 'official' | 'datamined' | 'empirical' | 'assumption';
  sourceUrl?: string;
  sourceRevision?: string;
  patch: string;
  verifiedAt: string;
  confidence: 'verified' | 'provisional' | 'unknown';
  notes?: string[];
}
```

empirical probability 另保存 sample size、sampling method、recipe／mission family、player setup 與 known bias。

## Identity

- mission、recipe、item、action、condition profile 使用 canonical numeric ID 或 versioned stable identifier。
- localized name 以 canonical ID 查出，不能反向由 zh-TW／en name 推斷 identity。
- 若 Teamcraft search index 的 ID 與 `data.itemId` 不同，沿資料載入程式確認 canonical field。
- recipe family 與 exact recipe 分開；不同 job／mission 可能共享 family behavior，但不得因名稱類似自動合併。

## Condition profile

```ts
interface ConditionProfile {
  id: string;
  patch: string;
  recipeFamilyId: string;
  sampledConditions: MaterialCondition[];
  forcedTransitions: Partial<Record<MaterialCondition, MaterialCondition>>;
  probabilities?: Partial<Record<MaterialCondition, number>>;
  source: SourceMetadata;
  sampleSize?: number;
}
```

- sampled set 與 reachable set 分開；forced transition 可以到達不在 random sampling list 的 condition。
- probability unknown 時可以省略，不能偷偷 fallback 到 generic rate。
- evaluation 可使用多組 plausible profiles 做 sensitivity analysis，但 UI 必須標示 assumption。
- 2026-08-11 handoff 指出 Auxesia WR.01 自然 condition rate 仍未知，這是 active research gap。

### 有限樣本下的 condition evidence

- 無足夠樣本分辨 IID 與自然 transition matrix 時，不選一張暫定比例表冒充真相；改保存多個 versioned plausible condition worlds，明示每個 world 的來源、假設、reachable／forced transitions 與用途。
- robust evaluation 應包含 recipe 可達條件下的 Normal-heavy、稀少有利球、全 Normal／長 Normal streak，以及必要的 transition-aware／adversarial variants；Good Omen 等已知 forced transition 仍按 mechanics 處理，不得與未知自然機率混為一談。全 Normal 是壓力測試，不是未有證據時自動採用的「真實世界」或品質最佳化目標。
- 玩家少量 Observe、正常製作 trace 與體感可用來界定 plausible range、抓明顯不合理模型或新增 stress case，但樣本不足時不得反推虛假精準機率。玩家影片中為等待有利球而使用 Observe，屬於策略結構 evidence：可支持研究 condition fishing／等待與 recovery option，但不單獨證明其出現率。缺少精準 transition table 本身不阻塞 recipe-scoped policy evaluation。

## 可替換的研究資料包

condition、equipment 與 score 資料必須是彼此獨立、可版本化、可重跑的 artifacts，而不是寫死在 policy 或 Rust core：

- `condition artifact`：sampled／reachable conditions、forced transitions、IID weights 或 transition rows、來源層級、patch、內容 hash 與 assumption 範圍。
- `equipment artifact`：CrafterProfile、可行 stat envelope、tool／food／medicine／specialist flags、取整邊界、來源層級與內容 hash。缺少完整 loadout database 時可使用來源受限的 plausible profiles，但不得任意組合出遊戲中不可能存在的面板。
- `score artifact`：已知完成條件、品質／收藏門檻、區間或 provisional utility、未知區段、來源層級與內容 hash。精確區間內曲線未知時，單件策略仍可比較 mechanics completion、品質、已知門檻、lower tail、手數與資源；不得把 provisional interpolation 改稱真實任務分數。

未來 Teamcraft、官方、社群研究或更多自然玩家 trace 提供較佳資料時，新增 artifact version、保留舊版本並重跑相同 recipe／equipment benchmark；不為替換資料來源重寫 mechanics 或求解器。舊結果必須繼續綁定原 artifact versions，不能與新版結果混報。

## 玩家 trace 的取得邊界

- trace 以玩家正常遊玩時的可選匿名 export 自然累積；不要求單一玩家為估計機率反覆抽球，或在限時／高前置成本任務中刻意命中特定品質。
- 少量 trace 的主要價值是逐步 mechanics cross-check、發現未建模狀態、真實偏離與 recovery case；除非樣本設計與數量足夠，不用來估計精確 transition probability 或實戰成功率。
- 沒有玩家完整 trace 的 recipe 可以先依官方／community mechanics、可替換 assumptions 與壓力測試研究或有限推出；產品 scope、condition confidence 與尚未實證的行為必須明示。

## Golden trace 作為 mechanics evidence

每份 trace 至少綁定：

- patch、mission ID、recipe ID／family；
- crafter stats、specialist、tool、food／medicine 的正規化結果與原始選項；
- initial state；
- 每步 previous condition、action、success／failure、next condition；
- 可觀測的 progress、quality、durability、CP、Inner Quiet、buffs；
- source／capture time／transcription note；
- mechanics version 與 replay result。

假數字不得放進 `golden-traces/`。未完成轉錄可放 research fixture，標示 incomplete，不作 test oracle。

## 漂移與更新

- patch、known issue、third-party branch 與資料檔都會漂移；便宜可重查時先重新驗證。
- 官方修正可能改變 condition behavior；data record 必須帶 patch／verifiedAt，舊 trace 不因更新而刪除。
- model 變更後重播舊 trace；若 mismatch，定位是 patch drift、data migration、formula、rounding 或 buff timing。

## 參考來源入口

完整 URL 清單保留在 repository 根的 `cosmic-expert-crafting-solver-poc-handoff.md`。實作時優先直接連到：

- official FFXIV crafting action guide／patch notes／known issues；
- Teamcraft simulator source 與 Expert Crafting Guide；
- recipe／mission community database；
- 玩家 empirical condition study；
- 使用者提供的遊戲內截圖、錄影與 traces。

不要只引用交接文件的一段摘要來宣稱 current fact；從原來源或遊戲內 evidence 重查。

## License／rights

- Teamcraft simulator 為 MIT；複製或修改 source 時保留 license 與 copyright notice。
- Raphael 為 Apache-2.0；可研究 simulator／pruning／tests，但 deterministic macro correctness 不外推至 stochastic policy。
- Thal's Tools、攻略網站與社群貼文若未確認 source license，只作行為／UX／資料 cross-check，不複製實作或長篇內容。
- FFXIV 名稱、icon 與 game data 受 Square Enix 權利與素材使用規範約束。POC 優先文字／自製 icon；公開前完成 legal／attribution checklist。
