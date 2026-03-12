require('dotenv').config()
require('./schema.js')

const { Telegraf, Markup } = require('telegraf')
const { message } = require('telegraf/filters')

const { calcStreak, safe, logError } = require('./utils.js')

const cron = require('node-cron')

const userRepo = require('./repositories/userRepo.js')
const habitRepo = require('./repositories/habitRepo.js')
const habitEntryRepo = require('./repositories/habitEntryRepo.js')
const journalRepo = require('./repositories/journalRepo.js')
const metricRepo = require('./repositories/metricRepo.js')
const metricEntryRepo = require('./repositories/metricEntryRepo.js')


// ─── Env Validation ───────────────────────────────────────────────────────────

const REQUIRED_ENV = ['BOT_TOKEN']
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`❌ Missing required env variable: ${key}`)
        process.exit(1)
    }
}

const bot = new Telegraf(process.env.BOT_TOKEN)

const rateLimit = {}

setInterval(() => {
    const now = Date.now()
    for (const id in rateLimit) {
        if (now - rateLimit[id] > 60_000) {
            delete rateLimit[id]
        }
    }
}, 5 * 60 * 1000)


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
    [Markup.button.callback('📅 Calendar', 'CALENDAR_TODAY')],
    [Markup.button.callback('⏰ Reminders', 'REMINDERS_MENU')],
])

const backToMainKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')]
])


function buildHabitsMenuKeyboard(userId) {
    const habits = habitRepo.getUserHabits(userId)
    const hasHabits = habits.length > 0
    const rows = [
        [Markup.button.callback('➕ Add Habit', 'ADD_HABIT')],
    ]
    if (hasHabits) {
        rows.push([Markup.button.callback('✅ Track Habit', 'TRACK_HABIT')])
        rows.push([Markup.button.callback('✏️ Rename Habit', 'RENAME_HABIT')])
        rows.push([Markup.button.callback('🗑 Delete Habit', 'DELETE_HABIT')])
    }
    rows.push([Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')])
    return Markup.inlineKeyboard(rows)
}


function buildJournalMenuKeyboard(userId) {
    const entries = journalRepo.getAllJournalEntries(userId)
    const hasEntries = entries.length > 0
    const rows = [
        [Markup.button.callback('✍️ Write Entry', 'WRITE_JOURNAL')],
    ]
    if (hasEntries) {
        rows.push([Markup.button.callback('📖 View Log', 'VIEW_JOURNAL:0')])
        rows.push([Markup.button.callback('🗑 Delete Entry', 'DELETE_JOURNAL')])
    }
    rows.push([Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')])
    return Markup.inlineKeyboard(rows)
}

function buildMetricsMenuKeyboard(userId) {
    const metrics = metricRepo.getUserMetrics(userId)
    const hasMetrics = metrics.length > 0
    const rows = [
        [Markup.button.callback('➕ Add Metric', 'ADD_METRIC')],
    ]
    if (hasMetrics) {
        rows.push([Markup.button.callback('📝 Log Metric', 'LOG_METRIC')])
        rows.push([Markup.button.callback('✏️ Rename Metric', 'RENAME_METRIC')])
        rows.push([Markup.button.callback('🗑 Delete Metric', 'DELETE_METRIC')])
        rows.push([Markup.button.callback('📊 Metric Stats', 'METRIC_STATS')])
        rows.push([Markup.button.callback('📋 View History', 'METRIC_HISTORY')])

    }
    rows.push([Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')])
    return Markup.inlineKeyboard(rows)
}

const remindersMenuKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💪 Habit Reminders', 'HABIT_REMINDERS')],
    [Markup.button.callback('📈 Metric Reminders', 'METRIC_REMINDERS')],
    [Markup.button.callback('📓 Journal Reminder', 'JOURNAL_REMINDER')],
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

function buildMetricHistoryText(metricName, unit, entries) {
    if (!entries.length) return `No entries yet for ${metricName}`
    let text = `📈 *${metricName} (${unit}) — Last ${entries.length} entries:*\n\n`
    entries.forEach(e => {
        text += `📅 ${e.entry_date}: *${e.value} ${unit}*\n`
    })
    return text
}

// ─── Calendar Helpers ─────────────────────────────────────────────────────────

function buildCalendarKeyboard(userId, year, month) {
    const habits = habitRepo.getUserHabits(userId)
    const metrics = metricRepo.getUserMetrics(userId)

    const daysInMonth = new Date(year, month, 0).getDate()
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
    // Adjust so week starts Monday (0=Mon...6=Sun)
    const offset = (firstDayOfWeek + 6) % 7

    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })
    const today = getToday()

    // Header row
    const rows = []
    rows.push([Markup.button.callback(`📅 ${monthName} ${year}`, 'NOOP')])
    rows.push(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => Markup.button.callback(d, 'NOOP')))

    // Build day grid
    let week = []
    // Pad empty days before month starts
    for (let i = 0; i < offset; i++) {
        week.push(Markup.button.callback(' ', 'NOOP'))
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const isFuture = dateStr > today
        const isToday = dateStr === today

        let label = String(day)
        if (isToday) label = `[${day}]`

        if (!isFuture) {
            // Check data existence
            const hasJournal = !!journalRepo.getJournalByDate(userId, dateStr)
            const habitsDone = habits.filter(h => {
                const e = habitEntryRepo.getHabitEntrieDate(h.id, dateStr)
                return e && e.completed === 1
            }).length
            const hasMetric = metrics.some(m => !!metricEntryRepo.getMetricEntryDate(m.id, dateStr))

            const allDone = habits.length > 0 && habitsDone === habits.length
            const someDone = habitsDone > 0 && habitsDone < habits.length

            let indicator = ''
            if (allDone) indicator += '✅'
            else if (someDone) indicator += '⚠️'
            if (hasJournal) indicator += '📝'
            if (hasMetric) indicator += '📈'

            if (indicator) label = `${day}${indicator}`
        }

        const action = isFuture ? 'NOOP' : `CAL_DAY:${dateStr}`
        week.push(Markup.button.callback(label, action))

        if (week.length === 7) {
            rows.push(week)
            week = []
        }
    }

    // Pad last week
    if (week.length > 0) {
        while (week.length < 7) week.push(Markup.button.callback(' ', 'NOOP'))
        rows.push(week)
    }

    // Prev / Next navigation
    let prevYear = year, prevMonth = month - 1
    if (prevMonth === 0) { prevMonth = 12; prevYear-- }
    let nextYear = year, nextMonth = month + 1
    if (nextMonth === 13) { nextMonth = 1; nextYear++ }

    rows.push([
        Markup.button.callback('◀️ Prev', `CALENDAR:${prevYear}-${String(prevMonth).padStart(2, '0')}`),
        Markup.button.callback('Next ▶️', `CALENDAR:${nextYear}-${String(nextMonth).padStart(2, '0')}`),
    ])
    rows.push([Markup.button.callback('🔙 Main Menu', 'MAIN_MENU')])

    return Markup.inlineKeyboard(rows)
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



function buildJournalLogText(entries, page, totalPages) {
    if (entries.length === 0) return '📓 No journal entries yet.'
    let text = `📓 *Journal Entries (page ${page + 1}/${totalPages}):*\n\n`
    entries.forEach(e => {
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
        `/cancel — Clear session from anywhere\n\n` +
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

// ─── No Operation ────────────────────────────────────────────────────────────────

bot.action('NOOP', (ctx) => ctx.answerCbQuery())

// ─── Habits Menu ──────────────────────────────────────────────────────────────

bot.action('HABITS_MENU', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        ctx.editMessageText('💪 Habits — what would you like to do?', buildHabitsMenuKeyboard(user.id))
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
        const today = getToday()
        const existing = habitEntryRepo.getHabitEntrieDate(parseInt(habitId), today)

        if (existing) {
            const statusLabel = existing.completed === 1 ? '✅ Done' : '❌ Not Done'
            return ctx.editMessageText(
                `*${habitName}* already tracked today as *${statusLabel}*`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Undo', `UNDO_TRACK_HABIT:${habitId}:${today}`)],
                        [Markup.button.callback('🔙 Back', 'TRACK_HABIT')],
                    ])
                }
            )
        }

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
                    [Markup.button.callback('↩️ Undo Track', `UNDO_TRACK_HABIT:${habitId}:${date}`)],
                    [Markup.button.callback('✅ Track Another', 'TRACK_HABIT')],
                    [Markup.button.callback('🔙 Habits Menu', 'HABITS_MENU')],
                ])
            }
        )
    }, 'SET_HABIT')
})

