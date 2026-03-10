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

module.exports = {
    logMetric,
    getMetricEntries,
    getMetricEntryDate,
    getMetricStats
}