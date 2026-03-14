const db = require('../db')

function logMetric(metricId, date, value) {
    const stmt = db.prepare(`
        INSERT INTO metric_entries (metric_id, entry_date, value)
        VALUES (?, ?, ?)
        ON CONFLICT(metric_id, entry_date)
        DO UPDATE SET value = excluded.value
    `)

    return stmt.run(metricId, date, value)
}

function getMetricEntries(metricId) {
    const stmt = db.prepare(`
        SELECT * FROM metric_entries
        WHERE metric_id = ?
        ORDER BY entry_date ASC
    `)

    return stmt.all(metricId)
}

function getMetricEntryDate(metricId, date) {
    const stmt = db.prepare(`
        SELECT * FROM metric_entries
        WHERE metric_id = ? AND entry_date = ?
     `)
    return stmt.get(metricId, date)
}

function getMetricStats(metricId) {
    const stmt = db.prepare(`
        SELECT 
            COUNT(*) as total_entries,
            AVG(value) as avg_value,
            MIN(value) as min_value,
            MAX(value) as max_value
        FROM metric_entries
        WHERE metric_id = ?
    `)

    return stmt.get(metricId)
}

function deleteMetricEntry(metricId, date) {
    const stmt = db.prepare(`
        DELETE FROM metric_entries
        WHERE metric_id = ? AND entry_date = ? 
   `)
    return stmt.run(metricId, date)
}

function getMetricHistory(metricId, limit) {
    const stmt = db.prepare(`
        SELECT * FROM metric_entries
        WHERE metric_id = ?      
        ORDER BY entry_date DESC
        LIMIT ?
    `)
    return stmt.all(metricId, limit)
}


function exportUserMetricEntries(userId) {
    return db.prepare(`
        SELECT me.entry_date, m.name, m.unit, me.value
        FROM metric_entries me
        JOIN metrics m ON m.id = me.metric_id
        WHERE m.user_id = ?
        ORDER BY me.entry_date DESC
    `).all(userId)
}

module.exports = {
    logMetric,
    getMetricEntries,
    getMetricEntryDate,
    getMetricStats,
    getMetricHistory,
    deleteMetricEntry,
    exportUserMetricEntries
}