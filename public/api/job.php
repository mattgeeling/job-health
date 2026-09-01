<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$jobNumber = $_GET['job'] ?? '';
if ($jobNumber === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing job parameter']);
    exit;
}

$pdo = db();

$stmt = $pdo->prepare('SELECT * FROM jobs WHERE job_number = ?');
$stmt->execute([$jobNumber]);
$job = $stmt->fetch();

if (!$job) {
    http_response_code(404);
    echo json_encode(['error' => 'Job not found']);
    exit;
}

$stmt = $pdo->prepare(
    'SELECT snapshot_date, quoted_value, estimate_hours, actual_hours,
            estimate_cost, actual_cost, estimate_purchase_cost, actual_purchase_cost,
            gross_margin, net_margin,
            gross_margin_pct, net_margin_pct,
            pct_actual_vs_estimate_hours, pct_actual_vs_estimate_cost
     FROM job_snapshots
     WHERE job_id = ?
     ORDER BY snapshot_date ASC'
);
$stmt->execute([$job['id']]);
$snapshots = $stmt->fetchAll();

$stmt = $pdo->prepare(
    'SELECT billing_date, planned_value, planned_cost FROM job_billing_lines WHERE job_number = ? ORDER BY billing_date ASC'
);
$stmt->execute([$jobNumber]);
$billingLines = $stmt->fetchAll();

echo json_encode([
    'job' => $job,
    'snapshots' => $snapshots,
    'billing_lines' => $billingLines,
]);
