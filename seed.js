require('dotenv').config()
require('./schema.js')

const db = require('./db')
const userRepo = require('./repositories/userRepo.js')
const habitRepo = require('./repositories/habitRepo.js')
const habitEntryRepo = require('./repositories/habitEntryRepo.js')
const metricRepo = require('./repositories/metricRepo.js')
const metricEntryRepo = require('./repositories/metricEntryRepo.js')
const journalRepo = require('./repositories/journalRepo.js')

// ─── Config ───────────────────────────────────────────────────────────────────
const TELEGRAM_ID = 199040819  // ← replace with your actual Telegram ID
const DAYS = 28

// ─── Setup ────────────────────────────────────────────────────────────────────
userRepo.createUser(TELEGRAM_ID, 'TestUser')
const user = userRepo.findByTelegramId(TELEGRAM_ID)

habitRepo.createHabit(user.id, 'Running')
habitRepo.createHabit(user.id, 'Reading')
const habits = habitRepo.getUserHabits(user.id)

metricRepo.createMetric(user.id, 'Weight', 'kg')
metricRepo.createMetric(user.id, 'Sleep', 'hrs')
const metrics = metricRepo.getUserMetrics(user.id)

// ─── Fill days ────────────────────────────────────────────────────────────────
for (let i = DAYS; i >= 1; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toLocaleDateString('en-CA')

    // Habits — random completion with ~80% done rate
    habits.forEach(h => {
        const completed = Math.random() > 0.2 ? 1 : 0
        habitEntryRepo.trackHabit(h.id, date, completed)
    })

    // Metrics — random realistic values
    metricEntryRepo.logMetric(metrics[0].id, date, (75 + Math.random() * 5).toFixed(1))
    metricEntryRepo.logMetric(metrics[1].id, date, (6 + Math.random() * 3).toFixed(1))

    // Journal — every other day
    if (i % 2 === 0) {
        journalRepo.upsertJournalEntry(user.id, date, `Journal note for ${date}`, `Best moment on ${date}`)
    }
}

console.log(`✅ Seeded ${DAYS} days of data for user ${TELEGRAM_ID}`)