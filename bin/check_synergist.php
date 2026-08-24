<?php

require_once __DIR__ . '/../lib/synergist_api.php';

echo "Fetching first page of jobs...\n";
$jobs = synergist_jobs_list([], 0, 5);
echo count($jobs) . " jobs returned.\n";
foreach ($jobs as $job) {
    echo "  {$job['jobNumber']}  {$job['jobStatusDescription']}  {$job['jobClientName']}  {$job['jobDescription1stLine']}\n";
}

if (!empty($jobs[0]['jobNumber'])) {
    $sample = $jobs[0]['jobNumber'];
    echo "\nFetching financials for {$sample}...\n";
    $fin = synergist_job_financials($sample);
    if ($fin) {
        printf(
            "  Quoted £%s  Estimate £%s  Gross margin £%s  Net margin £%s\n",
            number_format($fin['jobQuotedPrice'] ?? 0, 2),
            number_format($fin['jobEstimateTotal'] ?? 0, 2),
            number_format($fin['jobGrossMargin'] ?? 0, 2),
            number_format($fin['jobNetMargin'] ?? 0, 2)
        );
    } else {
        echo "  No financial data returned.\n";
    }
}

echo "\nDone.\n";
