<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/synergist_api.php';

$jobNumber = $_GET['job'] ?? '';
if ($jobNumber === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing job parameter']);
    exit;
}

$pdo = db();

$stmt = $pdo->prepare('SELECT * FROM pipeline_jobs WHERE job_number = ?');
$stmt->execute([$jobNumber]);
$opportunity = $stmt->fetch();

if (!$opportunity) {
    http_response_code(404);
    echo json_encode(['error' => 'Opportunity not found']);
    exit;
}

$stmt = $pdo->prepare('SELECT billing_date, planned_value, planned_cost FROM pipeline_billing_lines WHERE job_number = ? ORDER BY billing_date ASC');
$stmt->execute([$jobNumber]);
$opportunity['billing_lines'] = $stmt->fetchAll();

$today = new DateTime();
$daysOpen = null;
if (!empty($opportunity['date_in'])) {
    $daysOpen = $today->diff(new DateTime($opportunity['date_in']))->days;
}
$opportunity['days_open'] = $daysOpen;

// UK financial year: 1 April - 31 March.
$fyStartYear = (int) $today->format('n') >= 4 ? (int) $today->format('Y') : (int) $today->format('Y') - 1;
$fyFrom = "{$fyStartYear}-04-01";
$fyTo = ($fyStartYear + 1) . '-03-31';

$clientInvestmentFy = null;
if (!empty($opportunity['client_name'])) {
    try {
        $clientCode = synergist_client_code_for_name($opportunity['client_name']);
        if ($clientCode !== null) {
            $clientInvestmentFy = synergist_client_invoiced_total($clientCode, $fyFrom, $fyTo);
        }
    } catch (Throwable $e) {
        // Leave as null — the rest of the page is still useful without it.
    }
}

$opportunity['client_investment_fy'] = $clientInvestmentFy;
$opportunity['fy_from'] = $fyFrom;
$opportunity['fy_to'] = $fyTo;

echo json_encode(['opportunity' => $opportunity]);