bot.action(/^UNDO_TRACK_HABIT:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, date] = ctx.match
        habitEntryRepo.deleteHabitEntry(parseInt(habitId), date)
        const user = userRepo.findByTelegramId(ctx.from.id)

        ctx.editMessageText(`Habit untracked.`, { parse_mode: 'Markdown', ...buildHabitsMenuKeyboard(user.id) })

    }, 'UNDO_TRACK_HABIT')
})


bot.action('RENAME_HABIT', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const habits = habitRepo.getUserHabits(user.id)

        if (habits.length === 0) {
            return ctx.editMessageText('No habits to rename.', buildHabitsMenuKeyboard(user.id))
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
            return ctx.editMessageText('No habits to delete.', buildHabitsMenuKeyboard(user.id))
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
        const user = userRepo.findByTelegramId(ctx.from.id)
        habitRepo.deleteHabit(parseInt(habitId))
        ctx.editMessageText(`🗑 *${habitName}* deleted.`, { parse_mode: 'Markdown', ...buildHabitsMenuKeyboard(user.id) })
    }, 'DO_DEL_HABIT')
})

// ─── Journal Menu ─────────────────────────────────────────────────────────────

bot.action('JOURNAL_MENU', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        ctx.editMessageText('📓 Journal — what would you like to do?', buildJournalMenuKeyboard(user.id))
    }, 'JOURNAL_MENU')
})

