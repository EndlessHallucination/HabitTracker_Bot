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

function getAllHabits() {
    const stmt = db.prepare(`
        SELECT * FROM habits
    `)
    return stmt.all()
}

function findHabitByName(userId, name) {
    const stmt = db.prepare(`
        SELECT * FROM habits
        WHERE user_id = ? AND name = ?
    `)
    return stmt.get(userId, name)
}

function setHabitReminder(habitId, time) {
    const stmt = db.prepare(`
        UPDATE habits 
        SET reminder_time = ? 
        WHERE id = ?
    `)

    return stmt.run(time, habitId)
}

function removeHabitReminder(habitId) {
    const stmt = db.prepare(`
        UPDATE habits 
        SET reminder_time = NULL 
        WHERE id = ?
    `)

    return stmt.run(habitId)
}

function getHabitsWithReminders() {
    const stmt = db.prepare(`
        SELECT h.*, u.telegram_id
        FROM habits h
        JOIN users u ON h.user_id = u.id
        WHERE h.reminder_time IS NOT NULL
    `)

    return stmt.all()
}

function findHabitById(habitId) {
    const stmt = db.prepare(`
        SELECT * FROM habits WHERE id = ?
        `)
    return stmt.get(habitId)
}


function freezeHabit(habitId) {
    db.prepare(`UPDATE habits SET is_frozen = 1 WHERE id = ?`).run(habitId)
}

function unfreezeHabit(habitId) {
    db.prepare(`UPDATE habits SET is_frozen = 0 WHERE id = ?`).run(habitId)
}
module.exports = {
    createHabit,
    deleteHabit,
    renameHabit,
    getUserHabits,
    getAllHabits,
    findHabitByName,
    findHabitById,
    setHabitReminder,
    removeHabitReminder,
    getHabitsWithReminders,
    freezeHabit, unfreezeHabit
}