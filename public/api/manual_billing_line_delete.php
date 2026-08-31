<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$id = (int) ($input['id'] ?? 0);

if ($id === 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing id']);
    exit;
}

$pdo = db();
$stmt = $pdo->prepare('DELETE FROM manual_billing_lines WHERE id = ?');
$stmt->execute([$id]);

echo json_encode(['ok' => true]);
