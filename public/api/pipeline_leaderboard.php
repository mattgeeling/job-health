<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

$rows = $pdo->query(
    'SELECT
        handler_name,
        COUNT(*) AS opportunity_count,
        SUM(quoted_value) AS total_value,
        SUM(CASE WHEN quoted_value IS NULL OR quoted_value = 0 THEN 1 ELSE 0 END) AS no_value_count
     FROM pipeline_jobs
     WHERE is_active = 1 AND handler_name IS NOT NULL AND handler_name != \'\'
     GROUP BY handler_name
     ORDER BY total_value DESC'
)->fetchAll();

foreach ($rows as &$row) {
    $row['opportunity_count'] = (int) $row['opportunity_count'];
    $row['no_value_count'] = (int) $row['no_value_count'];
}
unset($row);

echo json_encode(['handlers' => $rows]);
