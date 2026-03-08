const db = require('../db')

function createUser(telegramId, username) {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO users (telegram_id, username)
        VALUES (?, ?)
    `)

    stmt.run(telegramId, username)
}

function getAllUsers() {
    const stmt = db.prepare(`
        SELECT * FROM users
        `)
    return stmt.all()
}

function findByTelegramId(telegramId) {
    const stmt = db.prepare(`
        SELECT * FROM users WHERE telegram_id = ?
    `)

    return stmt.get(telegramId)
}

function setJournalReminder(userId, time) {
    const stmt = db.prepare(`
        UPDATE users
        SET journal_reminder_time = ? 
        WHERE id = ?
    `)

    return stmt.run(time, userId)
}

function removeJournalReminder(userId) {
    const stmt = db.prepare(`
        UPDATE users 
        SET journal_reminder_time = NULL
        WHERE id = ?
    `)
    return stmt.run(userId)
}

function getUsersWithJournalReminder() {
    const stmt = db.prepare(`
        SELECT * FROM users
        WHERE journal_reminder_time IS NOT NULL
    `)
    return stmt.all()
}

module.exports = {
    createUser,
    findByTelegramId,
    getAllUsers,
    setJournalReminder,
    removeJournalReminder,
    getUsersWithJournalReminder
}