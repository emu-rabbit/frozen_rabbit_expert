# Frozen Rabbit's Cosmic 品牌識別

## 品牌精神

- **系列名稱**：Frozen Rabbit（冷凍兔肉）。
- **由來**：源自開發者在 FFXIV 中的角色名稱「冷凍兔肉」。
- **人格**：友善且專業的朋友；懂遊戲、願意分享、不誇大能力。
- **Cosmic 的角色**：在宇宙探索高難度製作的高壓、資訊密集與隨機情境中，冷靜協助玩家整理 state、風險與下一步，而不是代替玩家遊玩。

## 語氣

- **友善**：說明自然、直接，不用冷冰冰的演算法術語壓過玩家需求。
- **可靠**：數據附來源，未知明說，錯誤可修正，估計不包裝成保證。
- **方便**：核心推薦與回報路徑短；詳細 reasoning 可展開，不阻塞下一步。
- **尊重玩家**：使用「可以考慮」、「目前推薦」等語句，清楚說明取捨，不貶低玩家自行選擇的合法走法。

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

- Cosmic 正式 Logo 位於 `apps/web/src/assets/logo.png`，以 Tome／Workshop 作系列風格參考，由使用者確認後生成新的「冰塊中的兔排＋克制星芒與行星環」構圖；不是直接複製姊妹站肉塊。
- Logo 使用真正透明的背景、明亮冰藍與粉紅主色；冰塊的飽和度只做輕微收斂，透明感與藍色外框強度需和 Tome／Workshop 同系列，在 32px Sidebar／favicon 尺寸仍保留清楚輪廓。不得把透明棋盤格烘進像素，也不加文字或深色宇宙底。
- 後續變體須保留冰塊、肉塊與系列線條語言，不以一般兔角色、行星或太空場景取代核心標誌。
- FFXIV 官方 icon、名稱與素材仍受 Square Enix 權利與素材使用規範約束；POC 優先使用文字、自製圖示或有明確授權的資產。

## 文案範例

- 「大進展讓本步進展技能更有效率，而且仍保留可靠收尾。」
- 「目前的球色機率仍是假設模型，只用來比較策略。」
- 「你使用了不同技能；已按實際結果重新計算。」
- 「預測 state 和遊戲不一致？可以快速修正，不會刪除先前紀錄。」
