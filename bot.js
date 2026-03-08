require('dotenv').config()
require('./schema.js')

const { Telegraf, Markup } = require('telegraf')
const { message } = require('telegraf/filters')

const { calcStreak, safe, logError } = require('./utils.js')

const userRepo = require('./repositories/userRepo.js')
const habitRepo = require('./repositories/habitRepo.js')
const habitEntryRepo = require('./repositories/habitEntryRepo.js')
const journalRepo = require('./repositories/journalRepo.js')
const metricRepo = require('./repositories/metricRepo.js')
const metricEntryRepo = require('./repositories/metricEntryRepo.js')

const bot = new Telegraf(process.env.BOT_TOKEN)

const rateLimit = {}


bot.use((ctx, next) => {
    const id = ctx.from.id
    const now = Date.now()
    if (rateLimit[id] && now - rateLimit[id] < 1000) {
        return ctx.reply('⏳ Slow down!')
    }
    rateLimit[id] = now
    return next()
})

// ─── Session Store ────────────────────────────────────────────────────────────

const sessions = {}

function getSession(id) {
    if (!sessions[id]) sessions[id] = { step: null, data: {} }
    return sessions[id]
}

function clearSession(id) {
    sessions[id] = { step: null, data: {} }
}

// ─── Keyboards ────────────────────────────────────────────────────────────────

const mainMenuKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💪 Habits', 'HABITS_MENU')],
    [Markup.button.callback('📓 Journal', 'JOURNAL_MENU')],
    [Markup.button.callback('📈 Metrics', 'METRICS_MENU')],
    [Markup.button.callback('📊 Stats', 'SHOW_STATS')],
])

const backToMainKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')]
])

const habitsMenuKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Add Habit', 'ADD_HABIT')],
    [Markup.button.callback('✅ Track Habit', 'TRACK_HABIT')],
    [Markup.button.callback('✏️ Rename Habit', 'RENAME_HABIT')],
    [Markup.button.callback('🗑 Delete Habit', 'DELETE_HABIT')],
    [Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')],
])

const journalMenuKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✍️ Write Entry', 'WRITE_JOURNAL')],
    [Markup.button.callback('📖 View Log', 'VIEW_JOURNAL')],
    [Markup.button.callback('🗑 Delete Entry', 'DELETE_JOURNAL')],
    [Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')],
])

const metricsMenuKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Add Metric', 'ADD_METRIC')],
    [Markup.button.callback('📝 Log Metric', 'LOG_METRIC')],
    [Markup.button.callback('✏️ Rename Metric', 'RENAME_METRIC')],
    [Markup.button.callback('🗑 Delete Metric', 'DELETE_METRIC')],
    [Markup.button.callback('📊 Metric Stats', 'METRIC_STATS')],
    [Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')],
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToday() {
    return new Date().toISOString().split('T')[0]
}
function getYesterday() {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().split('T')[0]
}

function buildHabitButtons(habits, actionPrefix, backAction = 'HABITS_MENU') {
    const rows = habits.map(h =>
        [Markup.button.callback(h.name, `${actionPrefix}:${h.id}:${h.name}`)]
    )
    rows.push([Markup.button.callback('🔙 Back', backAction)])
    return Markup.inlineKeyboard(rows)
}

function buildMetricButtons(metrics, actionPrefix, backAction = 'METRICS_MENU') {
    const rows = metrics.map(m =>
        [Markup.button.callback(`${m.name} (${m.unit})`, `${actionPrefix}:${m.id}:${m.name}`)]
    )
    rows.push([Markup.button.callback('🔙 Back', backAction)])
    return Markup.inlineKeyboard(rows)
}

function buildJournalButtons(entries, actionPrefix, backAction = 'JOURNAL_MENU') {
    const rows = entries.map(e =>
        [Markup.button.callback(e.entry_date, `${actionPrefix}:${e.entry_date}`)]
    )
    rows.push([Markup.button.callback('🔙 Back', backAction)])
    return Markup.inlineKeyboard(rows)
}

function buildStatsText(userId) {
    const habits = habitRepo.getUserHabits(userId)
    const metrics = metricRepo.getUserMetrics(userId)

    if (habits.length === 0 && metrics.length === 0) {
        return '📊 No data yet. Start by adding habits or metrics!'
    }

    let text = '📊 *Your Stats:*\n\n'

    if (habits.length > 0) {
        text += '*Habits:*\n'
        habits.forEach(h => {
            const entries = habitEntryRepo.getHabitEntries(h.id)
            const { currentStreak, bestStreak } = calcStreak(entries)
            const done = entries.filter(e => e.completed === 1).length
            text += `• ${h.name}: ${done} days completed\n`
            text += `  🔥 Streak: ${currentStreak} | Best: ${bestStreak}\n\n`
        })
    }

    if (metrics.length > 0) {
        text += '\n*Metrics:*\n'
        metrics.forEach(m => {
            const stats = metricEntryRepo.getMetricStats(m.id)
            text += `• ${m.name}: avg ${stats.avg_value?.toFixed(2) || '—'} ${m.unit}\n`
        })
    }

    return text
}

function buildJournalLogText(entries) {
    if (entries.length === 0) return '📓 No journal entries yet.'

    let text = '📓 *Last 7 Journal Entries:*\n\n'
    entries.slice(0, 7).forEach(e => {
        text += `📅 *${e.entry_date}*\n`
        text += `📝 ${e.note}\n`
        if (e.best_moment) text += `✨ ${e.best_moment}\n`
        text += '\n'
    })
    return text
}

function showMainMenu(ctx, text = '🏠 Main Menu') {
    return ctx.reply(text, mainMenuKeyboard)
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.start((ctx) => {
    userRepo.createUser(ctx.from.id, ctx.from.first_name)
    clearSession(ctx.from.id)
    ctx.reply(
        `Hey ${ctx.from.first_name}! 👋 I'm your personal tracker bot.\nChoose an option below:`,
        mainMenuKeyboard
    )
})

bot.command('help', (ctx) => {
    ctx.reply(
        `📖 *Commands:*\n` +
        `/start — Open main menu\n` +
        `/help — Show this message\n\n` +
        `/cancel - Command to clear session from anywhere` +
        `*Habits:*\n` +
        `/addhabit <name> — Add a new habit\n` +
        `/track <name> — Mark a habit as done today\n` +
        `/stats — View habit & metric stats\n\n` +
        `*Journal:*\n` +
        `/journal <note> | <best moment> — Save today's journal entry\n\n` +
        `*Metrics:*\n` +
        `/addmetric <name> <unit> — Create a new metric (e.g. weight kg)\n` +
        `/logmetric <name> <value> — Log a value for a metric\n\n` +
        `💡 _Everything is also available via buttons from /start_`,
        { parse_mode: 'Markdown' }
    )
})

bot.command('addhabit', (ctx) => {
    const habitName = ctx.message.text.split(' ').slice(1).join(' ').trim()
    if (!habitName) return ctx.reply('Usage: /addhabit <habit name>')

    const user = userRepo.findByTelegramId(ctx.from.id)
    habitRepo.createHabit(user.id, habitName)
    ctx.reply(`Habit *${habitName}* added ✅`, { parse_mode: 'Markdown', ...backToMainKeyboard })
})

bot.command('track', (ctx) => {
    const habitName = ctx.message.text.split(' ').slice(1).join(' ').trim()
    if (!habitName) return ctx.reply('Usage: /track <habit name>')

    const user = userRepo.findByTelegramId(ctx.from.id)
    const habit = habitRepo.findHabitByName(user.id, habitName)
    if (!habit) return ctx.reply('Habit not found ❌')

    habitEntryRepo.trackHabit(habit.id, getToday(), 1)
    ctx.reply(`Tracked *${habitName}* for today ✅`, { parse_mode: 'Markdown', ...backToMainKeyboard })
})

bot.command('stats', (ctx) => {
    const user = userRepo.findByTelegramId(ctx.from.id)
    ctx.reply(buildStatsText(user.id), { parse_mode: 'Markdown', ...backToMainKeyboard })
})

bot.command('journal', (ctx) => {
    const user = userRepo.findByTelegramId(ctx.from.id)
    const input = ctx.message.text.split(' ').slice(1).join(' ')
    if (!input.includes('|')) return ctx.reply('Usage: /journal <note> | <best moment>')

    const [note, bestMoment] = input.split('|').map(s => s.trim())
    journalRepo.upsertJournalEntry(user.id, getToday(), note, bestMoment)
    ctx.reply('Journal saved 📓', backToMainKeyboard)
})

bot.command('addmetric', (ctx) => {
    const parts = ctx.message.text.split(' ').slice(1)
    if (parts.length < 2) return ctx.reply('Usage: /addmetric <name> <unit>')

    const [name, unit] = parts
    const user = userRepo.findByTelegramId(ctx.from.id)
    metricRepo.createMetric(user.id, name, unit)
    ctx.reply(`Metric *${name}* (${unit}) created ✅`, { parse_mode: 'Markdown', ...backToMainKeyboard })
})

bot.command('logmetric', (ctx) => {
    const parts = ctx.message.text.split(' ').slice(1)
    if (parts.length < 2) return ctx.reply('Usage: /logmetric <name> <value>')

    const [name, value] = parts
    const user = userRepo.findByTelegramId(ctx.from.id)
    const metric = metricRepo.findMetricByName(user.id, name)
    if (!metric) return ctx.reply('Metric not found ❌')

    metricEntryRepo.logMetric(metric.id, getToday(), parseFloat(value))
    ctx.reply(`Logged *${value} ${metric.unit}* for ${name} ✅`, { parse_mode: 'Markdown', ...backToMainKeyboard })
})

bot.command('cancel', (ctx) => {
    clearSession(ctx.from.id)
    showMainMenu(ctx, '❌ Cancelled.')
})
// ─── Main Menu ────────────────────────────────────────────────────────────────

bot.action('MAIN_MENU', (ctx) => {
    safe(ctx, () => {
        clearSession(ctx.from.id)
        ctx.editMessageText('🏠 Main Menu', mainMenuKeyboard)
    }, 'MAIN_MENU')
})

bot.action('SHOW_STATS', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        ctx.editMessageText(buildStatsText(user.id), { parse_mode: 'Markdown', ...backToMainKeyboard })
    }, 'SHOW_STATS')
})

