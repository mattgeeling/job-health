<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$id = (int) ($input['id'] ?? 0);
$description = trim($input['description'] ?? '');
$billingDate = $input['billing_date'] ?? '';
$value = (float) ($input['value'] ?? 0);
$cost = (float) ($input['cost'] ?? 0);
$type = in_array($input['type'] ?? '', ['release', 'defer', 'cost', 'invoice'], true) ? $input['type'] : 'release';

if ($id === 0 || $description === '' || $billingDate === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing id, description, or billing_date']);
    exit;
}

$pdo = db();
$stmt = $pdo->prepare(
    'UPDATE manual_billing_lines SET description = ?, billing_date = ?, value = ?, cost = ?, type = ? WHERE id = ?'
);
$stmt->execute([$description, $billingDate, $value, $cost, $type, $id]);

echo json_encode(['ok' => true]);
