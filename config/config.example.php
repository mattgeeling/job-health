<?php

return [
    'db' => [
        'host' => '127.0.0.1',
        'name' => 'job_health',
        'user' => 'job_health',
        'pass' => 'job_health_dev',
    ],
    'synergist' => [
        'base_url' => 'https://fuzzyduck.synergist.cloud/jsonapi/',
        'user' => 'JobHealthIntegration',
        'password' => 'REPLACE_ME',
        'company' => 1,
        'version' => 7,
        'open_live_jobs_view' => 134,
        'sync_secret' => 'REPLACE_ME',
    ],
];
