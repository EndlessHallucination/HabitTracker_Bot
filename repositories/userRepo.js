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

module.exports = {
    createUser,
    findByTelegramId,
    getAllUsers
}