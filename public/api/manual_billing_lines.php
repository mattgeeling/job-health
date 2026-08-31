<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $description = trim($input['description'] ?? '');
    $billingDate = $input['billing_date'] ?? '';
    $value = (float) ($input['value'] ?? 0);
    $cost = (float) ($input['cost'] ?? 0);
    $type = in_array($input['type'] ?? '', ['release', 'defer', 'cost', 'invoice'], true) ? $input['type'] : 'release';

    if ($description === '' || $billingDate === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing description or billing_date']);
        exit;
    }

    $stmt = $pdo->prepare('INSERT INTO manual_billing_lines (description, billing_date, value, cost, type) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$description, $billingDate, $value, $cost, $type]);

    echo json_encode(['ok' => true, 'id' => (int) $pdo->lastInsertId()]);
    exit;
}

$rows = $pdo->query('SELECT id, description, billing_date, value, cost, type FROM manual_billing_lines ORDER BY billing_date ASC')->fetchAll();
echo json_encode(['lines' => $rows]);
