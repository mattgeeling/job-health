<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/db.php';
require_once __DIR__ . '/../../lib/gemini_api.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$jobNumber = $input['job_number'] ?? '';
if ($jobNumber === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing job_number']);
    exit;
}

$pdo = db();

$stmt = $pdo->prepare('SELECT * FROM jobs WHERE job_number = ?');
$stmt->execute([$jobNumber]);
$job = $stmt->fetch();

if (!$job) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Job not found']);
    exit;
}

$stmt = $pdo->prepare(
    'SELECT * FROM job_snapshots WHERE job_id = ? ORDER BY snapshot_date DESC LIMIT 1'
);
$stmt->execute([$job['id']]);
$latest = $stmt->fetch();

if (!$latest) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'No snapshot data for this job']);
    exit;
}

$estHours = (float) $latest['estimate_hours'];
$actHours = (float) $latest['actual_hours'];
$quoted = (float) $latest['quoted_value'];
$hoursPct = $estHours > 0 ? round(($actHours / $estHours) * 100) : null;

// Passing raw unrounded decimals (e.g. "13149.05") into the prompt led to
// the model occasionally garbling them in prose (a stray ".05" left
// dangling). Every number in the prompt now goes through this first.
$fmt = fn($n) => number_format((float) $n, 0);

$impliedQuoteLine = '';
if ($estHours > 0 && $actHours > $estHours && $quoted > 0) {
    $impliedQuote = $quoted * ($actHours / $estHours);
    $additionalValue = $impliedQuote - $quoted;
    $impliedQuoteLine = "Equivalent quote at actual hours: £" . number_format($impliedQuote, 0) . " (£" . number_format($additionalValue, 0) . " of additional delivery value beyond the original quote — this is NOT what should have been charged or a shortfall, just the value of the extra hours delivered against the estimate).\n";
}

$prompt = <<<PROMPT
You are a plain-speaking financial analyst helping a creative agency review the profitability of one job. Write a short (3-4 sentence) narrative summary of this job's numbers, in the style of a colleague giving a quick, honest verdict — not a report. Be direct about whether it was profitable, and whether it was efficiently delivered. If it went over on hours, note that going over hours doesn't automatically mean losing money, and explain the distinction between commercial profitability and delivery efficiency if relevant. Do not repeat every number back as a list — write it as prose.

Wrap the key figures (money amounts, percentages, and hour counts) in double asterisks for bold, e.g. **£11,117** or **46% margin** or **362 hours** — but use no other markdown formatting of any kind.

If an "Equivalent quote at actual hours" figure is given below, you may reference it as illustrating the value of the extra effort delivered — but never describe it as what the job "should have" been charged, a missed charge, or a shortfall, since the job was already profitable at the original quote.

Job: {$job['title']}
Client: {$job['client_name']}
Quoted: £{$fmt($quoted)}
Estimated hours: {$estHours}h
Actual hours: {$actHours}h
Hours used: {$hoursPct}% of estimate
Estimated cost: £{$fmt($latest['estimate_cost'])}
Actual cost: £{$fmt($latest['actual_cost'])}
Net profit: £{$fmt($latest['net_margin'])}
Net margin: {$fmt($latest['net_margin_pct'])}%
{$impliedQuoteLine}
PROMPT;

try {
    $narrative = gemini_generate($prompt);
    echo json_encode(['ok' => true, 'narrative' => $narrative]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to generate summary']);
}