// ─── Habits Menu ──────────────────────────────────────────────────────────────

bot.action('HABITS_MENU', (ctx) => {
    safe(ctx, () => {
        ctx.editMessageText('💪 Habits — what would you like to do?', habitsMenuKeyboard)
    }, 'HABITS_MENU')
})

bot.action('ADD_HABIT', (ctx) => {
    safe(ctx, () => {
        getSession(ctx.from.id).step = 'AWAITING_HABIT_NAME'
        ctx.editMessageText(
            '➕ Send me the name of the habit you want to add:',
            Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'HABITS_MENU')]])
        )
    }, 'ADD_HABIT')
})

bot.action('TRACK_HABIT', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const habits = habitRepo.getUserHabits(user.id)

        if (habits.length === 0) {
            return ctx.editMessageText('No habits yet. Add one first!', Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Habit', 'ADD_HABIT')],
                [Markup.button.callback('🔙 Back', 'HABITS_MENU')],
            ]))
        }

        ctx.editMessageText('✅ Which habit did you complete today?', buildHabitButtons(habits, 'DO_TRACK', 'HABITS_MENU'))
    }, 'TRACK_HABIT')
})

bot.action(/^DO_TRACK:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, habitName] = ctx.match
        ctx.editMessageText(
            `Did you complete *${habitName}*?`,
            {
                parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Done', `SET_HABIT:${habitId}:${habitName}:1:${getToday()}`),
                        Markup.button.callback('❌ Not Done', `SET_HABIT:${habitId}:${habitName}:0:${getToday()}`),
                        Markup.button.callback('📅 Yesterday', `SET_HABIT:${habitId}:${habitName}:1:${getYesterday()}`)
                    ],
                    [Markup.button.callback('🔙 Back', 'TRACK_HABIT')],
                ])
            }
        )
    }, 'DO_TRACK')
})

