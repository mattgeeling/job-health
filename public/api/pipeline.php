<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

$lastSyncedAt = $pdo->query('SELECT MAX(last_synced_at) FROM pipeline_jobs')->fetchColumn();

$rows = $pdo->query(
    'SELECT job_number, title, client_name, handler_name, job_type, date_in, date_due, quoted_value, notes, status, weighting
     FROM pipeline_jobs
     WHERE is_active = 1
     ORDER BY date_due IS NULL, date_due ASC'
)->fetchAll();

$shortTermCutoff = (new DateTime('+42 days'))->format('Y-m-d');
$today = date('Y-m-d');

$billingLinesByJob = [];
foreach ($pdo->query('SELECT job_number, billing_date, planned_value, planned_cost FROM pipeline_billing_lines') as $line) {
    $billingLinesByJob[$line['job_number']][] = [
        'date' => $line['billing_date'],
        'value' => (float) $line['planned_value'],
        'cost' => (float) $line['planned_cost'],
    ];
}

foreach ($rows as &$row) {
    // No due date at all is treated as overdue too — arguably more
    // concerning than a passed date, since it suggests the opportunity
    // has been left with no plan at all.
    if ($row['date_due'] === null || $row['date_due'] < $today) {
        $row['bucket'] = 'overdue';
    } elseif ($row['date_due'] <= $shortTermCutoff) {
        $row['bucket'] = 'short_term';
    } else {
        $row['bucket'] = 'long_term';
    }
    $row['billing_lines'] = $billingLinesByJob[$row['job_number']] ?? [];
}
unset($row);

echo json_encode(['opportunities' => $rows, 'last_synced_at' => $lastSyncedAt]);
