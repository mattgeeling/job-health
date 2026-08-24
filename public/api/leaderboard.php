<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

$rows = $pdo->query(
    'SELECT
        j.handler_name,
        COUNT(*) AS job_count,
        SUM(s.quoted_value) AS total_quoted,
        SUM(s.net_margin) AS total_net_margin,
        SUM(s.gross_margin) AS total_gross_margin,
        SUM(CASE WHEN s.pct_actual_vs_estimate_hours >= 100 OR s.net_margin_pct < 0 THEN 1 ELSE 0 END) AS red_count,
        SUM(CASE WHEN (s.pct_actual_vs_estimate_hours >= 90 AND s.pct_actual_vs_estimate_hours < 100)
                   OR (s.net_margin_pct >= 0 AND s.net_margin_pct < 15) THEN 1 ELSE 0 END) AS amber_count
     FROM jobs j
     JOIN job_snapshots s ON s.job_id = j.id
     JOIN (
        SELECT job_id, MAX(snapshot_date) AS snapshot_date
        FROM job_snapshots
        GROUP BY job_id
     ) latest ON latest.job_id = s.job_id AND latest.snapshot_date = s.snapshot_date
     WHERE j.is_active = 1 AND j.handler_name IS NOT NULL AND j.handler_name != \'\'
     GROUP BY j.handler_name
     ORDER BY total_net_margin DESC'
)->fetchAll();

foreach ($rows as &$row) {
    $row['job_count'] = (int) $row['job_count'];
    $row['red_count'] = (int) $row['red_count'];
    $row['amber_count'] = (int) $row['amber_count'];
    $row['blended_net_margin_pct'] = $row['total_quoted'] > 0
        ? round(($row['total_net_margin'] / $row['total_quoted']) * 100, 2)
        : null;
}
unset($row);

echo json_encode(['handlers' => $rows]);
