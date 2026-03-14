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

function deleteHabitEntry(habitId, date) {
    const stmt = db.prepare(`
        DELETE FROM habit_entries
        WHERE habit_id = ? AND entry_date = ? 
   `)
    return stmt.run(habitId, date)
}

function getHabitEntries(habitId) {
    const stmt = db.prepare(`
        SELECT * FROM habit_entries
        WHERE habit_id = ?
        ORDER BY entry_date ASC
    `)

    return stmt.all(habitId)
}

function getHabitEntrieDate(habitId, date) {
    const stmt = db.prepare(`
        SELECT * FROM habit_entries
        WHERE habit_id = ? AND entry_date  = ?
     `)
    return stmt.get(habitId, date)
}

function exportUserHabitEntries(userId) {
    return db.prepare(`
        SELECT he.entry_date, h.name, he.completed
        FROM habit_entries he
        JOIN habits h ON h.id = he.habit_id
        WHERE h.user_id = ?
        ORDER BY he.entry_date DESC
    `).all(userId)
}

function getHabitEntriesRange(habitId, fromDate, toDate) {
    return db.prepare(`
        SELECT entry_date, completed
        FROM habit_entries
        WHERE habit_id = ? AND entry_date BETWEEN ? AND ?
        ORDER BY entry_date ASC
    `).all(habitId, fromDate, toDate)
}

module.exports = {
    trackHabit,
    deleteHabitEntry,
    getHabitEntries,
    getHabitEntrieDate,
    exportUserHabitEntries,
    getHabitEntriesRange
}