const db = require('../db')

function trackHabit(habitId, date, completed = 1) {
    const stmt = db.prepare(`
        INSERT INTO habit_entries (habit_id, entry_date, completed)
        VALUES (?, ?, ?)
        ON CONFLICT(habit_id, entry_date)
        DO UPDATE SET completed = excluded.completed
    `)

    return stmt.run(habitId, date, completed)
}

function getHabitEntries(habitId) {
    const stmt = db.prepare(`
        SELECT * FROM habit_entries
        WHERE habit_id = ?
        ORDER BY entry_date ASC
    `)

    return stmt.all(habitId)
}

module.exports = {
    trackHabit,
    getHabitEntries
}