bot.action('WRITE_JOURNAL', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const today = getToday()
        const existing = journalRepo.getJournalByDate(user.id, today)

        if (existing) {
            return ctx.editMessageText(
                `📓 Already journaled today:\n\n📝 ${existing.note}${existing.best_moment ? `\n✨ ${existing.best_moment}` : ''}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Undo (delete entry)', `DO_DEL_JOURNAL:${today}`)],
                        [Markup.button.callback('🔙 Back', 'JOURNAL_MENU')],
                    ])
                }
            )
        }

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
        const journalDate = session.data.selectedDate || getToday()
        journalRepo.upsertJournalEntry(user.id, journalDate, session.data.note, null)
        clearSession(ctx.from.id)
        ctx.editMessageText('Journal saved 📓', buildJournalMenuKeyboard(user.id))
    }, 'JOURNAL_SKIP_BEST_MOMENT')
})
bot.action(/^VIEW_JOURNAL:(\d+)$/, (ctx) => {
    safe(ctx, () => {
        const page = parseInt(ctx.match[1])
        const user = userRepo.findByTelegramId(ctx.from.id)
        const entries = journalRepo.getAllJournalEntries(user.id)

        const pageSize = 5
        const totalPages = Math.ceil(entries.length / pageSize) || 1
        const slice = entries.slice(page * pageSize, (page + 1) * pageSize)
        const text = buildJournalLogText(slice, page, totalPages)

        const navButtons = []
        if (page > 0) navButtons.push(Markup.button.callback('⬅️ Prev', `VIEW_JOURNAL:${page - 1}`))
        if (page < totalPages - 1) navButtons.push(Markup.button.callback('➡️ Next', `VIEW_JOURNAL:${page + 1}`))

        const rows = []
        if (navButtons.length > 0) rows.push(navButtons)
        rows.push([Markup.button.callback('🔙 Journal Menu', 'JOURNAL_MENU')])

        ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(rows)
        })
    }, 'VIEW_JOURNAL')
})

bot.action('DELETE_JOURNAL', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const entries = journalRepo.getAllJournalEntries(user.id)

        if (entries.length === 0) {
            return ctx.editMessageText('No journal entries to delete.', buildJournalMenuKeyboard(user.id))
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
        ctx.editMessageText(`🗑 Entry from *${date}* deleted.`, { parse_mode: 'Markdown', ...buildJournalMenuKeyboard(user.id) })
    }, 'DO_DEL_JOURNAL')
})

// ─── Metrics Menu ─────────────────────────────────────────────────────────────

bot.action('METRICS_MENU', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        ctx.editMessageText('📈 Metrics — what would you like to do?', buildMetricsMenuKeyboard(user.id))
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
        const today = getToday()
        const session = getSession(ctx.from.id)

        session.step = 'AWAITING_METRIC_VALUE'
        session.data.metricId = parseInt(metricId)
        session.data.metricName = metricName
        const existing = metricEntryRepo.getMetricEntryDate(parseInt(metricId), today)

        if (existing) {
            return ctx.editMessageText(
                `*${metricName}* already logged today: *${existing.value} ${existing.unit || ''}*`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Undo', `UNDO_LOG_METRIC:${metricId}:${metricName}:${today}`)],
                        [Markup.button.callback('🔙 Back', 'LOG_METRIC')],
                    ])
                }
            )
        }

        ctx.editMessageText(
            `📝 Send the value for *${metricName}*:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'METRICS_MENU')]]) }
        )
    }, 'SELECT_LOG_METRIC')
})

bot.action(/^UNDO_LOG_METRIC:(\d+):(.+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName, date] = ctx.match
        metricEntryRepo.deleteMetricEntry(parseInt(metricId), date)
        const user = userRepo.findByTelegramId(ctx.from.id)
        ctx.editMessageText(`↩️ Unlogged *${metricName}* for ${date}.`, {
            parse_mode: 'Markdown',
            ...buildMetricsMenuKeyboard(user.id)
        })
    }, 'UNDO_LOG_METRIC')
})

bot.action('RENAME_METRIC', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const metrics = metricRepo.getUserMetrics(user.id)

        if (metrics.length === 0) {
            return ctx.editMessageText('No metrics to rename.', buildMetricsMenuKeyboard(user.id))
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
            return ctx.editMessageText('No metrics to delete.', buildMetricsMenuKeyboard(user.id))
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
        const user = userRepo.findByTelegramId(ctx.from.id)
        metricRepo.deleteMetric(parseInt(metricId))
        ctx.editMessageText(`🗑 *${metricName}* deleted.`, { parse_mode: 'Markdown', ...buildMetricsMenuKeyboard(user.id) })
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

bot.action('METRIC_HISTORY', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const metrics = metricRepo.getUserMetrics(user.id)
        ctx.editMessageText('📋 Which metric?', buildMetricButtons(metrics, 'SHOW_METRIC_HISTORY'))
    }, 'METRIC_HISTORY')
})


bot.action(/^SHOW_METRIC_HISTORY:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName] = ctx.match
        const metric = metricRepo.findMetricById(parseInt(metricId))
        const entries = metricEntryRepo.getMetricHistory(parseInt(metricId), 10)
        const text = buildMetricHistoryText(metric.name, metric.unit, entries)

        ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back', 'METRICS_MENU')]
            ])
        })
    }, 'SHOW_METRIC_HISTORY')
})

