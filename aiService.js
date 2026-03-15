require('dotenv').config()
const Groq = require('groq-sdk')

const habitRepo = require('./repositories/habitRepo.js')
const habitEntryRepo = require('./repositories/habitEntryRepo.js')
const metricRepo = require('./repositories/metricRepo.js')
const metricEntryRepo = require('./repositories/metricEntryRepo.js')
const journalRepo = require('./repositories/journalRepo.js')
const { calcStreak } = require('./utils.js')

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

function buildPrompt(userId) {
    const habits = habitRepo.getUserHabits(userId)
    const metrics = metricRepo.getUserMetrics(userId)
    const journals = journalRepo.getAllJournalEntries(userId).slice(0, 7)

    let prompt = `You are a personal coach analyzing someone's weekly habit and wellness data. Be concise, warm, and specific yet motivating. Give 4-5 bullet insights and one actionable suggestion.\n\n`

    prompt += `HABITS (last week):\n`
    habits.forEach(h => {
        const entries = habitEntryRepo.getHabitEntries(h.id)
        const { currentStreak, bestStreak } = calcStreak(entries)
        const recentDone = entries.slice(0, 7).filter(e => e.completed === 1).length
        prompt += `- ${h.name}: ${recentDone}/7 days this week, streak: ${currentStreak}, best: ${bestStreak}\n`
    })

    if (metrics.length > 0) {
        prompt += `\nMETRICS (recent):\n`
        metrics.forEach(m => {
            const stats = metricEntryRepo.getMetricStats(m.id)
            const history = metricEntryRepo.getMetricHistory(m.id, 7)
            const recent = history.map(e => e.value).join(', ')
            prompt += `- ${m.name} (${m.unit}): avg ${stats.avg_value?.toFixed(2) || '—'}, recent values: ${recent}\n`
        })
    }

    if (journals.length > 0) {
        prompt += `\nJOURNAL (last ${journals.length} entries):\n`
        journals.forEach(j => {
            prompt += `- ${j.entry_date}: ${j.note}${j.best_moment ? ` | best moment: ${j.best_moment}` : ''}\n`
        })
    }

    return prompt
}

async function getAIInsight(userId) {
    const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: buildPrompt(userId) }],
        model: 'llama-3.3-70b-versatile',
    })
    return completion.choices[0].message.content
}

module.exports = { getAIInsight }