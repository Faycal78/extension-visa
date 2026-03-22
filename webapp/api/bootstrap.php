<?php

declare(strict_types=1);

const DB_PATH = __DIR__ . '/../storage/data.sqlite';

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $storageDir = dirname(DB_PATH);

    if (! is_dir($storageDir)) {
        mkdir($storageDir, 0777, true);
    }

    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS passport_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_url TEXT NULL,
            source_label TEXT NULL,
            title TEXT NULL,
            surname TEXT NULL,
            given_names TEXT NULL,
            full_name TEXT NULL,
            passport_number TEXT NULL,
            nationality TEXT NULL,
            issuing_country TEXT NULL,
            birth_date TEXT NULL,
            expiry_date TEXT NULL,
            sex TEXT NULL,
            mobile_phone TEXT NULL,
            email TEXT NULL,
            status TEXT NOT NULL DEFAULT "received",
            raw_text TEXT NULL,
            extracted_data TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )'
    );

    return $pdo;
}

function jsonResponse(array $payload, int $status = 200): never
{
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function handlePreflight(): void
{
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        jsonResponse(['ok' => true]);
    }
}

function requestJson(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);

    return is_array($data) ? $data : [];
}

function normalizeDate(?string $value): ?string
{
    if (! $value) {
        return null;
    }

    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : null;
}

