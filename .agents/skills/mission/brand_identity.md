# Frozen Rabbit Expert 品牌識別

## 品牌精神

- **系列名稱**：Frozen Rabbit（冷凍兔肉）。
- **由來**：源自開發者在 FFXIV 中的角色名稱「冷凍兔肉」。
- **人格**：友善且專業的朋友；懂遊戲、願意分享、不誇大能力。
- **Expert 的角色**：在高壓、資訊密集且帶隨機性的製作中，冷靜協助玩家整理 state、風險與下一步，而不是代替玩家遊玩。

## 語氣

- **友善**：說明自然、直接，不用冷冰冰的演算法術語壓過玩家需求。
- **可靠**：數據附來源，未知明說，錯誤可修正，估計不包裝成保證。
- **方便**：核心推薦與回報路徑短；詳細 reasoning 可展開，不阻塞下一步。
- **尊重玩家**：使用「可以考慮」、「目前推薦」、「若偏好穩定」等語句，不貶低不同風險偏好。

## 系列視覺 DNA

### 主色

延續 Tome／Workshop 共用 palette：

| Token | Value | 用途 |
| --- | --- | --- |
| `soft-green-50` | `#e8f5e9` | light background tint |
| `soft-green-300` | `#92c5b2` | subtle border／secondary accent |
| `soft-green-500` | `#52a890` | primary action／brand accent |
| `soft-green-600` | `#3e8f7a` | primary hover／active |
| `soft-green-900` | `#2d6a5a` | deep accent |
| `soft-green-950` | `#1b4137` | darkest green surface |
| `slate-950` | `#020617` | dark-mode base |

Expert／Cosmic 的狀態可使用 indigo、violet、cyan、amber 等**語意 accent**，但 soft-green 仍是品牌與 primary action 的主軸。condition colors 先服務辨識與可及性，不為追求品牌統一而讓不同狀態難以區分。

### 形狀與層級

- 冰晶兔／冰塊包裹兔肉是系列核心意象。
- 使用圓角卡片、克制陰影、適量 blur／translucency 與短微動畫。
- 資訊密集 surface 先確保掃描效率；裝飾不可降低 state、timer、warning 與 primary action 的辨識。
- light／dark mode 都需保留清楚對比，不在 dark mode 使用過亮的螢光 glow。

## Logo 與主要資產

- 姊妹專案的兔子與冰晶資產只作風格參考；未確認 license／owner 與實際用途前，不直接複製或生成新 logo。
- 若要建立 Expert 專屬主視覺，先由使用者確認用途、構圖與系列差異，再使用可用的 image generation workflow。
- 預設方向是保留相同冰晶兔角色，以 cosmic／expert crafting 的小型符號做區分，不把角色完全重設計。
- FFXIV 官方 icon、名稱與素材仍受 Square Enix 權利與素材使用規範約束；POC 優先使用文字、自製圖示或有明確授權的資產。

## 文案範例

- 「大進展讓本步進展技能更有效率，而且仍保留可靠收尾。」
- 「目前的球色機率仍是假設模型，只用來比較策略。」
- 「你使用了不同技能；已按實際結果重新計算。」
- 「預測 state 和遊戲不一致？可以快速修正，不會刪除先前紀錄。」