// ─── Calendar ─────────────────────────────────────────────────────────────────

bot.action('CALENDAR_TODAY', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const now = new Date()
        ctx.editMessageText(
            '📅 Calendar — tap a day to view or edit',
            buildCalendarKeyboard(user.id, now.getFullYear(), now.getMonth() + 1)
        )
    }, 'CALENDAR_TODAY')
})

bot.action(/^CALENDAR:(\d{4})-(\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const year = parseInt(ctx.match[1])
        const month = parseInt(ctx.match[2])
        ctx.editMessageText(
            '📅 Calendar — tap a day to view or edit',
            buildCalendarKeyboard(user.id, year, month)
        )
    }, 'CALENDAR')
})

bot.action(/^CAL_DAY:(\d{4}-\d{2}-\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const [, dateStr] = ctx.match
        const user = userRepo.findByTelegramId(ctx.from.id)
        const habits = habitRepo.getUserHabits(user.id)
        const metrics = metricRepo.getUserMetrics(user.id)

        // Build summary text
        let text = `📅 *${dateStr}*\n\n`

        if (habits.length > 0) {
            text += `*💪 Habits:*\n`
            habits.forEach(h => {
                const entry = habitEntryRepo.getHabitEntrieDate(h.id, dateStr)
                const icon = !entry ? '·' : entry.completed === 1 ? '✅' : '❌'
                text += `${icon} ${h.name}\n`
            })
            text += '\n'
        }

        if (metrics.length > 0) {
            text += `*📈 Metrics:*\n`
            metrics.forEach(m => {
                const entry = metricEntryRepo.getMetricEntryDate(m.id, dateStr)
                const val = entry ? `${entry.value} ${m.unit}` : '·'
                text += `• ${m.name}: ${val}\n`
            })
            text += '\n'
        }

        const journal = journalRepo.getJournalByDate(user.id, dateStr)
        text += `*📓 Journal:*\n`
        if (journal) {
            text += `📝 ${journal.note}\n`
            if (journal.best_moment) text += `✨ ${journal.best_moment}\n`
        } else {
            text += `· No entry\n`
        }

        // Parse YYYY-MM from dateStr for back button
        const [y, m] = dateStr.split('-')

        const rows = [
            [Markup.button.callback('💪 Edit Habits', `CAL_EDIT_HABITS:${dateStr}`)],
            [Markup.button.callback('📈 Log Metric', `CAL_EDIT_METRIC:${dateStr}`)],
            [Markup.button.callback('📓 Edit Journal', `CAL_EDIT_JOURNAL:${dateStr}`)],
            [Markup.button.callback('🔙 Back to Calendar', `CALENDAR:${y}-${m}`)],
        ]

        ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) })
    }, 'CAL_DAY')
})

// ─── Calendar Edit — Habits ───────────────────────────────────────────────────

bot.action(/^CAL_EDIT_HABITS:(\d{4}-\d{2}-\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const [, dateStr] = ctx.match
        const user = userRepo.findByTelegramId(ctx.from.id)
        const habits = habitRepo.getUserHabits(user.id)

        if (habits.length === 0) {
            return ctx.editMessageText('No habits yet.', Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)],
            ]))
        }

        const rows = habits.map(h => {
            const entry = habitEntryRepo.getHabitEntrieDate(h.id, dateStr)
            const icon = !entry ? '·' : entry.completed === 1 ? '✅' : '❌'
            return [Markup.button.callback(`${icon} ${h.name}`, `CAL_SET_HABIT:${h.id}:${dateStr}`)]
        })
        rows.push([Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)])

        ctx.editMessageText(
            `💪 *Habits for ${dateStr}*\nTap to toggle:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
        )
    }, 'CAL_EDIT_HABITS')
})

bot.action(/^CAL_SET_HABIT:(\d+):(\d{4}-\d{2}-\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, dateStr] = ctx.match
        const existing = habitEntryRepo.getHabitEntrieDate(parseInt(habitId), dateStr)

        if (existing) {
            // Toggle: flip completed status
            const newStatus = existing.completed === 1 ? 0 : 1
            habitEntryRepo.trackHabit(parseInt(habitId), dateStr, newStatus)
        } else {
            habitEntryRepo.trackHabit(parseInt(habitId), dateStr, 1)
        }

        // Re-render habits list for that date
        const user = userRepo.findByTelegramId(ctx.from.id)
        const habits = habitRepo.getUserHabits(user.id)
        const rows = habits.map(h => {
            const entry = habitEntryRepo.getHabitEntrieDate(h.id, dateStr)
            const icon = !entry ? '·' : entry.completed === 1 ? '✅' : '❌'
            return [Markup.button.callback(`${icon} ${h.name}`, `CAL_SET_HABIT:${h.id}:${dateStr}`)]
        })
        rows.push([Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)])

        ctx.editMessageText(
            `💪 *Habits for ${dateStr}*\nTap to toggle:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
        )
    }, 'CAL_SET_HABIT')
})

