<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

// Live jobs: real, committed billing plan lines — already won, counted at
// full value.
$liveLines = $pdo->query(
    'SELECT j.job_number, j.title, j.client_name, NULL AS weighting,
            l.billing_date, l.planned_value, l.planned_cost
     FROM job_billing_lines l
     JOIN jobs j ON j.job_number = l.job_number
     WHERE j.is_active = 1'
)->fetchAll();
foreach ($liveLines as &$row) {
    $row['source'] = 'live';
}
unset($row);

// Pipeline opportunities: not yet won — on-hold excluded, matching the
// pipeline page's own forecast chart. Weighting is left for the front-end
// to apply, same as pipeline.js does.
$pipelineLines = $pdo->query(
    'SELECT p.job_number, p.title, p.client_name, p.weighting,
            l.billing_date, l.planned_value, l.planned_cost
     FROM pipeline_billing_lines l
     JOIN pipeline_jobs p ON p.job_number = l.job_number
     WHERE p.is_active = 1 AND (p.status IS NULL OR p.status != \'on_hold\')'
)->fetchAll();
foreach ($pipelineLines as &$row) {
    $row['source'] = 'pipeline';
}
unset($row);

// Manually logged income — e.g. amounts released/recognised in a month
// other than when they were originally billed, which Synergist's billing
// plan doesn't capture. Counted at full value, like live jobs.
$manualLines = $pdo->query(
    'SELECT id AS job_number, description AS title, NULL AS client_name, NULL AS weighting,
            billing_date, value AS planned_value, cost AS planned_cost
     FROM manual_billing_lines'
)->fetchAll();
foreach ($manualLines as &$row) {
    $row['source'] = 'manual';
}
unset($row);

echo json_encode(['lines' => array_merge($liveLines, $pipelineLines, $manualLines)]);