bot.action(/^SET_HABIT:(\d+):(.+):(\d):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, habitName, completed, date] = ctx.match
        const isDone = completed === '1'
        const label = date === getToday() ? 'today' : 'yesterday'

        habitEntryRepo.trackHabit(parseInt(habitId), date, isDone ? 1 : 0)
        const entries = habitEntryRepo.getHabitEntries(parseInt(habitId))
        const { currentStreak } = calcStreak(entries)

        const streakMsg = isDone
            ? (currentStreak === 1 ? `\n🌱 Starting a new streak!` : `\n🔥 Current streak: ${currentStreak} days!`)
            : ''

        ctx.editMessageText(
            isDone
                ? `✅ Marked *${habitName}* as done ${label}!${streakMsg}`
                : `❌ Marked *${habitName}* as not done ${label}.`,
            {
                parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Track Another', 'TRACK_HABIT')],
                    [Markup.button.callback('🔙 Habits Menu', 'HABITS_MENU')],
                ])
            }
        )
    }, 'SET_HABIT')
})

bot.action('RENAME_HABIT', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const habits = habitRepo.getUserHabits(user.id)

        if (habits.length === 0) {
            return ctx.editMessageText('No habits to rename.', habitsMenuKeyboard)
        }

        ctx.editMessageText('✏️ Which habit do you want to rename?', buildHabitButtons(habits, 'DO_RENAME_HABIT', 'HABITS_MENU'))
    }, 'RENAME_HABIT')
})

