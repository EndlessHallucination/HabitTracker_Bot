# 📓 BulletBot

A personal self-improvement tracker built as a Telegram bot — inspired by the analog bullet journal system, rebuilt for the digital age.

Started as a fun side project to ditch the physical notebook. Evolved into a full study project exploring bot architecture, database design, and soon — AI agents.

---

## ✨ Features

- 💪 **Habit Tracker** — add habits, mark them done daily, track streaks and best streaks
- 📈 **Metrics Tracker** — log anything measurable (weight, sleep, km run) and view avg/min/max stats
- 📓 **Journal** — write daily notes and capture your best moment of the day
- 📊 **Stats** — see completion counts, streaks, and metric trends at a glance
- ⌨️ **Full keyboard UI** — everything accessible via inline buttons, no commands needed

---

## 🛠 Tech Stack

- **Node.js** + **Telegraf** — bot framework
- **better-sqlite3** — local database
- **dotenv** — environment config

---

## 🚀 Run Locally

```bash
git clone https://github.com/yourusername/bulletbot
cd bulletbot
npm install
```

Create a `.env` file in the root:
```
BOT_TOKEN=your_telegram_bot_token_here
```

Then start the bot:
```bash
node bot.js
```

---

## 📌 Roadmap

- [x] Habit tracking with streaks
- [x] Metric logging with stats
- [x] Daily journal with best moment
- [x] `/cancel` command
- [ ] Rate limiting
- [ ] Weekly summary (scheduled message)
- [ ] Habit reminders with custom time
- [ ] Metric history chart
- [ ] Timezone support
- [ ] AI agent — analyzes your journal, streaks, and metrics to give personalized insights and motivation

---

## 🤖 Coming Soon — AI Agent

The next big feature: an AI agent that reads your habits, journal entries, and metric logs to give you personalized feedback, spot patterns, and keep you motivated. Each habit and metric will have a "why are you tracking this?" field so the AI can tailor its responses to your actual goals.

---

