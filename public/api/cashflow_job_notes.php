<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $jobNumber = $input['job_number'] ?? '';
    $note = $input['note'] ?? '';

    if ($jobNumber === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing job_number']);
        exit;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO cashflow_job_notes (job_number, note) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE note = VALUES(note)'
    );
    $stmt->execute([$jobNumber, $note]);

    echo json_encode(['ok' => true]);
    exit;
}

$rows = $pdo->query('SELECT job_number, note FROM cashflow_job_notes')->fetchAll();
$notes = [];
foreach ($rows as $row) {
    $notes[$row['job_number']] = $row['note'];
}

echo json_encode(['notes' => $notes]);
