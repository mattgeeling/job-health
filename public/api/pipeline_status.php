<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$jobNumber = $input['job_number'] ?? '';
$status = $input['status'] ?? '';

$allowed = ['in_progress', 'needs_quoting', 'with_client', 'on_hold'];
if ($jobNumber === '' || !in_array($status, $allowed, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid job_number or status']);
    exit;
}

$pdo = db();
$stmt = $pdo->prepare('UPDATE pipeline_jobs SET status = ? WHERE job_number = ?');
$stmt->execute([$status, $jobNumber]);

echo json_encode(['ok' => true]);
