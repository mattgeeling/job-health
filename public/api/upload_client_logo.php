<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/client_logos.php';

$clientName = trim($_POST['client_name'] ?? '');
if ($clientName === '' || empty($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing client_name or logo file']);
    exit;
}

$allowedExt = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'svg' => 'image/svg+xml', 'webp' => 'image/webp'];
$originalName = $_FILES['logo']['name'];
$ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

if (!isset($allowedExt[$ext])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'File must be png, jpg, svg, or webp']);
    exit;
}

$slug = client_logo_slug($clientName);
if ($slug === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid client name']);
    exit;
}

if (!is_dir(client_logos_dir())) {
    mkdir(client_logos_dir(), 0755, true);
}

$filename = "{$slug}.{$ext}";
$destination = client_logos_dir() . '/' . $filename;

if (!move_uploaded_file($_FILES['logo']['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to save file']);
    exit;
}

$manifest = client_logos_load();
// Remove any previous logo for this client under a different extension.
foreach (array_keys($allowedExt) as $otherExt) {
    if ($otherExt !== $ext) {
        @unlink(client_logos_dir() . "/{$slug}.{$otherExt}");
    }
}
$manifest[$clientName] = $filename;
client_logos_save($manifest);

echo json_encode(['ok' => true, 'filename' => $filename]);
