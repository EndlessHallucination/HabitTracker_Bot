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

module.exports = {
    createMetric,
    deleteMetric,
    renameMetric,
    findMetricByName,
    findMetricById,
    getUserMetrics
}