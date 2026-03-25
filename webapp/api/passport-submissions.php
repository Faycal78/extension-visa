<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

handlePreflight();

$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = $pdo->query(
        'SELECT id, source_url, source_label, title, surname, given_names, full_name, passport_number, nationality,
                issuing_country, birth_date, expiry_date, sex, mobile_phone, email, nb_travellers, formula, raw_text, extracted_data, status, created_at
         FROM passport_submissions
         ORDER BY id DESC'
    )->fetchAll();

    foreach ($rows as &$row) {
        $decoded = json_decode((string) ($row['extracted_data'] ?? ''), true);
        $row['extracted_data'] = is_array($decoded) ? $decoded : [];

        if (($row['mobile_phone'] ?? '') !== '' && empty($row['extracted_data']['mobilePhone'])) {
            $row['extracted_data']['mobilePhone'] = $row['mobile_phone'];
        }

        if (($row['email'] ?? '') !== '' && empty($row['extracted_data']['email'])) {
            $row['extracted_data']['email'] = $row['email'];
        }

        if (($row['email'] ?? '') !== '' && empty($row['extracted_data']['emailConfirm'])) {
            $row['extracted_data']['emailConfirm'] = $row['email'];
        }
    }
    unset($row);

    jsonResponse([
        'ok' => true,
        'items' => $rows,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'message' => 'Method not allowed'], 405);
}

$payload = requestJson();
$data = $payload['extracted_data'] ?? [];

if (! is_array($data)) {
    jsonResponse(['ok' => false, 'message' => 'Invalid payload'], 422);
}

$mobilePhone = trim((string) ($payload['mobile_phone'] ?? $data['mobilePhone'] ?? ''));
$email = trim((string) ($payload['email'] ?? $data['email'] ?? ''));

if ($mobilePhone !== '' && empty($data['mobilePhone'])) {
    $data['mobilePhone'] = $mobilePhone;
}

if ($email !== '' && empty($data['email'])) {
    $data['email'] = $email;
}

if ($email !== '' && empty($data['emailConfirm'])) {
    $data['emailConfirm'] = $email;
}

$now = gmdate('Y-m-d H:i:s');
$stmt = $pdo->prepare(
    'INSERT INTO passport_submissions (
        source_url, source_label, title, surname, given_names, full_name, passport_number,
        nationality, issuing_country, birth_date, expiry_date, sex, mobile_phone, email, nb_travellers, formula,
        status, raw_text, extracted_data, created_at, updated_at
    ) VALUES (
        :source_url, :source_label, :title, :surname, :given_names, :full_name, :passport_number,
        :nationality, :issuing_country, :birth_date, :expiry_date, :sex, :mobile_phone, :email, :nb_travellers, :formula,
        :status, :raw_text, :extracted_data, :created_at, :updated_at
    )'
);

$stmt->execute([
    ':source_url' => $payload['source_url'] ?? null,
    ':source_label' => $payload['source_label'] ?? null,
    ':title' => $data['title'] ?? null,
    ':surname' => $data['surname'] ?? null,
    ':given_names' => $data['givenNames'] ?? null,
    ':full_name' => $data['fullName'] ?? null,
    ':passport_number' => $data['passportNumber'] ?? null,
    ':nationality' => $data['nationality'] ?? null,
    ':issuing_country' => $data['issuingCountry'] ?? null,
    ':birth_date' => normalizeDate($data['birthDate'] ?? null),
    ':expiry_date' => normalizeDate($data['expiryDate'] ?? null),
    ':sex' => $data['sex'] ?? null,
    ':mobile_phone' => $mobilePhone !== '' ? $mobilePhone : null,
    ':email' => $email !== '' ? $email : null,
    ':nb_travellers' => $data['nbTravellers'] ?? null,
    ':formula' => $data['formula'] ?? null,
    ':status' => $payload['status'] ?? 'received',
    ':raw_text' => $payload['raw_text'] ?? null,
    ':extracted_data' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ':created_at' => $now,
    ':updated_at' => $now,
]);

$id = (int) $pdo->lastInsertId();
$scheme = (! empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$dashboardUrl = sprintf('%s://%s/dashboard', $scheme, $host);

jsonResponse([
    'ok' => true,
    'id' => $id,
    'dashboard_url' => $dashboardUrl,
], 201);
