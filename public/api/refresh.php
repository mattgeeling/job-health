<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/sync.php';

try {
    $result = run_job_sync();
    echo json_encode(['ok' => true] + $result);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Sync failed']);
}
