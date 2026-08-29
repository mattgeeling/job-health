<?php

require_once __DIR__ . '/../lib/synergist_api.php';
require_once __DIR__ . '/../lib/sync.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain');
    $cfg = synergist_config();
    if (!isset($_GET['key']) || !hash_equals($cfg['sync_secret'], (string) $_GET['key'])) {
        http_response_code(403);
        echo "Forbidden\n";
        exit;
    }
}

$started = microtime(true);
$result = run_job_sync();
$pipelineResult = run_pipeline_sync();
$duration = round(microtime(true) - $started, 1);

echo "{$result['live_jobs']} live jobs found.\n";
echo "{$result['synced']} job snapshots written for " . date('Y-m-d') . ".\n";
echo "{$pipelineResult['pipeline_jobs']} pipeline opportunities synced.\n";
echo "Completed in {$duration}s.\n";
