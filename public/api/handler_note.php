<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$handlerName = $input['handler_name'] ?? '';
$notes = $input['notes'] ?? '';

if ($handlerName === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing handler_name']);
    exit;
}

$pdo = db();
$stmt = $pdo->prepare(
    'INSERT INTO handler_notes (handler_name, notes) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE notes = VALUES(notes)'
);
$stmt->execute([$handlerName, $notes]);

echo json_encode(['ok' => true]);