// ─── Calendar Edit — Metric ───────────────────────────────────────────────────

bot.action(/^CAL_EDIT_METRIC:(\d{4}-\d{2}-\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const [, dateStr] = ctx.match
        const user = userRepo.findByTelegramId(ctx.from.id)
        const metrics = metricRepo.getUserMetrics(user.id)

        if (metrics.length === 0) {
            return ctx.editMessageText('No metrics yet.', Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)],
            ]))
        }

        const rows = metrics.map(m =>
            [Markup.button.callback(`${m.name} (${m.unit})`, `CAL_SEL_MET:${m.id}:${m.name}:${dateStr}`)]
        )
        rows.push([Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)])

        ctx.editMessageText(
            `📈 *Log Metric for ${dateStr}*\nWhich metric?`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
        )
    }, 'CAL_EDIT_METRIC')
})

bot.action(/^CAL_SEL_MET:(\d+):(.+):(\d{4}-\d{2}-\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName, dateStr] = ctx.match
        const existing = metricEntryRepo.getMetricEntryDate(parseInt(metricId), dateStr)

        if (existing) {
            return ctx.editMessageText(
                `*${metricName}* already logged on ${dateStr}: *${existing.value}*\nUndo to re-log.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Undo', `CAL_UNDO_MET:${metricId}:${metricName}:${dateStr}`)],
                        [Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)],
                    ])
                }
            )
        }

        // Store date in session and reuse AWAITING_METRIC_VALUE
        const session = getSession(ctx.from.id)
        session.step = 'AWAITING_METRIC_VALUE'
        session.data.metricId = parseInt(metricId)
        session.data.metricName = metricName
        session.data.selectedDate = dateStr

        ctx.editMessageText(
            `📈 Send value for *${metricName}* on ${dateStr}:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `CAL_DAY:${dateStr}`)]]) }
        )
    }, 'CAL_SEL_MET')
})

bot.action(/^CAL_UNDO_MET:(\d+):(.+):(\d{4}-\d{2}-\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName, dateStr] = ctx.match
        metricEntryRepo.deleteMetricEntry(parseInt(metricId), dateStr)
        ctx.editMessageText(
            `↩️ Unlogged *${metricName}* for ${dateStr}.`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)]]) }
        )
    }, 'CAL_UNDO_MET')
})

// ─── Calendar Edit — Journal ──────────────────────────────────────────────────

