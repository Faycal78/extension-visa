<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

handlePreflight();

$pdo = db();

$totals = $pdo->query(
    'SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN passport_number IS NOT NULL AND passport_number <> "" THEN 1 END) AS with_passport,
        COUNT(CASE WHEN birth_date IS NOT NULL AND birth_date <> "" THEN 1 END) AS with_birth_date,
        COUNT(CASE WHEN email IS NOT NULL AND email <> "" THEN 1 END) AS with_email
     FROM passport_submissions'
)->fetch();

$latest = $pdo->query(
    'SELECT id, full_name, passport_number, nationality, created_at
     FROM passport_submissions
     ORDER BY id DESC
     LIMIT 5'
)->fetchAll();

jsonResponse([
    'ok' => true,
    'stats' => $totals,
    'latest' => $latest,
]);

