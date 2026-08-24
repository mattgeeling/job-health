<?php

function gemini_config(): array
{
    static $config;
    if ($config === null) {
        $config = require __DIR__ . '/../config/config.php';
    }
    return $config['gemini'];
}

/**
 * Sends a prompt to Gemini and returns the generated text.
 * Throws on any transport error or API-reported failure.
 */
function gemini_generate(string $prompt): string
{
    $cfg = gemini_config();
    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$cfg['model']}:generateContent?key={$cfg['api_key']}";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'contents' => [['parts' => [['text' => $prompt]]]],
        ]),
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        throw new RuntimeException('Gemini API request failed: ' . curl_error($ch));
    }

    $body = json_decode($raw, true);
    $text = $body['candidates'][0]['content']['parts'][0]['text'] ?? null;
    if ($text === null) {
        $message = $body['error']['message'] ?? substr($raw, 0, 200);
        throw new RuntimeException("Gemini API error: {$message}");
    }

    return trim($text);
}