bot.action(/^DO_RENAME_HABIT:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, habitName] = ctx.match
        const session = getSession(ctx.from.id)
        session.step = 'AWAITING_HABIT_RENAME'
        session.data.habitId = parseInt(habitId)
        session.data.habitName = habitName

        ctx.editMessageText(
            `✏️ Send the new name for *${habitName}*:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'RENAME_HABIT')]]) }
        )
    }, 'DO_RENAME_HABIT')
})

bot.action('DELETE_HABIT', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const habits = habitRepo.getUserHabits(user.id)

        if (habits.length === 0) {
            return ctx.editMessageText('No habits to delete.', habitsMenuKeyboard)
        }

        ctx.editMessageText('🗑 Which habit do you want to delete?', buildHabitButtons(habits, 'CONFIRM_DEL_HABIT', 'HABITS_MENU'))
    }, 'DELETE_HABIT')
})

bot.action(/^CONFIRM_DEL_HABIT:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, habitName] = ctx.match
        ctx.editMessageText(
            `⚠️ Delete *${habitName}*? This will remove all its tracked entries too.`,
            {
                parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Yes, delete', `DO_DEL_HABIT:${habitId}:${habitName}`)],
                    [Markup.button.callback('❌ Cancel', 'DELETE_HABIT')],
                ])
            }
        )
    }, 'CONFIRM_DEL_HABIT')
})

bot.action(/^DO_DEL_HABIT:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, habitName] = ctx.match
        habitRepo.deleteHabit(parseInt(habitId))
        ctx.editMessageText(`🗑 *${habitName}* deleted.`, { parse_mode: 'Markdown', ...habitsMenuKeyboard })
    }, 'DO_DEL_HABIT')
})

// ─── Journal Menu ─────────────────────────────────────────────────────────────

bot.action('JOURNAL_MENU', (ctx) => {
    safe(ctx, () => {
        ctx.editMessageText('📓 Journal — what would you like to do?', journalMenuKeyboard)
    }, 'JOURNAL_MENU')
})

bot.action('WRITE_JOURNAL', (ctx) => {
    safe(ctx, () => {
        getSession(ctx.from.id).step = 'AWAITING_JOURNAL_NOTE'
        ctx.editMessageText(
            '✍️ *Journal Entry*\nSend your note for today:',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'JOURNAL_MENU')]]) }
        )
    }, 'WRITE_JOURNAL')
})

bot.action('JOURNAL_SKIP_BEST_MOMENT', (ctx) => {
    safe(ctx, () => {
        const session = getSession(ctx.from.id)
        const user = userRepo.findByTelegramId(ctx.from.id)
        journalRepo.upsertJournalEntry(user.id, getToday(), session.data.note, null)
        clearSession(ctx.from.id)
        ctx.editMessageText('Journal saved 📓', journalMenuKeyboard)
    }, 'JOURNAL_SKIP_BEST_MOMENT')
})

bot.action('VIEW_JOURNAL', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const entries = journalRepo.getAllJournalEntries(user.id)
        const text = buildJournalLogText(entries)
        ctx.editMessageText(text, {
            parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Journal Menu', 'JOURNAL_MENU')],
            ])
        })
    }, 'VIEW_JOURNAL')
})

bot.action('DELETE_JOURNAL', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const entries = journalRepo.getAllJournalEntries(user.id)

        if (entries.length === 0) {
            return ctx.editMessageText('No journal entries to delete.', journalMenuKeyboard)
        }

        ctx.editMessageText('🗑 Which entry do you want to delete?', buildJournalButtons(entries.slice(0, 10), 'CONFIRM_DEL_JOURNAL'))
    }, 'DELETE_JOURNAL')
})

bot.action(/^CONFIRM_DEL_JOURNAL:(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, date] = ctx.match
        ctx.editMessageText(
            `⚠️ Delete journal entry from *${date}*?`,
            {
                parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Yes, delete', `DO_DEL_JOURNAL:${date}`)],
                    [Markup.button.callback('❌ Cancel', 'DELETE_JOURNAL')],
                ])
            }
        )
    }, 'CONFIRM_DEL_JOURNAL')
})

bot.action(/^DO_DEL_JOURNAL:(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, date] = ctx.match
        const user = userRepo.findByTelegramId(ctx.from.id)
        journalRepo.deleteJournalEntry(user.id, date)
        ctx.editMessageText(`🗑 Entry from *${date}* deleted.`, { parse_mode: 'Markdown', ...journalMenuKeyboard })
    }, 'DO_DEL_JOURNAL')
})

// ─── Metrics Menu ─────────────────────────────────────────────────────────────

bot.action('METRICS_MENU', (ctx) => {
    safe(ctx, () => {
        ctx.editMessageText('📈 Metrics — what would you like to do?', metricsMenuKeyboard)
    }, 'METRICS_MENU')
})

bot.action('ADD_METRIC', (ctx) => {
    safe(ctx, () => {
        getSession(ctx.from.id).step = 'AWAITING_METRIC_NAME'
        ctx.editMessageText(
            '➕ Send the metric name (e.g. *weight*):',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'METRICS_MENU')]]) }
        )
    }, 'ADD_METRIC')
})

bot.action('LOG_METRIC', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const metrics = metricRepo.getUserMetrics(user.id)

        if (metrics.length === 0) {
            return ctx.editMessageText('No metrics yet. Add one first!', Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Metric', 'ADD_METRIC')],
                [Markup.button.callback('🔙 Back', 'METRICS_MENU')],
            ]))
        }

        ctx.editMessageText('📝 Which metric do you want to log?', buildMetricButtons(metrics, 'SELECT_LOG_METRIC'))
    }, 'LOG_METRIC')
})

bot.action(/^SELECT_LOG_METRIC:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName] = ctx.match
        const session = getSession(ctx.from.id)
        session.step = 'AWAITING_METRIC_VALUE'
        session.data.metricId = parseInt(metricId)
        session.data.metricName = metricName

        ctx.editMessageText(
            `📝 Send the value for *${metricName}*:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'METRICS_MENU')]]) }
        )
    }, 'SELECT_LOG_METRIC')
})

