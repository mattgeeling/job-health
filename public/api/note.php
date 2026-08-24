<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$jobNumber = $input['job_number'] ?? '';
$notes = $input['notes'] ?? '';

if ($jobNumber === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing job_number']);
    exit;
}

$pdo = db();
$stmt = $pdo->prepare('UPDATE jobs SET notes = ? WHERE job_number = ?');
$stmt->execute([$notes, $jobNumber]);

echo json_encode(['ok' => true]);
