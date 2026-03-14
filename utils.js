
const fs = require('fs')


function calcStreak(entries) {
    const completed = entries.filter(e => e.completed === 1)
    completed.sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
    let currentStreak = completed.length > 0 ? 1 : 0
    let bestStreak = currentStreak;

    for (let i = 0; i < completed.length - 1; i++) {
        const diff = new Date(completed[i].entry_date).getTime() - new Date(completed[i + 1].entry_date).getTime()
        if (diff === 86400000) {
            currentStreak++
            if (currentStreak > bestStreak) {
                bestStreak = currentStreak
            }
        } else {
            currentStreak = 1

        }

    }
    return { currentStreak, bestStreak }
}

function logError(error, context = '') {
    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] ${context}: ${error.message}\n${error.stack}\n\n`
    fs.appendFileSync('errors.log', line)
    console.error(line)
}

async function safe(ctx, fn, context = '') {
    try {
        await fn()
    } catch (e) {
        const ignoredErrors = [
            'message is not modified',
            'message to edit not found',
            'query is too old',
        ]

        const isIgnored = ignoredErrors.some(msg => e.message?.includes(msg))

        if (isIgnored) {
            return ctx.answerCbQuery().catch(() => { })
        }

        logError(e, context)
        ctx.reply('⚠️ Something went wrong. Try again.')
    }
}

function getToday(timezone = 'UTC') {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
}

function getYesterday(timezone = 'UTC') {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toLocaleDateString('en-CA', { timeZone: timezone })
}

function buildHeatmapText(habit, rangeEntries, allEntries, timezone = 'UTC') {
    const today = getToday(timezone)
    const days = []

    for (let i = 27; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push(d.toLocaleDateString('en-CA', { timeZone: timezone }))
    }

    const entryMap = {}
    rangeEntries.forEach(e => entryMap[e.entry_date] = e.completed)

    let grid = ''
    days.forEach((date, i) => {
        if (date in entryMap) {
            grid += entryMap[date] === 1 ? '🟩' : '🟥'
        } else {
            grid += date === today ? '🔲' : '⬜'
        }
        if ((i + 1) % 7 === 0) grid += '\n'
    })

    const entries28 = rangeEntries.filter(e => e.completed === 1).length
    const { currentStreak, bestStreak } = calcStreak(allEntries)

    return `💪 *${habit.name}* — last 4 weeks:\n\n${grid}\n🔥 Streak: ${currentStreak} | Best: ${bestStreak} | Done: ${entries28}/28`
}


module.exports = {
    calcStreak,
    logError,
    safe,
    buildHeatmapText,
    getToday,
    getYesterday
}