bot.action('RENAME_METRIC', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const metrics = metricRepo.getUserMetrics(user.id)

        if (metrics.length === 0) {
            return ctx.editMessageText('No metrics to rename.', metricsMenuKeyboard)
        }

        ctx.editMessageText('✏️ Which metric do you want to rename?', buildMetricButtons(metrics, 'DO_RENAME_METRIC'))
    }, 'RENAME_METRIC')
})

bot.action(/^DO_RENAME_METRIC:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName] = ctx.match
        const session = getSession(ctx.from.id)
        session.step = 'AWAITING_METRIC_RENAME'
        session.data.metricId = parseInt(metricId)
        session.data.metricName = metricName

        ctx.editMessageText(
            `✏️ Send the new name for *${metricName}*:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'RENAME_METRIC')]]) }
        )
    }, 'DO_RENAME_METRIC')
})

bot.action('DELETE_METRIC', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const metrics = metricRepo.getUserMetrics(user.id)

        if (metrics.length === 0) {
            return ctx.editMessageText('No metrics to delete.', metricsMenuKeyboard)
        }

        ctx.editMessageText('🗑 Which metric do you want to delete?', buildMetricButtons(metrics, 'CONFIRM_DEL_METRIC'))
    }, 'DELETE_METRIC')
})

bot.action(/^CONFIRM_DEL_METRIC:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName] = ctx.match
        ctx.editMessageText(
            `⚠️ Delete *${metricName}*? All logged entries will be lost.`,
            {
                parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Yes, delete', `DO_DEL_METRIC:${metricId}:${metricName}`)],
                    [Markup.button.callback('❌ Cancel', 'DELETE_METRIC')],
                ])
            }
        )
    }, 'CONFIRM_DEL_METRIC')
})

bot.action(/^DO_DEL_METRIC:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName] = ctx.match
        metricRepo.deleteMetric(parseInt(metricId))
        ctx.editMessageText(`🗑 *${metricName}* deleted.`, { parse_mode: 'Markdown', ...metricsMenuKeyboard })
    }, 'DO_DEL_METRIC')
})

bot.action('METRIC_STATS', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const metrics = metricRepo.getUserMetrics(user.id)

        if (metrics.length === 0) {
            return ctx.editMessageText('No metrics yet.', Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Metric', 'ADD_METRIC')],
                [Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')],
            ]))
        }

        let text = '📈 *Metric Stats:*\n\n'
        metrics.forEach(m => {
            const stats = metricEntryRepo.getMetricStats(m.id)
            text += `*${m.name}* (${m.unit})\n`
            text += `  Avg: ${stats.avg_value?.toFixed(2) || '—'}\n`
            text += `  Min: ${stats.min_value ?? '—'} | Max: ${stats.max_value ?? '—'}\n\n`
        })

        ctx.editMessageText(text, {
            parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Metrics Menu', 'METRICS_MENU')],
            ])
        })
    }, 'METRIC_STATS')
})

// ─── Text Handler (multi-step flows) ─────────────────────────────────────────

bot.on(message('text'), (ctx) => {
    const session = getSession(ctx.from.id)
    const raw = ctx.message.text
    const text = raw.trim()
    const user = userRepo.findByTelegramId(ctx.from.id)

    const nameSteps = ['AWAITING_HABIT_NAME', 'AWAITING_HABIT_RENAME', 'AWAITING_METRIC_NAME', 'AWAITING_METRIC_UNIT', 'AWAITING_METRIC_RENAME']

    if (nameSteps.includes(session.step)) {
        const sanitized = text.replace(/[^\w\s\-]/g, '').trim()
        if (!sanitized) return ctx.reply('⚠️ Name cannot be empty or contain only special characters.')
        if (sanitized.length > 50) return ctx.reply('⚠️ Name too long (max 50 chars).')
        Object.defineProperty(ctx, '_cleanText', { value: sanitized, writable: true })
    }

    const finalText = ctx._cleanText || text

    switch (session.step) {

        case 'AWAITING_HABIT_NAME': {
            if (habitRepo.findHabitByName(user.id, finalText)) {
                return ctx.reply('⚠️ A habit with this name already exists.')
            }
            habitRepo.createHabit(user.id, finalText)
            clearSession(ctx.from.id)
            ctx.reply(`Habit *${finalText}* added ✅`, { parse_mode: 'Markdown', ...habitsMenuKeyboard })
            break
        }

        case 'AWAITING_HABIT_RENAME': {
            if (habitRepo.findHabitByName(user.id, finalText)) {
                return ctx.reply('⚠️ A habit with this name already exists.')
            }
            const oldHabitName = session.data.habitName
            habitRepo.renameHabit(session.data.habitId, finalText)
            clearSession(ctx.from.id)
            ctx.reply(`✏️ Renamed *${oldHabitName}* → *${finalText}* ✅`, { parse_mode: 'Markdown', ...habitsMenuKeyboard })
            break
        }

        case 'AWAITING_JOURNAL_NOTE': {
            session.data.note = text
            session.step = 'AWAITING_JOURNAL_BEST_MOMENT'
            ctx.reply(
                '✨ What was the best moment of your day?',
                Markup.inlineKeyboard([[Markup.button.callback('⏭ Skip', 'JOURNAL_SKIP_BEST_MOMENT')]])
            )
            break
        }

        case 'AWAITING_JOURNAL_BEST_MOMENT': {
            journalRepo.upsertJournalEntry(user.id, getToday(), session.data.note, text)
            clearSession(ctx.from.id)
            ctx.reply('Journal saved 📓', journalMenuKeyboard)
            break
        }

        case 'AWAITING_METRIC_NAME': {
            if (metricRepo.findMetricByName(user.id, finalText)) {
                return ctx.reply('⚠️ A metric with this name already exists.')
            }
            session.data.metricName = finalText
            session.step = 'AWAITING_METRIC_UNIT'
            ctx.reply(
                `Got it! Now send the unit for *${finalText}* (e.g. kg, km, hrs):`,
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'METRICS_MENU')]]) }
            )
            break
        }

        case 'AWAITING_METRIC_UNIT': {
            metricRepo.createMetric(user.id, session.data.metricName, finalText)
            const metricName = session.data.metricName
            clearSession(ctx.from.id)
            ctx.reply(`Metric *${metricName}* (${finalText}) created ✅`, { parse_mode: 'Markdown', ...metricsMenuKeyboard })
            break
        }

        case 'AWAITING_METRIC_VALUE': {
            const value = parseFloat(text)
            if (isNaN(value)) return ctx.reply('⚠️ Please send a valid number.')

            const metric = metricRepo.findMetricById(session.data.metricId)
            metricEntryRepo.logMetric(session.data.metricId, getToday(), value)
            const loggedMetricName = session.data.metricName
            clearSession(ctx.from.id)
            ctx.reply(
                `Logged *${value} ${metric?.unit || ''}* for ${loggedMetricName} ✅`,
                { parse_mode: 'Markdown', ...metricsMenuKeyboard }
            )
            break
        }

        case 'AWAITING_METRIC_RENAME': {
            if (metricRepo.findMetricByName(user.id, finalText)) {
                return ctx.reply('⚠️ A metric with this name already exists.')
            }
            const oldMetricName = session.data.metricName
            metricRepo.renameMetric(session.data.metricId, finalText)
            clearSession(ctx.from.id)
            ctx.reply(`✏️ Renamed *${oldMetricName}* → *${finalText}* ✅`, { parse_mode: 'Markdown', ...metricsMenuKeyboard })
            break
        }

        default: {
            showMainMenu(ctx, 'Use the menu below to get started 👇')
            break
        }
    }
})

// ─── Launch ───────────────────────────────────────────────────────────────────

bot.launch()
console.log('Bot is running...')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))