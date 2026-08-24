<?php

require_once __DIR__ . '/../../lib/synergist_api.php';
require_once __DIR__ . '/../../lib/db.php';

header('Content-Type: text/plain');

$cfg = synergist_config();
if (!isset($_GET['key']) || !hash_equals($cfg['sync_secret'], (string) $_GET['key'])) {
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

try {
    $pdo = db();
    echo "DB connection OK\n";
    $count = $pdo->query('SELECT COUNT(*) FROM jobs')->fetchColumn();
    echo "jobs table row count: {$count}\n";
} catch (Throwable $e) {
    echo "ERROR: " . get_class($e) . ": " . $e->getMessage() . "\n";
}
