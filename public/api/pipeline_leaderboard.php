<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

$rows = $pdo->query(
    'SELECT
        p.handler_name,
        COUNT(*) AS opportunity_count,
        SUM(p.quoted_value) AS total_value,
        SUM(CASE WHEN p.quoted_value IS NULL OR p.quoted_value = 0 THEN 1 ELSE 0 END) AS no_value_count,
        n.notes AS notes
     FROM pipeline_jobs p
     LEFT JOIN handler_notes n ON n.handler_name = p.handler_name
     WHERE p.is_active = 1 AND (p.status IS NULL OR p.status != \'on_hold\')
        AND p.handler_name IS NOT NULL AND p.handler_name != \'\'
     GROUP BY p.handler_name, n.notes
     ORDER BY total_value DESC'
)->fetchAll();

foreach ($rows as &$row) {
    $row['opportunity_count'] = (int) $row['opportunity_count'];
    $row['no_value_count'] = (int) $row['no_value_count'];
}
unset($row);

echo json_encode(['handlers' => $rows]);
