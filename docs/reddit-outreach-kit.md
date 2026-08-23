# Bean Boom — Reddit 社区发帖套件

> 用途：Reddit 外链建设。⚠️ Reddit 反 self-promo 非常严格，**先在目标版养号 1-2 周**（评论、参与讨论），再发帖。发帖前必读各版 sidebar 规则。所有链接带 `utm_source=reddit&utm_medium=community&utm_campaign=<版名>`。

---

## 发帖优先级与节奏

| 优先级 | 版块 | 订阅量级 | 规则要点 | 发帖类型 |
|---|---|---|---|---|
| ★★★ | r/minesweeper | ~50k | 允许自创内容展示 | "我做了一个XX" 分享帖 |
| ★★★ | r/WebGames | ~100k | 允许网页游戏分享，需 [Game] 标签 | [Game] 标题帖 |
| ★★☆ | r/casualgames | ~30k | 允许休闲游戏推广（有 promo 日） | 分享帖 |
| ★★☆ | r/InternetIsBeautiful | ~17M | 必须非商业、惊艳向；广告秒删 | 谨慎：仅在玩法足够"惊艳"时发 |
| ★☆☆ | r/indiegames | ~200k | 有 Self-Promo Sunday 周日活动 | 周日发 |
| ★☆☆ | r/SideProject | ~100k | 允许项目展示 | 技术向分享帖 |

**节奏**：一次只发一个版，隔 2-3 天再发下一个。同一天多版同帖会被 Reddit 判 spam。

---

## 帖子 1：r/minesweeper（首发，最容易上热榜）

**标题：**
> I made a minesweeper where correct flags trigger chain explosions — been obsessed with testing it all week

**正文：**

> Hey everyone! Long-time lurker, first post here.
>
> I've played minesweeper since the Windows 95 days, and I always loved how the numbers force pure logic. But I kept wondering — what if playing *well* felt more explosive?
>
> So I built **Bean Boom** — a free browser minesweeper where:
>
> - **Flagging a mine correctly detonates it**, blasting the safe cells around it
> - Detonations **chain into other mines** for bigger booms
> - Quick reveals build a **combo multiplier** (3s window, up to 3x, 4x in FEVER mode at 20-combo)
> - Wins submit to server-verified leaderboards, so no fake times
>
> There's also a straight **Classic Mode** with no powerups — classic speed rankings for the purists. Same board, same rules, timer only.
>
> Play here (no download, no signup, works on mobile): https://bb.superzan.net/?utm_source=reddit&utm_medium=community&utm_campaign=minesweeper
>
> Difficulty settings are standard (9×9/10, 16×16/40, 16×30/99). Easy takes ~1 min per game, Hard is a proper marathon.
>
> Would love feedback on the chain mechanics — too gimmicky? Not enough? What's your flag vs no-flag style?
>
> **Tech notes for the curious:** vanilla JS + Canvas, deployed on Cloudflare Pages free tier, leaderboards in Workers KV, fully offline-capable PWA. Happy to answer build questions.

---

## 帖子 2：r/WebGames（带 [Game] 标签）

**标题：**
> [Game] Bean Boom — minesweeper where flags explode and combos stack to 4x (free, no signup)

**正文：**

> **Bean Boom** — a free browser minesweeper with an arcade scoring twist.
>
> **The hook:** correctly flagged mines *detonate*, chaining into surrounding mines and clearing cells in a blast radius. Fast reveals build a combo multiplier — hit 20 in a row and FEVER mode kicks the cap to 4x.
>
> - Two modes: **Egg Mode** (scoring/combos/chain blasts) and **Classic Mode** (pure traditional, speed leaderboards)
> - Three difficulties, server-verified global leaderboards
> - No download, no signup, mobile-friendly, installable as PWA (works offline)
> - 8 languages including Arabic (RTL)
>
> 🔗 Play: https://bb.superzan.net/?utm_source=reddit&utm_medium=community&utm_campaign=webgames
>
> Site also has a free tutorial library if you're new to minesweeper — number logic, 1-2-1 patterns, flagging styles: https://bb.superzan.net/blog
>
> Solo dev on Cloudflare's free tier. Ask me anything about the build!

