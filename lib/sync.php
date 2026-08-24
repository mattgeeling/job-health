<?php

require_once __DIR__ . '/synergist_api.php';
require_once __DIR__ . '/db.php';

function normalize_date(?string $date): ?string
{
    if (!$date || $date === '0000-00-00') {
        return null;
    }
    return $date;
}

function pct(float $numerator, float $denominator): ?float
{
    if ($denominator == 0.0) {
        return null;
    }
    return round(($numerator / $denominator) * 100, 2);
}

/**
 * Pulls the "Open live jobs" Synergist view and writes today's snapshot
 * for each job. Returns ['live_jobs' => int, 'synced' => int].
 */
function run_job_sync(): array
{
    $pdo = db();
    $today = date('Y-m-d');

    // Mark everyone inactive first; jobs actually present in this sync get
    // reactivated below. Anything left inactive has dropped out of the
    // "Open live jobs" view (completed, put on hold, etc).
    $pdo->exec('UPDATE jobs SET is_active = 0');

    $upsertJob = $pdo->prepare(
        'INSERT INTO jobs (job_number, job_uuid, title, client_name, handler_name, status, status_description, date_in, date_due, is_active, last_synced_at)
         VALUES (:job_number, :job_uuid, :title, :client_name, :handler_name, :status, :status_description, :date_in, :date_due, 1, NOW())
         ON DUPLICATE KEY UPDATE
           job_uuid = VALUES(job_uuid),
           title = VALUES(title),
           client_name = VALUES(client_name),
           handler_name = VALUES(handler_name),
           status = VALUES(status),
           status_description = VALUES(status_description),
           date_in = VALUES(date_in),
           date_due = VALUES(date_due),
           is_active = 1,
           last_synced_at = NOW()'
    );

    $upsertSnapshot = $pdo->prepare(
        'INSERT INTO job_snapshots (
            job_id, snapshot_date, quoted_value, estimate_hours, actual_hours,
            estimate_cost, actual_cost, gross_margin, net_margin,
            gross_margin_pct, net_margin_pct, pct_actual_vs_estimate_hours, pct_actual_vs_estimate_cost
         ) VALUES (
            :job_id, :snapshot_date, :quoted_value, :estimate_hours, :actual_hours,
            :estimate_cost, :actual_cost, :gross_margin, :net_margin,
            :gross_margin_pct, :net_margin_pct, :pct_actual_vs_estimate_hours, :pct_actual_vs_estimate_cost
         )
         ON DUPLICATE KEY UPDATE
            quoted_value = VALUES(quoted_value),
            estimate_hours = VALUES(estimate_hours),
            actual_hours = VALUES(actual_hours),
            estimate_cost = VALUES(estimate_cost),
            actual_cost = VALUES(actual_cost),
            gross_margin = VALUES(gross_margin),
            net_margin = VALUES(net_margin),
            gross_margin_pct = VALUES(gross_margin_pct),
            net_margin_pct = VALUES(net_margin_pct),
            pct_actual_vs_estimate_hours = VALUES(pct_actual_vs_estimate_hours),
            pct_actual_vs_estimate_cost = VALUES(pct_actual_vs_estimate_cost)'
    );

    $openLiveJobsView = synergist_config()['open_live_jobs_view'];

    $liveJobs = [];
    $page = 0;
    do {
        $batch = synergist_jobs_list(['view' => $openLiveJobsView], $page, 200);
        $liveJobs = array_merge($liveJobs, $batch);
        $page++;
    } while (count($batch) === 200);

    $synced = 0;
    foreach ($liveJobs as $job) {
        $upsertJob->execute([
            'job_number' => $job['jobNumber'],
            'job_uuid' => $job['jobUuid'] ?? null,
            'title' => $job['jobDescription1stLine'] ?? null,
            'client_name' => $job['jobClientName'] ?? null,
            'handler_name' => $job['jobHandlerFullName'] ?? null,
            'status' => $job['jobStatus'] ?? null,
            'status_description' => $job['jobStatusDescription'] ?? null,
            'date_in' => normalize_date($job['jobDateIn'] ?? null),
            'date_due' => normalize_date($job['jobDateDue'] ?? null),
        ]);
        $jobId = (int) $pdo->lastInsertId();
        if ($jobId === 0) {
            $jobId = (int) $pdo->query('SELECT id FROM jobs WHERE job_number = ' . $pdo->quote($job['jobNumber']))->fetchColumn();
        }

        $fin = synergist_job_financials($job['jobNumber']);
        if (!$fin) {
            continue;
        }

        $estimateHours = (float) ($fin['jobEstimateUnitsBase'] ?? 0);
        $actualHours = (float) ($fin['jobActualUnitsBase'] ?? 0);
        $estimateCost = (float) ($fin['jobEstimateTotal'] ?? 0);
        $actualCost = (float) ($fin['jobCostTotalPI'] ?? 0);
        $actualPurchaseCost = (float) ($fin['jobPOCostPI'] ?? 0);
        $quoted = (float) ($fin['jobQuotedPrice'] ?? 0);

        // Synergist's own jobGrossMargin/jobNetMargin are quoted-vs-ESTIMATE
        // (fixed at quote time), not quoted-vs-actual — they barely move as
        // the job progresses. We want real, current profitability, so these
        // are computed against actual costs incurred so far instead.
        $grossMargin = $quoted - $actualPurchaseCost;
        $netMargin = $quoted - $actualCost;

        $upsertSnapshot->execute([
            'job_id' => $jobId,
            'snapshot_date' => $today,
            'quoted_value' => $quoted,
            'estimate_hours' => $estimateHours,
            'actual_hours' => $actualHours,
            'estimate_cost' => $estimateCost,
            'actual_cost' => $actualCost,
            'gross_margin' => $grossMargin,
            'net_margin' => $netMargin,
            'gross_margin_pct' => pct($grossMargin, $quoted),
            'net_margin_pct' => pct($netMargin, $quoted),
            'pct_actual_vs_estimate_hours' => $fin['jobPercentageActualEstimateUnits'] ?? null,
            'pct_actual_vs_estimate_cost' => $fin['jobPercentageActualEstimateCost'] ?? null,
        ]);
        $synced++;
    }

    return ['live_jobs' => count($liveJobs), 'synced' => $synced];
}
