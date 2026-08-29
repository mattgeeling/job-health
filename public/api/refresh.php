<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/sync.php';

// Each page only needs its own data resynced — running both on every click
// (as this used to do unconditionally) roughly doubles the Synergist API
// work per sync and risks IONOS's own ~180s proxy timeout. Omitting
// `target` still runs both, for the cron/CLI case.
$target = $_GET['target'] ?? $_POST['target'] ?? 'all';

try {
    $started = microtime(true);
    $data = [];
    if ($target === 'jobs' || $target === 'all') {
        $data += run_job_sync();
    }
    if ($target === 'pipeline' || $target === 'all') {
        $data += run_pipeline_sync();
    }
    $durationSeconds = round(microtime(true) - $started, 1);
    echo json_encode(['ok' => true, 'duration_seconds' => $durationSeconds] + $data);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
