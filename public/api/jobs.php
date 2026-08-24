<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

$lastSyncedAt = $pdo->query('SELECT MAX(last_synced_at) FROM jobs')->fetchColumn();

$rows = $pdo->query(
    'SELECT j.id, j.job_number, j.title, j.client_name, j.handler_name, j.date_due, j.notes,
            s.snapshot_date, s.quoted_value, s.estimate_hours, s.actual_hours,
            s.gross_margin, s.net_margin, s.gross_margin_pct, s.net_margin_pct,
            s.pct_actual_vs_estimate_hours, s.pct_actual_vs_estimate_cost
     FROM jobs j
     JOIN job_snapshots s ON s.job_id = j.id
     JOIN (
        SELECT job_id, MAX(snapshot_date) AS snapshot_date
        FROM job_snapshots
        GROUP BY job_id
     ) latest ON latest.job_id = s.job_id AND latest.snapshot_date = s.snapshot_date
     WHERE j.is_active = 1
     ORDER BY j.job_number'
)->fetchAll();

foreach ($rows as &$row) {
    $hoursPct = $row['pct_actual_vs_estimate_hours'] !== null ? (float) $row['pct_actual_vs_estimate_hours'] : null;
    $netMarginPct = $row['net_margin_pct'] !== null ? (float) $row['net_margin_pct'] : null;

    $risk = 'green';
    if (($hoursPct !== null && $hoursPct >= 100) || ($netMarginPct !== null && $netMarginPct < 0)) {
        $risk = 'red';
    } elseif (($hoursPct !== null && $hoursPct >= 90) || ($netMarginPct !== null && $netMarginPct < 15)) {
        $risk = 'amber';
    }
    $row['risk'] = $risk;
}
unset($row);

echo json_encode(['jobs' => $rows, 'last_synced_at' => $lastSyncedAt]);
