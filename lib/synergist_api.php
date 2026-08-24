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
 * Throws on any transport error or API-reported failure. $endpoint is the
 * ".json" file the modelstructure lives under (e.g. "jobs", "phases") —
 * these aren't interchangeable, each modelstructure belongs to one file.
 */
function synergist_get(?string $modelstructure, array $params = [], string $endpoint = 'jobs'): array
{
    $cfg = synergist_config();

    $query = array_merge([
        'user' => $cfg['user'],
        'password' => $cfg['password'],
        'company' => $cfg['company'],
        'version' => $cfg['version'],
    ], $modelstructure !== null ? ['modelstructure' => $modelstructure] : [], $params);

    $url = rtrim($cfg['base_url'], '/') . "/{$endpoint}.json?" . http_build_query($query);

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

/**
 * Per-phase (stage) breakdown for a single job: description + estimate vs
 * actual hours/cost. Two calls are needed since phaseslist has the
 * description and phasefinancial has the numbers; joined on phaseJobAndPhase.
 */
function synergist_job_phases(string $job): array
{
    $listBody = synergist_get('phaseslist', ['job' => $job], 'phases');
    $finBody = synergist_get('phasefinancial', ['job' => $job], 'phases');

    $descriptions = [];
    foreach ($listBody['data'] ?? [] as $phase) {
        $descriptions[$phase['phaseJobAndPhase']] = $phase['phasePhaseDescription1stLine'] ?? '';
    }

    $phases = [];
    foreach ($finBody['data'] ?? [] as $phase) {
        $key = $phase['phaseJobAndPhase'];
        $phases[] = [
            'phase_number' => substr(strrchr($key, '.'), 1) ?: $key,
            'description' => $descriptions[$key] ?? '',
            'estimate_hours' => (float) ($phase['phaseEstimateUnitsBase'] ?? 0),
            'actual_hours' => (float) ($phase['phaseActualUnitsBase'] ?? 0),
            'estimate_cost' => (float) ($phase['phaseTimeEstimateTotal'] ?? 0) + (float) ($phase['phasePOEstimateTotal'] ?? 0),
            'actual_cost' => (float) ($phase['phaseCostTotalPI'] ?? 0),
        ];
    }

    usort($phases, fn($a, $b) => strcmp($a['phase_number'], $b['phase_number']));

    return $phases;
}

/**
 * Individual expense/purchase line items logged against a job (costChargeCodeType
 * "P"). Excludes time entries (type "T") and doesn't include supplier
 * purchase invoices, which Synergist tracks separately — this is a partial
 * view of external costs, not the full reconciled total.
 */
function synergist_job_cost_transactions(string $job): array
{
    $body = synergist_get(null, ['action' => 'costscharges', 'job' => $job, 'rows' => 300], 'jobs');

    $transactions = [];
    foreach ($body['data'] ?? [] as $cost) {
        if (($cost['costChargeCodeType'] ?? '') === 'T') {
            continue;
        }
        $transactions[] = [
            'date' => $cost['costDate'] ?? null,
            'description' => $cost['costDescription'] ?? '',
            'resource_name' => $cost['costResourceName'] ?? '',
            'amount' => (float) ($cost['costCostTotal'] ?? 0),
            'phase' => $cost['costPhase'] ?? '',
        ];
    }

    usort($transactions, fn($a, $b) => strcmp($b['date'] ?? '', $a['date'] ?? ''));

    return $transactions;
}