---

## 帖子 3：r/InternetIsBeautiful（仅在有一张"哇"的动图时发）

**标题：**
> A minesweeper game where your flags are explosives

**正文（这个版偏好极简正文）：**

> Chain reactions, combo multipliers, and a mode for purists. Free, instant, no signup.
>
> https://bb.superzan.net/?utm_source=reddit&utm_medium=community&utm_campaign=internetisbeautiful

⚠️ 该版禁止任何盈利意图的内容。付费挑战功能不要在正文提。若被删，不要重发。

---

## 帖子 4：r/indiegames（Self-Promo Sunday 发）

**标题：**
> I spent months turning minesweeper into an arcade game — chain reactions, combos, and a free tier stack

**正文：**

> Solo dev here. **Bean Boom** is my take on modernizing minesweeper:
>
> - Correct flags detonate → chains → blast radius clears cells
> - Combo system with 3-second windows, FEVER at 20-combo (4x multiplier)
> - Classic Mode included for traditionalists
> - Global leaderboards, verified server-side (replay validation, no hacked times)
>
> **Stack:** vanilla JS + Canvas, Hono on Cloudflare Workers, KV storage, PayPal for optional skill challenges (full refund on completion — designed explicitly to not be gambling), Cron Workers for retries. Entire thing runs on Cloudflare's free tier.
>
> Play: https://bb.superzan.net/?utm_source=reddit&utm_medium=community&utm_campaign=indiegames
>
> Happy to go deep on any part of the architecture — the anti-cheat replay system was the most interesting problem.

---

## 帖子 5：r/SideProject（技术向）

**标题：**
> I shipped a full multiplayer-leaderboard game on Cloudflare's $0 tier — here's the architecture

**正文：**

> **The project:** Bean Boom — a minesweeper variant with chain-reaction scoring. Free to play: https://bb.superzan.net/?utm_source=reddit&utm_medium=community&utm_campaign=sideproject
>
> **The stack that costs nothing:**
>
> - **Cloudflare Pages** — static hosting + Hono edge functions
> - **Workers KV** — leaderboards, user data, site config
> - **Cron Workers** — retry queue for PayPal refund operations
> - **GA4** — analytics
> - **PayPal** — optional skill challenges (entry fee, auto full-refund on verified completion)
>
> **Interesting bits:**
>
> 1. **Anti-cheat without a game server:** wins are replayed and re-simulated server-side from a compact event log. Score/timing claims are validated against the replay before hitting the leaderboard.
> 2. **8 languages incl. RTL Arabic:** pure i18n dictionary approach, no framework.
> 3. **PWA offline:** custom service worker with app-shell caching; the game is fully playable offline, scores sync later.
> 4. **SEO as distribution:** 15 long-form articles + structured data (VideoGame/FAQ/BlogPosting schema) — Google is the biggest traffic source already.
>
> Happy to answer questions on any layer.

---

## 评论回复策略

- **头 2 小时黄金期**：每条评论必回（Reddit 算法看 engagement）
- 遇到"太商业化/广告"质疑：坦诚回应"solo dev, game is 100% free, the paid challenge is optional with full refund — just trying to cover hosting"（hosting 其实免费，可自嘲）
- 遇到 bug 反馈：当场感谢 + 承诺修复 + 修好后回帖更新（回帖会再次顶起）
- 不要用多个账号互相顶帖（Reddit shadowban 极严）

## 通用素材（随时可用）

- 一句话：*"Minesweeper, but your flags are explosives."*
- 备用动图：录制 30 秒"一旗引发全屏连锁"的 GIF（用 ScreenToGif），Reddit 帖子里贴图比纯链接点击率高 3-5 倍
