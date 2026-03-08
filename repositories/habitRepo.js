const db = require('../db')

function createHabit(userId, name) {
    const stmt = db.prepare(`
        INSERT INTO habits (user_id, name)
        VALUES (?, ?)
    `)
    return stmt.run(userId, name)
}

function deleteHabit(habitId) {
    const stmt = db.prepare(`
        DELETE FROM habits WHERE id = ?
    `)
    return stmt.run(habitId)
}

function renameHabit(habitId, name) {
    const stmt = db.prepare(`
        UPDATE habits SET name = ? WHERE id = ?
    `)
    return stmt.run(name, habitId)
}

function getUserHabits(userId) {
    const stmt = db.prepare(`
        SELECT * FROM habits
        WHERE user_id = ? AND is_active = 1
    `)
    return stmt.all(userId)
}

function findHabitByName(userId, name) {
    const stmt = db.prepare(`
        SELECT * FROM habits
        WHERE user_id = ? AND name = ?
    `)
    return stmt.get(userId, name)
}

module.exports = {
    createHabit,
    deleteHabit,
    renameHabit,
    getUserHabits,
    findHabitByName
}