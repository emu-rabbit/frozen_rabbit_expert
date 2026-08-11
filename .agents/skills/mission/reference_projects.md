# Frozen Rabbit 姊妹專案參考規範

## 專案血緣

Frozen Rabbit Expert 與下列同層 repository 是姊妹專案：

| Project | Path | 主要參考 |
| --- | --- | --- |
| Frozen Rabbit Tome | `C:\Users\User\Documents\GitHub\frozen_rabbit_tome` | solver／simulator、policy interaction、model versions、algorithm tests、worker／WASM 經驗 |
| Frozen Rabbit Workshop | `C:\Users\User\Documents\GitHub\frozen_rabbit_workshop` | 能工巧匠語境、資料來源、資訊密集工具 UI、四語系、系列視覺 |

已檢查快照：

- Tome：`staging@07a8680`，2026-08-04。
- Workshop：`staging@9ae4cc0`，2026-06-03。
- 這些 hash 是建立本文件時的 snapshot，不是永久 pinned dependency。參考前先重查目前 branch、status 與相關檔案。

## 可沿用的系列基線

- Vue 3、TypeScript、Vite、Tailwind CSS、PrimeVue、Vue I18n。
- Vitest unit tests 與 Playwright browser／E2E tests。
- `tw`、`cn`、`en`、`ja` 四語系結構。
- class-based dark mode、soft-green＋slate palette、圓角、克制陰影與冰晶兔品牌。
- UI presentation 與 composable／service／domain logic 分離。
- JSON import／export、local storage 與 scenario-aware model version 的可重現思維。

這些是**預設參考**，不是可以不經驗證複製的程式碼或相依版本。新 repo scaffold 時依當前 package compatibility、實際需求與授權重新確認。

## Tome：應帶走的經驗

### Policy interaction

- 玩家互動要分別詢問 action success、proc／condition、數值結果與 resync，不使用一個模糊 branch 取代不同觀測。
- 可參考 `src/utils/collectablePolicyInteraction.ts` 的問題拆分心智模型。

### Solve 與 materialization 分離

- core solve 快不代表 wrapper、policy tree 或 distribution materialization 快。
- 可參考 `.agents/roadmaps/collectable-solver-research-history.md`，分別量測 transition、training、runtime recommendation、UI 與 debug export。

### Policy graph 不等於顯示樹

- Tome 使用 `visited`／`nodeLimit` 防止無限制 materialization；Expert 更進一步，runtime 不建立完整樹，只保存 session path。
- 可參考 `src/utils/collectableWasmPolicy.ts` 的防護與 `src/config/modelVersions.ts` 的 scenario-aware versioning。

### TS／WASM 教訓

- Tome 的 TypeScript 與 AssemblyScript 是兩份需人工維持 parity 的實作。
- Expert Phase 0／1 不複製這個成本。TypeScript engine 先作唯一 oracle；只有離線 throughput 量測證明需要時，才移植 batch core，並建立 step-by-step parity。

## Workshop：應帶走的經驗

- 能工巧匠／物品／配方 identity 應使用 canonical ID，不可從 zh-TW 顯示名稱推斷。
- Teamcraft 等資料來源要沿實際設定與 branch 追蹤；參考 `src/services/dictionary.ts` 與 `.agents/skills/business/ffxiv_data_sources.md`，但不要把 Workshop schema 當 Expert 的正式 schema。
- 大量 state、資源與任務資訊要可快速掃描；Expert fast mode 更需避免 landing-page 式裝飾。
- 可參考 `tailwind.config.js`、`src/style.css`、`src/components/layout/Sidebar.vue` 與 modal／view 元件處理 dark mode、RWD 與 PrimeVue override 的方式。

## 不可盲目照搬

- Tome 的採集公式、collectable reward model、WASM memo、rotation shape 不屬於巧匠 mechanics。
- Workshop 的備料台、Universalis 定價、推薦筆記與材料展開不屬於即時 craft policy。
- 姊妹專案目前的 dependencies、CSS workaround、analytics、routing 或 hosting 不是本 repo 的既定事實。
- 不因系列一致性犧牲 Material Miracle fast mode 的輸入速度、condition 可辨識性與 recommendation latency。
- 第三方或姊妹專案資產、資料與 source 在複製前仍要檢查 license、attribution 與必要性。

## Agent 行為

涉及 UI、stack、i18n、資料 schema、solver、model versions 或效能時，主動以 `rg` 與 UTF-8 讀取姊妹專案的**目前實作**。引用時記錄 path／branch／commit 或 `verifiedAt`；若只是借用模式，改寫成 Expert 語境，不保留不相干產品假設。