bot.action(/^CAL_EDIT_JOURNAL:(\d{4}-\d{2}-\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const [, dateStr] = ctx.match
        const user = userRepo.findByTelegramId(ctx.from.id)
        const existing = journalRepo.getJournalByDate(user.id, dateStr)

        if (existing) {
            return ctx.editMessageText(
                `📓 *Journal for ${dateStr}:*\n\n📝 ${existing.note}${existing.best_moment ? `\n✨ ${existing.best_moment}` : ''}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Delete Entry', `CAL_DEL_JOURNAL:${dateStr}`)],
                        [Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)],
                    ])
                }
            )
        }

        // Reuse journal flow but store selected date
        const session = getSession(ctx.from.id)
        session.step = 'AWAITING_JOURNAL_NOTE'
        session.data.selectedDate = dateStr

        ctx.editMessageText(
            `✍️ *Journal for ${dateStr}*\nSend your note:`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `CAL_DAY:${dateStr}`)]]) }
        )
    }, 'CAL_EDIT_JOURNAL')
})

bot.action(/^CAL_DEL_JOURNAL:(\d{4}-\d{2}-\d{2})$/, (ctx) => {
    safe(ctx, () => {
        const [, dateStr] = ctx.match
        const user = userRepo.findByTelegramId(ctx.from.id)
        journalRepo.deleteJournalEntry(user.id, dateStr)
        ctx.editMessageText(
            `🗑 Journal entry for ${dateStr} deleted.`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', `CAL_DAY:${dateStr}`)]]) }
        )
    }, 'CAL_DEL_JOURNAL')
})

// ─── Reminders Menu ───────────────────────────────────────────────────────────

bot.action('REMINDERS_MENU', (ctx) => {
    safe(ctx, () => {
        ctx.editMessageText('⏰ Reminders — what would you like to manage?', remindersMenuKeyboard)
    }, 'REMINDERS_MENU')
})


// ─── Habit reminders ───────────────────────────────────────────────────────────

bot.action('HABIT_REMINDERS', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const habits = habitRepo.getUserHabits(user.id)

        if (habits.length === 0) {
            return ctx.editMessageText('No habits yet. Add one first!', Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Habit', 'ADD_HABIT')],
                [Markup.button.callback('🔙 Back', 'REMINDERS_MENU')],
            ]))
        }

        const rows = habits.map(h => {
            const label = h.reminder_time ? `${h.name} ⏰ ${h.reminder_time}` : h.name
            return [Markup.button.callback(label, `HABIT_REMINDER_OPTIONS:${h.id}:${h.name}`)]
        })
        rows.push([Markup.button.callback('🔙 Back', 'REMINDERS_MENU')])

        ctx.editMessageText('💪 Select a habit to manage its reminder:', Markup.inlineKeyboard(rows))
    }, 'HABIT_REMINDERS')
})

bot.action(/^HABIT_REMINDER_OPTIONS:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, habitName] = ctx.match
        const habit = habitRepo.findHabitById(parseInt(habitId))

        if (habit.reminder_time) {
            ctx.editMessageText(
                `⏰ *${habitName}* reminder is set for *${habit.reminder_time}*\nWhat would you like to do?`,
                {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Change', `SET_HABIT_REMINDER:${habitId}:${habitName}`)],
                        [Markup.button.callback('🗑 Remove', `REMOVE_HABIT_REMINDER:${habitId}:${habitName}`)],
                        [Markup.button.callback('🔙 Back', 'HABIT_REMINDERS')],
                    ])
                }
            )
        } else {
            ctx.editMessageText(
                `⏰ No reminder set for *${habitName}*`,
                {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                        [Markup.button.callback('➕ Set Reminder', `SET_HABIT_REMINDER:${habitId}:${habitName}`)],
                        [Markup.button.callback('🔙 Back', 'HABIT_REMINDERS')],
                    ])
                }
            )
        }
    }, 'HABIT_REMINDER_OPTIONS')
})

bot.action(/^SET_HABIT_REMINDER:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, habitName] = ctx.match
        const session = getSession(ctx.from.id)
        session.step = 'AWAITING_HABIT_REMINDER_TIME'
        session.data.habitId = parseInt(habitId)
        session.data.habitName = habitName

        ctx.editMessageText(
            `⏰ Send the reminder time for *${habitName}* (e.g. 09:00):`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'HABIT_REMINDERS')]]) }
        )
    }, 'SET_HABIT_REMINDER')
})

bot.action(/^REMOVE_HABIT_REMINDER:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, habitId, habitName] = ctx.match
        habitRepo.removeHabitReminder(parseInt(habitId))
        ctx.editMessageText(
            `✅ Reminder removed for *${habitName}*`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'HABIT_REMINDERS')]]) }
        )
    }, 'REMOVE_HABIT_REMINDER')
})

// ─── Metric reminders ───────────────────────────────────────────────────────────

bot.action('METRIC_REMINDERS', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        const metrics = metricRepo.getUserMetrics(user.id)

        if (metrics.length === 0) {
            return ctx.editMessageText('No metrics yet. Add one first!', Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Metric', 'ADD_METRIC')],
                [Markup.button.callback('🔙 Back', 'REMINDERS_MENU')],
            ]))
        }

        const rows = metrics.map(m => {
            const label = m.reminder_time ? `${m.name} ⏰ ${m.reminder_time}` : m.name
            return [Markup.button.callback(label, `METRIC_REMINDER_OPTIONS:${m.id}:${m.name}`)]
        })
        rows.push([Markup.button.callback('🔙 Back', 'REMINDERS_MENU')])

        ctx.editMessageText('💪 Select a metric to manage its reminder:', Markup.inlineKeyboard(rows))
    }, 'METRIC_REMINDERS')
})

bot.action(/^METRIC_REMINDER_OPTIONS:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName] = ctx.match
        const metric = metricRepo.findMetricById(parseInt(metricId))

        if (metric.reminder_time) {
            ctx.editMessageText(
                `⏰ *${metricName}* reminder is set for *${metric.reminder_time}*\nWhat would you like to do?`,
                {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Change', `SET_METRIC_REMINDER:${metricId}:${metricName}`)],
                        [Markup.button.callback('🗑 Remove', `REMOVE_METRIC_REMINDER:${metricId}:${metricName}`)],
                        [Markup.button.callback('🔙 Back', 'METRIC_REMINDERS')],
                    ])
                }
            )
        } else {
            ctx.editMessageText(
                `⏰ No reminder set for *${metricName}*`,
                {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                        [Markup.button.callback('➕ Set Reminder', `SET_METRIC_REMINDER:${metricId}:${metricName}`)],
                        [Markup.button.callback('🔙 Back', 'METRIC_REMINDERS')],
                    ])
                }
            )
        }
    }, 'METRIC_REMINDER_OPTIONS')
})

bot.action(/^SET_METRIC_REMINDER:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName] = ctx.match
        const session = getSession(ctx.from.id)
        session.step = 'AWAITING_METRIC_REMINDER_TIME'
        session.data.metricId = parseInt(metricId)
        session.data.metricName = metricName

        ctx.editMessageText(
            `⏰ Send the reminder time for *${metricName}* (e.g. 09:00):`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'METRIC_REMINDERS')]]) }
        )
    }, 'SET_METRIC_REMINDER')
})

bot.action(/^REMOVE_METRIC_REMINDER:(\d+):(.+)$/, (ctx) => {
    safe(ctx, () => {
        const [, metricId, metricName] = ctx.match
        metricRepo.removeMetricReminder(parseInt(metricId))
        ctx.editMessageText(
            `✅ Reminder removed for *${metricName}*`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'METRIC_REMINDERS')]]) }
        )
    }, 'REMOVE_METRIC_REMINDER')
})

// ─── Journal reminders ───────────────────────────────────────────────────────────

bot.action('JOURNAL_REMINDER', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)

        if (user.journal_reminder_time) {
            ctx.editMessageText(
                `⏰ Journal reminder is set for *${user.journal_reminder_time}*\nWhat would you like to do?`,
                {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Change', 'SET_JOURNAL_REMINDER')],
                        [Markup.button.callback('🗑 Remove', 'REMOVE_JOURNAL_REMINDER')],
                        [Markup.button.callback('🔙 Back', 'REMINDERS_MENU')],
                    ])
                }
            )
        } else {
            ctx.editMessageText(
                `⏰ No journal reminder set`,
                {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                        [Markup.button.callback('➕ Set Reminder', 'SET_JOURNAL_REMINDER')],
                        [Markup.button.callback('🔙 Back', 'REMINDERS_MENU')],
                    ])
                }
            )
        }
    }, 'JOURNAL_REMINDER')
})

bot.action('SET_JOURNAL_REMINDER', (ctx) => {
    safe(ctx, () => {
        const session = getSession(ctx.from.id)
        session.step = 'AWAITING_JOURNAL_REMINDER_TIME'

        ctx.editMessageText(
            `⏰ Send the reminder time for your journal (e.g. 21:00):`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'JOURNAL_REMINDER')]]) }
        )
    }, 'SET_JOURNAL_REMINDER')
})


bot.action('REMOVE_JOURNAL_REMINDER', (ctx) => {
    safe(ctx, () => {
        const user = userRepo.findByTelegramId(ctx.from.id)
        userRepo.removeJournalReminder(user.id)
        ctx.editMessageText(
            `✅ Journal reminder removed.`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'JOURNAL_REMINDER')]]) }
        )
    }, 'REMOVE_JOURNAL_REMINDER')
})

// ─── Text Handler (multi-step flows) ─────────────────────────────────────────

bot.on(message('text'), (ctx) => {
    const session = getSession(ctx.from.id)
    const raw = ctx.message.text
    const text = raw.trim()
    const user = userRepo.findByTelegramId(ctx.from.id)
    if (!user) {
        clearSession(ctx.from.id)
        return ctx.reply('Please start the bot first with /start')
    }

    const nameSteps = ['AWAITING_HABIT_NAME', 'AWAITING_HABIT_RENAME', 'AWAITING_METRIC_NAME', 'AWAITING_METRIC_UNIT', 'AWAITING_METRIC_RENAME']

    let finalText = text
    if (nameSteps.includes(session.step)) {
        const sanitized = text.replace(/[^\w\s\-]/g, '').trim()
        if (!sanitized) return ctx.reply('⚠️ Name cannot be empty or contain only special characters.')
        if (sanitized.length > 50) return ctx.reply('⚠️ Name too long (max 50 chars).')
        finalText = sanitized
    }

    switch (session.step) {

        case 'AWAITING_HABIT_NAME': {
            if (habitRepo.findHabitByName(user.id, finalText)) {
                return ctx.reply('⚠️ A habit with this name already exists.')
            }
            habitRepo.createHabit(user.id, finalText)
            clearSession(ctx.from.id)
            ctx.reply(`Habit *${finalText}* added ✅`, { parse_mode: 'Markdown', ...buildHabitsMenuKeyboard(user.id) })
            break
        }

        case 'AWAITING_HABIT_RENAME': {
            if (habitRepo.findHabitByName(user.id, finalText)) {
                return ctx.reply('⚠️ A habit with this name already exists.')
            }
            const oldHabitName = session.data.habitName
            habitRepo.renameHabit(session.data.habitId, finalText)
            clearSession(ctx.from.id)
            ctx.reply(`✏️ Renamed *${oldHabitName}* → *${finalText}* ✅`, { parse_mode: 'Markdown', ...buildHabitsMenuKeyboard(user.id) })
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
            const journalDate = session.data.selectedDate || getToday()
            journalRepo.upsertJournalEntry(user.id, journalDate, session.data.note, text)
            clearSession(ctx.from.id)
            ctx.reply('Journal saved 📓', buildJournalMenuKeyboard(user.id))
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
            ctx.reply(`Metric *${metricName}* (${finalText}) created ✅`, { parse_mode: 'Markdown', ...buildMetricsMenuKeyboard(user.id) })
            break
        }

        case 'AWAITING_METRIC_VALUE': {
            const value = parseFloat(text)
            if (isNaN(value)) return ctx.reply('⚠️ Please send a valid number.')

            const metricIdForUndo = session.data.metricId
            const loggedMetricName = session.data.metricName
            const logDate = session.data.selectedDate || getToday()  // ← change
            const metric = metricRepo.findMetricById(metricIdForUndo)
            metricEntryRepo.logMetric(metricIdForUndo, logDate, value)
            clearSession(ctx.from.id)
            ctx.reply(
                `Logged *${value} ${metric?.unit || ''}* for ${loggedMetricName} on ${logDate} ✅`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('↩️ Undo', `UNDO_LOG_METRIC:${metricIdForUndo}:${loggedMetricName}:${logDate}`)],
                        [Markup.button.callback('🔙 Metrics Menu', 'METRICS_MENU')],
                    ])
                }
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
            ctx.reply(`✏️ Renamed *${oldMetricName}* → *${finalText}* ✅`, { parse_mode: 'Markdown', ...buildMetricsMenuKeyboard(user.id) })
            break
        }

        case 'AWAITING_HABIT_REMINDER_TIME': {
            const isValidTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(text)
            if (!isValidTime) return ctx.reply('⚠️ Please send time in HH:MM format (e.g. 09:00)')

            habitRepo.setHabitReminder(session.data.habitId, text)
            const habitName = session.data.habitName
            clearSession(ctx.from.id)
            ctx.reply(
                `⏰ Reminder set for *${habitName}* at *${text}* ✅`,
                { parse_mode: 'Markdown', ...remindersMenuKeyboard }
            )
            break
        }

        case 'AWAITING_METRIC_REMINDER_TIME': {
            const isValidTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(text)
            if (!isValidTime) return ctx.reply('⚠️ Please send time in HH:MM format (e.g. 09:00)')

            metricRepo.setMetricReminder(session.data.metricId, text)
            const metricName = session.data.metricName
            clearSession(ctx.from.id)
            ctx.reply(
                `⏰ Reminder set for *${metricName}* at *${text}* ✅`,
                { parse_mode: 'Markdown', ...remindersMenuKeyboard }
            )
            break
        }

        case 'AWAITING_JOURNAL_REMINDER_TIME': {
            const isValidTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(text)
            if (!isValidTime) return ctx.reply('⚠️ Please send time in HH:MM format (e.g. 09:00)')

            userRepo.setJournalReminder(user.id, text)
            clearSession(ctx.from.id)
            ctx.reply(
                `⏰ Journal reminder set for *${text}* ✅`,
                { parse_mode: 'Markdown', ...remindersMenuKeyboard }
            )
            break
        }

        default: {
            showMainMenu(ctx, 'Use the menu below to get started 👇')
            break
        }
    }
})

// ─── Schedule ───────────────────────────────────────────────────────────────────

cron.schedule('5 0 * * *', () => {
    const yesterday = getYesterday()
    const habits = habitRepo.getAllHabits()
    for (const habit of habits) {
        try {
            if (habit.created_at <= yesterday && !habitEntryRepo.getHabitEntrieDate(habit.id, yesterday)) {
                habitEntryRepo.trackHabit(habit.id, yesterday, 0)
            }
        } catch (e) {
            logError(e, `auto_mark_missed:${habit.id}`)
        }
    }
})

cron.schedule('0 9 * * 0', () => {
    const users = userRepo.getAllUsers()

    for (const user of users) {
        try {
            const text = `📅 *Weekly Summary*\n\n` + buildStatsText(user.id)
            bot.telegram.sendMessage(user.telegram_id, text, { parse_mode: 'Markdown' })
        } catch (e) {
            logError(e, `weekly_summary:${user.telegram_id}`)
        }
    }
})

cron.schedule('* * * * *', () => {

    const now = new Date().toTimeString().slice(0, 5)
    const habits = habitRepo.getHabitsWithReminders()

    for (const habit of habits) {
        if (habit.reminder_time === now && !habitEntryRepo.getHabitEntrieDate(habit.id, getToday())) {
            try {
                bot.telegram.sendMessage(
                    habit.telegram_id,
                    `⏰ Reminder: don't forget to track *${habit.name}* today!`,
                    { parse_mode: 'Markdown' }
                )
            } catch (e) {
                logError(e, `habit_reminder:${habit.id}`)
            }
        }
    }
})

