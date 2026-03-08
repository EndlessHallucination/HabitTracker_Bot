const db = require('../db')

function upsertJournalEntry(userId, date, note, bestMoment) {
    const stmt = db.prepare(`
        INSERT INTO journal_entries (user_id, entry_date, note, best_moment)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, entry_date)
        DO UPDATE SET
            note = excluded.note,
            best_moment = excluded.best_moment
    `)

    return stmt.run(userId, date, note, bestMoment)
}

function deleteJournalEntry(userId, date) {
    const stmt = db.prepare(`
        DELETE FROM journal_entries
        WHERE user_id = ? AND entry_date = ? 
        `)
    return stmt.run(userId, date)
}
function getJournalByDate(userId, date) {
    const stmt = db.prepare(`
        SELECT * FROM journal_entries
        WHERE user_id = ? AND entry_date = ?
    `)

    return stmt.get(userId, date)
}

function getAllJournalEntries(userId) {
    const stmt = db.prepare(`
        SELECT * FROM journal_entries
        WHERE user_id = ?
        ORDER BY entry_date DESC
    `)

    return stmt.all(userId)
}

module.exports = {
    upsertJournalEntry,
    deleteJournalEntry,
    getJournalByDate,
    getAllJournalEntries
}