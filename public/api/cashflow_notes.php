<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';

$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $content = $input['content'] ?? '';

    $stmt = $pdo->prepare(
        'INSERT INTO cashflow_page_notes (id, content) VALUES (1, ?)
         ON DUPLICATE KEY UPDATE content = VALUES(content)'
    );
    $stmt->execute([$content]);

    echo json_encode(['ok' => true]);
    exit;
}

$row = $pdo->query('SELECT content FROM cashflow_page_notes WHERE id = 1')->fetch();
echo json_encode(['content' => $row['content'] ?? '']);
