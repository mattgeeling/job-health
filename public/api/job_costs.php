<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/synergist_api.php';

$jobNumber = $_GET['job'] ?? '';
if ($jobNumber === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing job parameter']);
    exit;
}

try {
    $transactions = synergist_job_cost_transactions($jobNumber);
    echo json_encode(['transactions' => $transactions]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to fetch cost transactions']);
}
