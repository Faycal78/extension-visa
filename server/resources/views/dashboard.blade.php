<!DOCTYPE html>
<html lang="fr">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Visa OCR Backend</title>
        <style>
            :root {
                color-scheme: light;
                --bg: linear-gradient(180deg, #f4efe8 0%, #e7eef7 100%);
                --card: rgba(255, 255, 255, 0.88);
                --text: #17212b;
                --muted: #5c6672;
                --line: rgba(23, 33, 43, 0.12);
                --accent: #b45309;
                --accent-soft: #fff2e3;
                --shadow: 0 20px 45px rgba(23, 33, 43, 0.1);
            }

            * { box-sizing: border-box; }
            body {
                margin: 0;
                font-family: "Avenir Next", "Segoe UI", sans-serif;
                background: var(--bg);
                color: var(--text);
            }
            .shell {
                max-width: 1200px;
                margin: 0 auto;
                padding: 32px 20px 48px;
            }
            .hero {
                margin-bottom: 24px;
            }
            .eyebrow {
                margin: 0 0 8px;
                color: var(--accent);
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 0.12em;
                text-transform: uppercase;
            }
            h1 {
                margin: 0;
                font-size: 34px;
                line-height: 1.05;
            }
            .subtitle {
                max-width: 720px;
                margin: 10px 0 0;
                color: var(--muted);
                line-height: 1.6;
            }
            .meta {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 16px;
                margin: 24px 0;
            }
            .card {
                background: var(--card);
                border: 1px solid var(--line);
                border-radius: 20px;
                box-shadow: var(--shadow);
                backdrop-filter: blur(10px);
            }
            .metric {
                padding: 18px;
            }
            .metric .label {
                margin: 0 0 6px;
                color: var(--muted);
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
            }
            .metric .value {
                margin: 0;
                font-size: 28px;
                font-weight: 800;
            }
            .panel {
                padding: 18px;
            }
            .panel-header {
                display: flex;
                justify-content: space-between;
                gap: 16px;
                align-items: center;
                margin-bottom: 14px;
            }
            .panel-title {
                margin: 0;
                font-size: 18px;
                font-weight: 800;
            }
            .panel-note {
                margin: 0;
                color: var(--muted);
                font-size: 13px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                text-align: left;
                padding: 12px 10px;
                border-top: 1px solid var(--line);
                vertical-align: top;
                font-size: 14px;
            }
            th {
                color: var(--muted);
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                border-top: 0;
            }
            .badge {
                display: inline-block;
                padding: 5px 10px;
                border-radius: 999px;
                background: var(--accent-soft);
                color: var(--accent);
                font-size: 12px;
                font-weight: 800;
            }
            .mono {
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                font-size: 12px;
            }
            .empty {
                padding: 20px 4px 8px;
                color: var(--muted);
            }
            @media (max-width: 900px) {
                table, thead, tbody, tr, th, td {
                    display: block;
                }
                thead {
                    display: none;
                }
                tr {
                    border-top: 1px solid var(--line);
                    padding: 8px 0;
                }
                td {
                    border-top: 0;
                    padding: 6px 0;
                }
                td::before {
                    content: attr(data-label);
                    display: block;
                    color: var(--muted);
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 2px;
                }
            }
        </style>
    </head>
    <body>
        <main class="shell">
            <header class="hero">
                <p class="eyebrow">Laravel + Extension Chrome</p>
                <h1>Visa OCR Backend</h1>
                <p class="subtitle">
                    Ce tableau de bord reçoit les données extraites par l'extension, les stocke en SQLite et expose une API locale pour synchroniser les passeports OCR.
                </p>
            </header>

            <section class="meta">
                <article class="card metric">
                    <p class="label">Soumissions</p>
                    <p class="value">{{ $submissions->count() }}</p>
                </article>
                <article class="card metric">
                    <p class="label">API</p>
                    <p class="value mono">POST /api/passport-submissions</p>
                </article>
                <article class="card metric">
                    <p class="label">Base</p>
                    <p class="value mono">SQLite locale</p>
                </article>
            </section>

            <section class="card panel">
                <div class="panel-header">
                    <div>
                        <h2 class="panel-title">Dernières soumissions</h2>
                        <p class="panel-note">Les données envoyées par l'extension apparaissent ici après synchronisation.</p>
                    </div>
                </div>

                @if ($submissions->isEmpty())
                    <p class="empty">Aucune donnée reçue pour le moment.</p>
                @else
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nom</th>
                                <th>Passeport</th>
                                <th>Naissance</th>
                                <th>Expiration</th>
                                <th>Source</th>
                                <th>Statut</th>
                                <th>Reçu le</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach ($submissions as $submission)
                                <tr>
                                    <td data-label="ID">{{ $submission->id }}</td>
                                    <td data-label="Nom">
                                        <strong>{{ $submission->full_name ?: trim(($submission->given_names ?? '').' '.($submission->surname ?? '')) ?: 'N/A' }}</strong>
                                        <div class="mono">{{ $submission->nationality ?: 'Nationalité inconnue' }}</div>
                                    </td>
                                    <td data-label="Passeport" class="mono">{{ $submission->passport_number ?: 'N/A' }}</td>
                                    <td data-label="Naissance">{{ optional($submission->birth_date)->format('d/m/Y') ?: 'N/A' }}</td>
                                    <td data-label="Expiration">{{ optional($submission->expiry_date)->format('d/m/Y') ?: 'N/A' }}</td>
                                    <td data-label="Source" class="mono">{{ $submission->source_url ?: $submission->source_label ?: 'N/A' }}</td>
                                    <td data-label="Statut"><span class="badge">{{ $submission->status }}</span></td>
                                    <td data-label="Reçu le">{{ $submission->created_at?->format('d/m/Y H:i') }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                @endif
            </section>
        </main>
    </body>
</html>
