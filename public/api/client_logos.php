<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../lib/client_logos.php';

echo json_encode(['logos' => client_logos_load()]);
