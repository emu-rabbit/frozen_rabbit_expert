---
description: 依每項修改的意圖、可回退邊界與變更性質建立原子化 commit；描述使用繁體中文。
---

# Git 分類提交工作流

## 觸發條件

使用者要求 `add and commit all`、`commit all`、`全部提交`、`全部加進去並提交` 或等價指令時。

`all` 代表處理所有已確認 scope 內的變更，不代表忽略分類、model version、validation 或使用者／其他 Agent 的工作。

## 核心規則

- **意圖優先**：每個 commit 對應一個清楚意圖；先依意圖分組，再決定 `Docs:`、`Feat:`、`Fix:` 等 type。
- **原子性**：同一組共同完成一項結果，拆開不留下損壞或錯誤 contract；彼此可獨立回退的意圖應拆分。
- **保留邊界**：不確定來源或與任務無關的變更先摘要並確認，不偷偷混入。
- **計畫先行**：第一次 stage 前列出每組意圖、檔案／hunks、validation 與預計 message。
- **精準 stage**：使用明確 paths／hunks，不因 `all` 直接 `git add .`。
- **Model version gate**：mechanics、condition profile、policy、certificate、objective 或 session codec 變更，先依 development standards 檢查對應 version。
- **繁體中文 message**：header 使用 Pascal-case type，如 `Docs:`、`Feat:`、`Fix:`、`Test:`、`Chore:`；描述精準繁體中文。
- **不自行 push**：commit 不代表 push、tag、deploy 或 PR 授權。

## 步驟

1. 讀取 `operating_contract.md`、`development_standards.md` 與本 workflow。
2. `git status --short --branch`，列出 staged／unstaged／untracked。
3. 讀取 diff、檔案與 intent；確認使用者提供的 handoff／trace／asset 是否應提交。
4. 建立 commit plan，說明分組、依賴、validation 與 message。
5. 執行相關 test／typecheck／build／docs checks；model 變更先完成 version gate。
6. 逐組精準 `git add <paths>` 或 hunk stage。
7. 每個 commit 前檢查：
   - `git diff --cached --name-only`
   - `git diff --cached --stat`
   - `git diff --cached --check`
   - 重新閱讀 `git diff --cached`
8. 建立 commit。
9. 每次 commit 後 `git status --short`，確認剩餘變更符合下一組。
10. 最終回報 commit hash／意圖、validation、未提交變更與未執行的 external actions。

## 文件-only scope

文件初始化／治理可以是一個 `Docs:` commit，只要所有檔案共同建立同一套可用的 routing 與 project baseline。提交前另檢查：

- UTF-8 without BOM；
- relative links／routes 存在；
- 不同 owner 沒有競爭規則；
- snapshot 帶 `last_verified`／source；
- `git diff --check` 通過。
