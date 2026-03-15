# 📓 BulletBot

> A personal self-improvement tracker built as a Telegram bot — inspired by the analog bullet journal system, rebuilt for the digital age.

Started as a fun side project to ditch the physical notebook. Evolved into a full study project exploring bot architecture, database design, and AI integration.

---

## ✨ Features

### 💪 Habit Tracker
- Add unlimited habits
- Mark as done / not done daily or for yesterday
- Undo tracking
- Rename and delete habits
- **Streak tracking** — current streak, best streak, 🌱 new streak celebrations
- **❄️ Freeze streaks** — protect your streak during vacations or sick days
- **📊 Heatmap** — visual 4-week emoji grid per habit (`🟩🟥⬜`)

### 📈 Metrics Tracker
- Create custom metrics with units (weight/kg, sleep/hrs, distance/km)
- Log values daily
- View avg / min / max stats
- Full history (last 10 entries)
- Rename and delete metrics

### 📓 Journal
- Write daily notes
- Capture your **best moment of the day**
- Paginated log viewer
- Edit and delete past entries

### 📅 Calendar
- Visual monthly calendar with emoji indicators
  - `✅` all habits done · `⚠️` some done · `📝` journaled · `📈` metric logged
- Tap any past day to view or edit habits, metrics, and journal

### ⏰ Reminders
- Per-habit reminders at custom times
- Per-metric reminders at custom times
- Daily journal reminder
- Smart — only fires if you haven't tracked yet that day

### 📊 Stats
- Habit completion counts and streaks
- Metric averages at a glance
- Weekly summary sent every Sunday automatically

### 🤖 AI Insight
- On-demand analysis powered by **Groq (LLaMA 3.3 70B)**
- Analyzes your habits, metrics, and journal entries
- Returns personalized bullet-point insights and one actionable suggestion
- Also delivered automatically with your weekly Sunday summary

### 📤 Export Data
- Export all your data as CSV files
- `habits.csv` · `metrics.csv` · `journal.csv`
- Sent directly to your Telegram chat

### 🌍 Timezone Support
- Set your local timezone (e.g. `Asia/Jerusalem`)
- All dates, reminders, and calendar views respect your local time

---

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js |
| Bot Framework | Telegraf |
| Database | better-sqlite3 (SQLite) |
| AI | Groq SDK (LLaMA 3.3 70B) |
| Scheduling | node-cron |
| Config | dotenv |

---

## 🚀 Run Locally

```bash
git clone https://github.com/yourusername/bulletbot
cd bulletbot
npm install
```

Create a `.env` file in the root:
```
BOT_TOKEN=your_telegram_bot_token
GROQ_API_KEY=your_groq_api_key
```

Start the bot:
```bash
node bot.js
```

> Get your free Groq API key at [console.groq.com](https://console.groq.com)

---

## 📁 Project Structure

```
bulletbot/
├── bot.js                  # Main bot — all handlers and cron jobs
├── schema.js               # SQLite schema initialization
├── db.js                   # Database connection
├── aiService.js            # Groq AI integration
├── utils.js                # Helpers — streaks, heatmap, safe handler
├── seed.js                 # Dev seed script (28 days of test data)
└── repositories/
    ├── userRepo.js
    ├── habitRepo.js
    ├── habitEntryRepo.js
    ├── metricRepo.js
    ├── metricEntryRepo.js
    └── journalRepo.js
```

---

## 📌 Changelog

- [x] Habit tracking with streaks and freeze
- [x] Metric logging with stats and history
- [x] Daily journal with best moment
- [x] Paginated journal log
- [x] Monthly calendar with indicators
- [x] Per-item reminders (habits, metrics, journal)
- [x] Weekly auto summary via cron
- [x] Timezone support
- [x] Streak heatmap (4-week emoji grid)
- [x] Export data as CSV
- [x] AI insight via Groq (on-demand + weekly)
- [x] Rate limiting
- [x] Graceful error handling

---

## 💡 About

Built entirely with vanilla Node.js and SQLite — no ORM, no web framework, no unnecessary abstractions. Every feature was designed to be the simplest possible implementation that actually works.