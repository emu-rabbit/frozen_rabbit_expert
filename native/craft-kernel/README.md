# Frozen Rabbit Main Solver

Frozen Rabbit is a Rust library that recommends one crafting action at a time. Your application supplies the recipe, crafter, current craft state, and available conditions. After the action is used, report the actual result and ask for the next recommendation.

## Add the library

Use the Git repository as a Cargo dependency:

```toml
[dependencies]
frozen-rabbit-craft-kernel = { git = "https://github.com/emu-rabbit/frozen_rabbit_cosmic", package = "frozen-rabbit-craft-kernel" }
```

Pin a release tag or commit when you need reproducible builds.

For a local checkout:

```toml
[dependencies]
frozen-rabbit-craft-kernel = { path = "../frozen_rabbit_cosmic/native/craft-kernel" }
```

## Create a solver

Create `RecipeProfile` and `CrafterProfile` values from your application data, then import the public API from `main_solver`:

```rust
use frozen_rabbit_craft_kernel::main_solver::{
    AvailableConditions, MainSolverConfig, MainSolverObjective, MainSolverSession,
    MainSolverStatus, ObservedActionOutcome,
};

let objective = MainSolverObjective::HardQuality {
    quality_maximum: recipe.quality_max,
};
let config = MainSolverConfig::new(
    recipe,
    crafter,
    objective,
    AvailableConditions::ALL,
)?;
let mut solver = MainSolverSession::new(config);
```

Choose the objective that matches the recipe:

| Objective | Use it for |
| --- | --- |
| `HardQuality` | Full quality is required. |
| `CollectabilityTiers` | Four increasing collectability thresholds. The protected floor must be one of them. |
| `ContinuousCollectability` | Every additional point of quality has value. |
| `HqChance` | HQ chance, with a protected floor at 76%, 82%, or 100% of maximum quality, rounded up. |

Use `AvailableConditions::NORMAL_ONLY` when the recipe can only produce `Normal`. Use `AvailableConditions::from_conditions` for any other supported set.

## Request and advance recommendations

Call `recommend` with the current state:

```rust
let result = solver.recommend(&state)?;
```

When the result is `MainSolverStatus::Recommendation`, show or use its `action`. After the player acts, report the action that was actually used:

```rust
let transition = solver.observe(
    actual_action,
    ObservedActionOutcome {
        success,
        next_condition,
    },
)?;
state = transition.next_state;
```

The actual action may differ from the recommendation. The solver validates it and continues from the observed result.

Call `recommend` again only after reporting the previous result. Create one `MainSolverSession` per craft.

## Handle results

| Result | Meaning |
| --- | --- |
| `Recommendation` | Use the returned action and then report the actual result. |
| `Terminal` | The craft has completed or failed. |
| `ActionLimitReached` | The configured action limit was reached. |
| `Unavailable` | No recommendation is available for the current non-terminal state. |

If your application already calculates the complete next `CraftState`, use `observe_state` instead of `observe`.

Each recommendation includes `api_version` and `policy_version`. Save both when recording or exchanging sessions.

## Run the example

```powershell
cargo run --example main_solver --manifest-path native/craft-kernel/Cargo.toml
```

The complete example is in [`examples/main_solver.rs`](examples/main_solver.rs).

## License

Frozen Rabbit's original code is licensed under the MIT License. The Artisan-derived file keeps its BSD 3-Clause terms. See [`LICENSE`](../../LICENSE) and [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

## 中文說明

Frozen Rabbit 是一個 Rust 函式庫，每次提供一個製作技能建議。你的應用程式提供配方、巧匠能力、目前製作狀態與可出現的球色；技能使用後，再回報實際結果並取得下一個建議。

### 加入函式庫

在 Cargo 專案中使用 Git repository：

```toml
[dependencies]
frozen-rabbit-craft-kernel = { git = "https://github.com/emu-rabbit/frozen_rabbit_cosmic", package = "frozen-rabbit-craft-kernel" }
```

需要可重現建置時，請固定 release tag 或 commit。

使用本機 checkout 時：

```toml
[dependencies]
frozen-rabbit-craft-kernel = { path = "../frozen_rabbit_cosmic/native/craft-kernel" }
```

### 建立求解器

先依應用程式資料建立 `RecipeProfile` 與 `CrafterProfile`，再從 `main_solver` 匯入公開 API：

```rust
use frozen_rabbit_craft_kernel::main_solver::{
    AvailableConditions, MainSolverConfig, MainSolverObjective, MainSolverSession,
    MainSolverStatus, ObservedActionOutcome,
};

let objective = MainSolverObjective::HardQuality {
    quality_maximum: recipe.quality_max,
};
let config = MainSolverConfig::new(
    recipe,
    crafter,
    objective,
    AvailableConditions::ALL,
)?;
let mut solver = MainSolverSession::new(config);
```

依配方選擇目標：

| 目標 | 適用情境 |
| --- | --- |
| `HardQuality` | 必須達到滿品質。 |
| `CollectabilityTiers` | 有四個遞增的收藏價值門檻；保護下限必須是其中一個門檻。 |
| `ContinuousCollectability` | 每一點額外品質都有價值。 |
| `HqChance` | 追求 HQ 機率；保護下限設為最高品質的 76%、82% 或 100%，並向上取整。 |

配方只會出現普通球時，使用 `AvailableConditions::NORMAL_ONLY`；其他組合則使用 `AvailableConditions::from_conditions`。

### 取得並推進建議

使用目前狀態呼叫 `recommend`：

```rust
let result = solver.recommend(&state)?;
```

收到 `MainSolverStatus::Recommendation` 後，顯示或使用其中的 `action`。玩家操作後，回報實際使用的技能：

```rust
let transition = solver.observe(
    actual_action,
    ObservedActionOutcome {
        success,
        next_condition,
    },
)?;
state = transition.next_state;
```

實際技能可以不同於推薦技能。求解器會先驗證結果，再從實際狀態繼續。

回報上一個技能結果後，才能再次呼叫 `recommend`。每次製作建立一個 `MainSolverSession`。

### 處理回傳結果

| 結果 | 意義 |
| --- | --- |
| `Recommendation` | 使用建議技能，之後回報實際結果。 |
| `Terminal` | 製作已完成或失敗。 |
| `ActionLimitReached` | 已達設定的技能次數上限。 |
| `Unavailable` | 目前尚未結束，但沒有可用建議。 |

如果你的應用程式已自行算出完整的下一個 `CraftState`，請改用 `observe_state`。

每個建議都包含 `api_version` 與 `policy_version`。保存或交換製作紀錄時，請一併保存兩者。

### 執行範例

```powershell
cargo run --example main_solver --manifest-path native/craft-kernel/Cargo.toml
```

完整範例位於 [`examples/main_solver.rs`](examples/main_solver.rs)。

### 授權

Frozen Rabbit 原創程式碼採 MIT License。修改自 Artisan 的檔案仍保留 BSD 3-Clause 條款；詳情請見 [`LICENSE`](../../LICENSE) 與 [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)。