cron.schedule('* * * * *', () => {
    const now = new Date().toTimeString().slice(0, 5)
    const metrics = metricRepo.getMetricsWithReminders()

    for (const metric of metrics) {
        if (metric.reminder_time === now && !metricEntryRepo.getMetricEntryDate(metric.id, getToday())) {
            try {
                bot.telegram.sendMessage(
                    metric.telegram_id,
                    `⏰ Reminder: don't forget to log *${metric.name}* today!`,
                    { parse_mode: 'Markdown' }
                )
            } catch (e) {
                logError(e, `metric_reminder:${metric.id}`)
            }
        }
    }
})

cron.schedule('* * * * *', () => {
    const now = new Date().toTimeString().slice(0, 5)
    const users = userRepo.getUsersWithJournalReminder()

    for (const user of users) {
        if (user.journal_reminder_time === now && !journalRepo.getJournalByDate(user.id, getToday())) {
            try {
                bot.telegram.sendMessage(
                    user.telegram_id,
                    `⏰ Reminder: don't forget to write your journal today!`,
                    { parse_mode: 'Markdown' }
                )
            } catch (e) {
                logError(e, `journal_reminder:${user.telegram_id}`)
            }
        }
    }
})

// ─── Launch ───────────────────────────────────────────────────────────────────
bot.launch()
console.log('Bot is running...')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))