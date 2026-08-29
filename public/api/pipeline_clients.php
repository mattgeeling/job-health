<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

$rows = $pdo->query(
    'SELECT
        client_name,
        COUNT(*) AS opportunity_count,
        SUM(quoted_value) AS total_value
     FROM pipeline_jobs
     WHERE is_active = 1 AND client_name IS NOT NULL AND client_name != \'\'
     GROUP BY client_name
     ORDER BY total_value DESC'
)->fetchAll();

foreach ($rows as &$row) {
    $row['opportunity_count'] = (int) $row['opportunity_count'];
}
unset($row);

echo json_encode(['clients' => $rows]);
