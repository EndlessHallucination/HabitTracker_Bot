const db = require('../db')

function createMetric(userId, name, unit) {
    const stmt = db.prepare(`
        INSERT INTO metrics (user_id, name, unit)
        VALUES (?, ?, ?)
    `)
    return stmt.run(userId, name, unit)
}

function deleteMetric(metricId) {
    const stmt = db.prepare(`
        DELETE FROM metrics WHERE id = ?
    `)
    return stmt.run(metricId)
}

function renameMetric(metricId, name) {
    const stmt = db.prepare(`
        UPDATE metrics SET name = ? WHERE id = ?
    `)
    return stmt.run(name, metricId)
}

function findMetricByName(userId, name) {
    const stmt = db.prepare(`
        SELECT * FROM metrics
        WHERE user_id = ? AND name = ?
    `)
    return stmt.get(userId, name)
}

function findMetricById(metricId) {
    const stmt = db.prepare(`
        SELECT * FROM metrics WHERE id = ?
    `)
    return stmt.get(metricId)
}

function getUserMetrics(userId) {
    const stmt = db.prepare(`
        SELECT * FROM metrics
        WHERE user_id = ?
    `)
    return stmt.all(userId)
}

function setMetricReminder(metricId, time) {
    const stmt = db.prepare(`
        UPDATE metrics 
        SET reminder_time = ? 
        WHERE id = ?
    `)

    return stmt.run(time, metricId)
}

function removeMetricReminder(metricId) {
    const stmt = db.prepare(`
        UPDATE metrics 
        SET reminder_time = NULL 
        WHERE id = ?
    `)

    return stmt.run(metricId)
}

function getMetricsWithReminders() {
    const stmt = db.prepare(`
        SELECT h.*, u.telegram_id
        FROM metrics h
        JOIN users u ON h.user_id = u.id
        WHERE h.reminder_time IS NOT NULL
    `)

    return stmt.all()
}



module.exports = {
    createMetric,
    deleteMetric,
    renameMetric,
    findMetricByName,
    findMetricById,
    getUserMetrics,
    getMetricsWithReminders,
    removeMetricReminder,
    setMetricReminder
}