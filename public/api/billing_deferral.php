<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $jobNumber = $input['job_number'] ?? '';
    $billingDate = $input['billing_date'] ?? '';
    $gpRecognised = (float) ($input['gp_recognised'] ?? 0);

    if ($jobNumber === '' || $billingDate === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing job_number or billing_date']);
        exit;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO billing_plan_deferrals (job_number, billing_date, gp_recognised) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE gp_recognised = VALUES(gp_recognised)'
    );
    $stmt->execute([$jobNumber, $billingDate, $gpRecognised]);

    echo json_encode(['ok' => true]);
    exit;
}

$jobNumber = $_GET['job'] ?? '';
if ($jobNumber === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing job parameter']);
    exit;
}

$stmt = $pdo->prepare('SELECT billing_date, gp_recognised FROM billing_plan_deferrals WHERE job_number = ?');
$stmt->execute([$jobNumber]);

$deferrals = [];
foreach ($stmt->fetchAll() as $row) {
    $deferrals[$row['billing_date']] = (float) $row['gp_recognised'];
}

echo json_encode(['deferrals' => $deferrals]);
