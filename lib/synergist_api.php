<?php

function synergist_config(): array
{
    static $config;
    if ($config === null) {
        $config = require __DIR__ . '/../config/config.php';
    }
    return $config['synergist'];
}

/**
 * Calls the Synergist REST API and returns the decoded `data` array.
 * Throws on any transport error or API-reported failure.
 */
function synergist_get(string $modelstructure, array $params = []): array
{
    $cfg = synergist_config();

    $query = array_merge([
        'user' => $cfg['user'],
        'password' => $cfg['password'],
        'company' => $cfg['company'],
        'version' => $cfg['version'],
        'modelstructure' => $modelstructure,
    ], $params);

    $url = rtrim($cfg['base_url'], '/') . '/jobs.json?' . http_build_query($query);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        $error = curl_error($ch);
        throw new RuntimeException("Synergist API request failed: {$error}");
    }

    $body = json_decode($raw, true);
    if (!is_array($body)) {
        throw new RuntimeException('Synergist API returned invalid JSON: ' . substr($raw, 0, 200));
    }
    if (empty($body['success'])) {
        $message = $body['errormessage'] ?? 'Unknown error';
        throw new RuntimeException("Synergist API error: {$message}");
    }

    return $body;
}

/**
 * Lists jobs. $filters can include things like a status filter, per
 * Synergist's "Filters" query support — left generic for now since only
 * open/live jobs will be synced once the sync script is built.
 */
function synergist_jobs_list(array $filters = [], int $page = 0, int $rows = 0): array
{
    $params = array_merge($filters, ['page' => $page]);
    if ($rows > 0) {
        $params['rows'] = $rows;
    }
    $body = synergist_get('jobslist', $params);
    return $body['data'] ?? [];
}

/**
 * Financial totals for a single job. $job is the job number as returned
 * by the Jobs List endpoint (e.g. "1/00011913").
 */
function synergist_job_financials(string $job): ?array
{
    $body = synergist_get('jobfinancial', ['job' => $job]);
    return $body['data'][0] ?? null;
}
