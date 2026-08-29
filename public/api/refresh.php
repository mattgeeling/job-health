<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/sync.php';

try {
    $started = microtime(true);
    $result = run_job_sync();
    $pipelineResult = run_pipeline_sync();
    $durationSeconds = round(microtime(true) - $started, 1);
    echo json_encode(['ok' => true, 'duration_seconds' => $durationSeconds] + $result + $pipelineResult);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Sync failed']);
}
