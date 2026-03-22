<?php
declare(strict_types=1);
?>
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Extension Visa Dashboard</title>
    <style>
        :root {
            color-scheme: light;
            --bg:
                radial-gradient(circle at top right, rgba(214, 117, 57, 0.22), transparent 30%),
                radial-gradient(circle at bottom left, rgba(12, 120, 140, 0.14), transparent 28%),
                linear-gradient(165deg, #f5efe6 0%, #e1ebf4 100%);
            --panel: rgba(255,255,255,0.86);
            --text: #17212b;
            --muted: #5d6772;
            --line: rgba(23,33,43,0.1);
            --accent: #af4d12;
            --accent-dark: #8d3f14;
            --shadow: 0 18px 44px rgba(20,30,45,0.1);
        }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
        .shell { max-width: 1280px; margin: 0 auto; padding: 28px 20px 48px; }
        .hero h1 { margin: 0; font-size: 36px; line-height: 1.04; }
        .eyebrow { margin: 0 0 8px; color: var(--accent); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; font-weight: 800; }
        .subtitle { margin: 10px 0 0; color: var(--muted); max-width: 760px; line-height: 1.6; }
        .grid { display: grid; gap: 16px; }
        .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 24px 0; }
        .layout { grid-template-columns: 1.2fr .8fr; align-items: start; }
        .card {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 20px;
            box-shadow: var(--shadow);
            backdrop-filter: blur(10px);
            padding: 18px;
        }
        .metric-label { margin: 0 0 8px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
        .metric-value { margin: 0; font-size: 30px; font-weight: 800; }
        .panel-title { margin: 0 0 6px; font-size: 18px; font-weight: 800; }
        .panel-note { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
        .toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
        button {
            appearance: none; border: 0; border-radius: 999px; padding: 11px 15px; font: inherit; font-weight: 800; cursor: pointer;
            background: var(--accent); color: #fff;
        }
        button.secondary { background: #e8eef4; color: var(--text); }
        button:hover { background: var(--accent-dark); }
        button.secondary:hover { background: #dbe5ee; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 12px 10px; border-top: 1px solid var(--line); vertical-align: top; }
        th { border-top: 0; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
        .badge { display: inline-block; border-radius: 999px; background: #fff1e7; color: var(--accent); padding: 4px 10px; font-size: 12px; font-weight: 800; }
        form { display: grid; gap: 12px; }
        .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
        label { display: grid; gap: 6px; font-size: 13px; font-weight: 700; }
        input, textarea, select {
            width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 11px 12px; font: inherit; background: rgba(255,255,255,.92);
        }
        textarea { min-height: 100px; resize: vertical; }
        .full { grid-column: 1 / -1; }
        .muted { color: var(--muted); }
        .status { margin-top: 10px; color: var(--muted); font-size: 13px; min-height: 20px; }
        @media (max-width: 980px) {
            .stats, .layout, .form-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <main class="shell">
        <header class="hero">
            <p class="eyebrow">Dashboard Web + Extension</p>
            <h1>Extension Visa Control Center</h1>
            <p class="subtitle">Dashboard web rapide avec statistiques, historique, formulaire de saisie manuelle et API PHP 8.1 compatible avec l’extension Chrome.</p>
        </header>

        <section class="grid stats">
            <article class="card"><p class="metric-label">Soumissions</p><p class="metric-value" id="stat-total">0</p></article>
            <article class="card"><p class="metric-label">Avec Passeport</p><p class="metric-value" id="stat-passport">0</p></article>
            <article class="card"><p class="metric-label">Avec Naissance</p><p class="metric-value" id="stat-birth">0</p></article>
            <article class="card"><p class="metric-label">Avec Email</p><p class="metric-value" id="stat-email">0</p></article>
        </section>

        <section class="grid layout">
            <article class="card">
                <div class="toolbar">
                    <div>
                        <h2 class="panel-title">Dernières soumissions</h2>
                        <p class="panel-note">Les données envoyées par l’extension apparaissent ici.</p>
                    </div>
                    <button type="button" class="secondary" id="refresh-button">Rafraîchir</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nom</th>
                            <th>Passeport</th>
                            <th>Nationalité</th>
                            <th>Statut</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody id="submissions-body">
                        <tr><td colspan="6" class="muted">Chargement...</td></tr>
                    </tbody>
                </table>
            </article>

            <article class="card">
                <h2 class="panel-title">Saisie manuelle</h2>
                <p class="panel-note">Ajoute une fiche sans passer par l’extension.</p>
                <form id="manual-form">
                    <div class="form-grid">
                        <label>Nom
                            <input name="surname" required>
                        </label>
                        <label>Prénoms
                            <input name="givenNames" required>
                        </label>
                        <label>Numéro de passeport
                            <input name="passportNumber">
                        </label>
                        <label>Nationalité
                            <input name="nationality">
                        </label>
                        <label>Date de naissance
                            <input type="date" name="birthDate">
                        </label>
                        <label>Date d'expiration
                            <input type="date" name="expiryDate">
                        </label>
                        <label>Téléphone
                            <input name="mobile_phone">
                        </label>
                        <label>Email
                            <input type="email" name="email">
                        </label>
                        <label>Civilité
                            <select name="title">
                                <option value="">Sélectionner</option>
                                <option value="Mr">Mr</option>
                                <option value="Mrs">Mrs</option>
                            </select>
                        </label>
                        <label>Sexe
                            <select name="sex">
                                <option value="">Sélectionner</option>
                                <option value="M">M</option>
                                <option value="F">F</option>
                            </select>
                        </label>
                        <label class="full">Texte OCR brut
                            <textarea name="raw_text"></textarea>
                        </label>
                    </div>
                    <button type="submit">Enregistrer</button>
                    <p class="status" id="form-status"></p>
                </form>
            </article>
        </section>
    </main>

    <script>
        const submissionsBody = document.getElementById('submissions-body');
        const refreshButton = document.getElementById('refresh-button');
        const manualForm = document.getElementById('manual-form');
        const formStatus = document.getElementById('form-status');

        refreshButton.addEventListener('click', loadDashboard);
        manualForm.addEventListener('submit', submitManualForm);

        loadDashboard();

        async function loadDashboard() {
            const [statsRes, submissionsRes] = await Promise.all([
                fetch('./api/stats.php').then(r => r.json()),
                fetch('./api/passport-submissions.php').then(r => r.json()),
            ]);

            document.getElementById('stat-total').textContent = statsRes.stats.total || 0;
            document.getElementById('stat-passport').textContent = statsRes.stats.with_passport || 0;
            document.getElementById('stat-birth').textContent = statsRes.stats.with_birth_date || 0;
            document.getElementById('stat-email').textContent = statsRes.stats.with_email || 0;

            const rows = submissionsRes.items || [];
            if (!rows.length) {
                submissionsBody.innerHTML = '<tr><td colspan="6" class="muted">Aucune soumission pour le moment.</td></tr>';
                return;
            }

            submissionsBody.innerHTML = rows.map((row) => `
                <tr>
                    <td>${escapeHtml(row.id)}</td>
                    <td><strong>${escapeHtml(row.full_name || '')}</strong><div class="mono">${escapeHtml(row.source_label || row.source_url || '')}</div></td>
                    <td class="mono">${escapeHtml(row.passport_number || '')}</td>
                    <td>${escapeHtml(row.nationality || '')}</td>
                    <td><span class="badge">${escapeHtml(row.status || 'received')}</span></td>
                    <td>${escapeHtml(row.created_at || '')}</td>
                </tr>
            `).join('');
        }

        async function submitManualForm(event) {
            event.preventDefault();

            const formData = new FormData(manualForm);
            const extracted = {
                title: formData.get('title') || '',
                surname: formData.get('surname') || '',
                givenNames: formData.get('givenNames') || '',
                fullName: `${formData.get('givenNames') || ''} ${formData.get('surname') || ''}`.trim(),
                passportNumber: formData.get('passportNumber') || '',
                nationality: formData.get('nationality') || '',
                issuingCountry: formData.get('nationality') || '',
                birthDate: formData.get('birthDate') || '',
                expiryDate: formData.get('expiryDate') || '',
                sex: formData.get('sex') || ''
            };

            const payload = {
                source_url: window.location.href,
                source_label: 'Manual dashboard entry',
                mobile_phone: formData.get('mobile_phone') || '',
                email: formData.get('email') || '',
                raw_text: formData.get('raw_text') || '',
                extracted_data: extracted
            };

            formStatus.textContent = 'Enregistrement...';

            const response = await fetch('./api/passport-submissions.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok || !result.ok) {
                formStatus.textContent = 'Erreur lors de l’enregistrement.';
                return;
            }

            manualForm.reset();
            formStatus.textContent = `Enregistré. ID ${result.id}.`;
            await loadDashboard();
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        }
    </script>
</body>
</html>
