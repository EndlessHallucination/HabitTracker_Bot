const habitRepo = require('./repositories/habitRepo.js')
const habitEntryRepo = require('./repositories/habitEntryRepo.js')
const fs = require('fs')
const { Markup } = require('telegraf')

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
        logError(e, context)
        ctx.reply('⚠️ Something went wrong. Try again.')
    }
}



module.exports = {
    calcStreak,
    logError,
    safe,

}

