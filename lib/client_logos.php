<?php

function client_logos_dir(): string
{
    return __DIR__ . '/../public/client-logos';
}

function client_logo_slug(string $clientName): string
{
    $slug = strtolower(trim($clientName));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    return trim($slug, '-');
}

function client_logos_manifest_path(): string
{
    return client_logos_dir() . '/manifest.json';
}

/** @return array<string,string> client name => filename */
function client_logos_load(): array
{
    $path = client_logos_manifest_path();
    if (!file_exists($path)) {
        return [];
    }
    $data = json_decode(file_get_contents($path), true);
    return is_array($data) ? $data : [];
}

function client_logos_save(array $manifest): void
{
    if (!is_dir(client_logos_dir())) {
        mkdir(client_logos_dir(), 0755, true);
    }
    file_put_contents(client_logos_manifest_path(), json_encode($manifest, JSON_PRETTY_PRINT));
}
