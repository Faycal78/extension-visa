<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$normalizedPath = rtrim($path, '/') ?: '/';
$isDashboard = in_array($normalizedPath, ['/dashboard', '/index.php/dashboard'], true);
?>
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= $isDashboard ? 'Pro Visa Dashboard' : 'Pro Visa | Agence de Visa' ?></title>
    <style>
        :root {
            color-scheme: light;
            --bg:
                radial-gradient(circle at top right, rgba(214, 117, 57, 0.22), transparent 30%),
                radial-gradient(circle at bottom left, rgba(12, 120, 140, 0.14), transparent 28%),
                linear-gradient(165deg, #f6efe6 0%, #e0ebf4 100%);
            --panel: rgba(255,255,255,0.88);
            --panel-strong: rgba(255,255,255,0.96);
            --text: #17212b;
            --muted: #5d6772;
            --line: rgba(23,33,43,0.1);
            --accent: #af4d12;
            --accent-dark: #8d3f14;
            --accent-soft: #fff1e7;
            --secondary: #0d6173;
            --shadow: 0 18px 44px rgba(20,30,45,0.1);
        }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
        a { color: inherit; text-decoration: none; }
        .shell { max-width: 1240px; margin: 0 auto; padding: 24px 20px 56px; }
        .nav {
            display: flex; justify-content: space-between; align-items: center; gap: 16px;
            padding: 14px 18px; background: var(--panel); border: 1px solid var(--line);
            border-radius: 18px; box-shadow: var(--shadow); backdrop-filter: blur(10px);
        }
        .brand { display: flex; align-items: center; gap: 12px; font-weight: 900; letter-spacing: .04em; }
        .brand-mark {
            width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center;
            background: linear-gradient(135deg, var(--accent), #d58e4d); color: #fff; font-size: 18px;
        }
        .nav-links { display: flex; gap: 16px; align-items: center; color: var(--muted); font-weight: 700; }
        .nav-cta, button {
            appearance: none; border: 0; border-radius: 999px; padding: 12px 16px; font: inherit;
            font-weight: 800; cursor: pointer; background: var(--accent); color: #fff;
        }
        .nav-cta.secondary, button.secondary { background: #e8eef4; color: var(--text); }
        .nav-cta:hover, button:hover { background: var(--accent-dark); }
        .nav-cta.secondary:hover, button.secondary:hover { background: #dbe5ee; }
        .hero {
            display: grid; grid-template-columns: 1.15fr .85fr; gap: 22px; align-items: stretch; margin-top: 22px;
        }
        .card {
            background: var(--panel); border: 1px solid var(--line); border-radius: 24px;
            box-shadow: var(--shadow); backdrop-filter: blur(10px); padding: 22px;
        }
        .eyebrow { margin: 0 0 10px; color: var(--accent); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; font-weight: 900; }
        h1, h2, h3, p { margin-top: 0; }
        .hero h1 { font-size: 52px; line-height: 1; margin-bottom: 14px; max-width: 12ch; }
        .subtitle { color: var(--muted); max-width: 60ch; line-height: 1.65; font-size: 16px; }
        .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
        .hero-panel {
            background:
                linear-gradient(160deg, rgba(13,97,115,.95), rgba(175,77,18,.92)),
                linear-gradient(160deg, #0d6173, #af4d12);
            color: #fff;
        }
        .hero-panel p { color: rgba(255,255,255,.84); line-height: 1.6; }
        .grid { display: grid; gap: 16px; }
        .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 24px 0; }
        .metric-label { margin: 0 0 8px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
        .metric-value { margin: 0; font-size: 30px; font-weight: 800; }
        .layout { grid-template-columns: 1.2fr .8fr; align-items: start; }
        .panel-title { margin: 0 0 6px; font-size: 18px; font-weight: 800; }
        .panel-note { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
        .toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 12px 10px; border-top: 1px solid var(--line); vertical-align: top; }
        th { border-top: 0; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
        .badge { display: inline-block; border-radius: 999px; background: var(--accent-soft); color: var(--accent); padding: 4px 10px; font-size: 12px; font-weight: 800; }
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
        .story { margin-top: 26px; grid-template-columns: 1fr 1fr 1fr; }
        .story h3 { margin-bottom: 8px; }
        .story p, .list p { color: var(--muted); line-height: 1.65; }
        .list { margin-top: 16px; display: grid; gap: 12px; }
        .list-item { display: grid; grid-template-columns: 38px 1fr; gap: 12px; align-items: start; }
        .list-badge {
            width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
            background: var(--accent-soft); color: var(--accent); font-weight: 900;
        }
        @media (max-width: 980px) {
            .hero, .stats, .layout, .form-grid, .story { grid-template-columns: 1fr; }
            .hero h1 { font-size: 40px; }
            .nav { flex-direction: column; align-items: flex-start; }
        }
    </style>
</head>
<body>
    <main class="shell">
        <nav class="nav">
            <div class="brand">
                <div class="brand-mark">PV</div>
                <div>
                    <div>PRO VISA</div>
                    <div class="muted" style="font-size:12px;font-weight:700;">Agence de preparation & suivi visa</div>
                </div>
            </div>
            <div class="nav-links">
                <a href="/">Accueil</a>
                <a href="/dashboard">Dashboard</a>
                <a class="nav-cta" href="/dashboard">Ouvrir le dashboard</a>
            </div>
        </nav>

        <?php if (!$isDashboard): ?>
        <section class="hero">
            <article class="card">
                <p class="eyebrow">Agence Pro Visa</p>
                <h1>Vos demandes de visa, gerees plus vite et plus proprement.</h1>
                <p class="subtitle">
                    Pro Visa accompagne les voyageurs, etudiants, familles et professionnels dans la preparation
                    de leurs dossiers. Nous structurons les informations, verifions les pieces, et fluidifions la
                    saisie des rendez-vous avec un suivi plus rigoureux.
                </p>
                <div class="hero-actions">
                    <a class="nav-cta" href="/dashboard">Acceder au dashboard</a>
                    <a class="nav-cta secondary" href="mailto:contact@pv-provisa.com">Contacter l'agence</a>
                </div>
                <div class="list">
                    <div class="list-item">
                        <div class="list-badge">01</div>
                        <div>
                            <h3>Preparation de dossier</h3>
                            <p>Controle des informations, coherence des documents et reduction des erreurs avant prise de rendez-vous.</p>
                        </div>
                    </div>
                    <div class="list-item">
                        <div class="list-badge">02</div>
                        <div>
                            <h3>Traitement plus rapide</h3>
                            <p>Centralisation des donnees voyageurs et pre-remplissage des formulaires pour gagner du temps sur les operations repetitives.</p>
                        </div>
                    </div>
                    <div class="list-item">
                        <div class="list-badge">03</div>
                        <div>
                            <h3>Suivi interne</h3>
                            <p>Tableau de bord, historique des soumissions et saisie manuelle pour garder la main sur chaque dossier client.</p>
                        </div>
                    </div>
                </div>
            </article>
            <article class="card hero-panel">
                <p class="eyebrow" style="color:#ffe0c8;">Pro Visa Method</p>
                <h2 style="font-size:30px; line-height:1.1;">Une agence orientee execution, pas seulement conseil.</h2>
                <p>
                    Notre approche combine verification humaine, organisation des donnees et outils de saisie assistee.
                    L'objectif est simple : limiter les erreurs de passeport, accelerer la prise en charge et garder
                    une vision claire de chaque demande.
                </p>
                <p>
                    Cette plateforme permet a l'agence de centraliser les fiches voyageurs et de piloter les dossiers
                    depuis un seul espace.
                </p>
            </article>
        </section>

        <section class="grid story">
            <article class="card">
                <p class="eyebrow">Clarte</p>
                <h3>Dossiers mieux structures</h3>
                <p>Chaque fiche voyageur est rassemblee avec les informations essentielles : identite, passeport, naissance, contact et contexte de saisie.</p>
            </article>
            <article class="card">
                <p class="eyebrow">Controle</p>
                <h3>Moins d'erreurs critiques</h3>
                <p>Les erreurs sur numero de passeport, nom, prenoms ou date de naissance coutent cher. Pro Visa travaille a les eliminer avant validation.</p>
            </article>
            <article class="card">
                <p class="eyebrow">Suivi</p>
                <h3>Un point d'entree unique</h3>
                <p>Le dashboard interne donne une vue rapide des soumissions recues depuis l'extension et des dossiers saisis manuellement.</p>
            </article>
        </section>
        <?php else: ?>
        <header style="margin-top:24px;">
            <p class="eyebrow">Dashboard Pro Visa</p>
            <h1 style="font-size:42px; line-height:1.04; margin-bottom:10px;">Pilotage des soumissions et saisie agence</h1>
            <p class="subtitle">Statistiques, historique et formulaire manuel relies a l'extension Chrome et au stockage local PHP 8.1.</p>
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
                        <h2 class="panel-title">Dernieres soumissions</h2>
                        <p class="panel-note">Les donnees envoyees par l’extension apparaissent ici.</p>
                    </div>
                    <button type="button" class="secondary" id="refresh-button">Rafraichir</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nom</th>
                            <th>Passeport</th>
                            <th>Nationalite</th>
                            <th>Coordonnees</th>
                            <th>Visa</th>
                            <th>Projet</th>
                            <th>Categorie</th>
                            <th>Statut</th>
                            <th>Date</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="submissions-body">
                        <tr><td colspan="11" class="muted">Chargement...</td></tr>
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
                        <label>Prenoms
                            <input name="givenNames" required>
                        </label>
                        <label>Numero de passeport
                            <input name="passportNumber">
                        </label>
                        <label>Nationalite
                            <input name="nationality">
                        </label>
                        <label>Date de naissance
                            <input type="date" name="birthDate">
                        </label>
                        <label>Date d'expiration
                            <input type="date" name="expiryDate">
                        </label>
                        <label>Telephone
                            <input name="mobile_phone">
                        </label>
                        <label>Email
                            <input type="email" name="email">
                        </label>
                        <label>Nombre de demandeurs
                            <input name="nbTravellers" type="text" placeholder="1">
                        </label>
                        <label>Formule
                            <select name="formula">
                                <option value="standard">Demande Standard</option>
                                <option value="premium">Service Premium</option>
                            </select>
                        </label>
                        <label>Civilite
                            <select name="title">
                                <option value="">Selectionner</option>
                                <option value="Mademoiselle">Mademoiselle</option>
                                <option value="Mr">Mr</option>
                                <option value="Mrs">Mrs</option>
                                <option value="Ms">Ms</option>
                            </select>
                        </label>
                        <label>Sexe
                            <select name="sex">
                                <option value="">Selectionner</option>
                                <option value="M">M</option>
                                <option value="F">F</option>
                            </select>
                        </label>
                        <label>Date de depart
                            <input type="date" name="departureDate">
                        </label>
                        <label>Type de visa demande
                            <select name="visaStayDuration">
                                <option value="short_stay_visa" selected>Court sejour (≤ 90 jours)</option>
                                <option value="long_stay_visa">Long sejour (&gt; 90 jours)</option>
                                <option value="transit_visa">Airport transit</option>
                            </select>
                        </label>
                        <label>Votre projet
                            <select name="travelPurpose">
                                <option value="">Selectionner</option>
                                <option value="etablissement_familial_prive">Etablissement familial ou prive</option>
                                <option value="raisons_medicales">Raisons medicales</option>
                                <option value="tourisme">Tourisme</option>
                                <option value="travailler">Travailler</option>
                                <option value="visite_familiale_privee">Visite familiale ou privee</option>
                                <option value="etudes">Etudes</option>
                            </select>
                        </label>
                        <label>Motif principal du sejour
                            <input name="typeVisa">
                        </label>
                        <label>Categorie du demandeur
                            <select name="visaFileVariation">
                                <option value="">Selectionner</option>
                                <option value="circulation">Circulation</option>
                                <option value="primo_demand">Primo-demande</option>
                                <option value="renewal">Voyageur Frequent (renouvellement)</option>
                                <option value="prof_org">Membre d'une Organisation Professionnelle</option>
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
        <?php endif; ?>
    </main>

    <?php if ($isDashboard): ?>
    <script>
        const submissionsBody = document.getElementById('submissions-body');
        const refreshButton = document.getElementById('refresh-button');
        const manualForm = document.getElementById('manual-form');
        const formStatus = document.getElementById('form-status');
        let dashboardItems = [];

        refreshButton.addEventListener('click', loadDashboard);
        manualForm.addEventListener('submit', submitManualForm);

        loadDashboard();

        async function loadDashboard() {
            const [statsRes, submissionsRes] = await Promise.all([
                fetch('/api/stats.php').then(r => r.json()),
                fetch('/api/passport-submissions.php').then(r => r.json()),
            ]);

            document.getElementById('stat-total').textContent = statsRes.stats.total || 0;
            document.getElementById('stat-passport').textContent = statsRes.stats.with_passport || 0;
            document.getElementById('stat-birth').textContent = statsRes.stats.with_birth_date || 0;
            document.getElementById('stat-email').textContent = statsRes.stats.with_email || 0;

            const rows = submissionsRes.items || [];
            dashboardItems = rows;
            if (!rows.length) {
                submissionsBody.innerHTML = '<tr><td colspan="11" class="muted">Aucune soumission pour le moment.</td></tr>';
                return;
            }

            submissionsBody.innerHTML = rows.map((row) => `
                <tr>
                    <td>${escapeHtml(row.id)}</td>
                    <td><strong>${escapeHtml(row.full_name || '')}</strong><div class="mono">${escapeHtml(row.source_label || row.source_url || '')}</div></td>
                    <td class="mono">${escapeHtml(row.passport_number || '')}</td>
                    <td>${escapeHtml(row.nationality || '')}<div class="mono">${escapeHtml(row.nb_travellers || '1')} demandeur(s) · ${escapeHtml(row.formula || 'standard')}</div></td>
                    <td><div>${escapeHtml(row.mobile_phone || '')}</div><div class="mono">${escapeHtml(row.email || '')}</div></td>
                    <td><div>${escapeHtml(displayVisaStay(row))}</div><div class="mono">${escapeHtml(displayDate(row.birth_date || extracted(row).birthDate || ''))}</div></td>
                    <td>${escapeHtml(displayTravelPurpose(row))}<div class="mono">${escapeHtml(displayDate(extracted(row).departureDate || ''))}</div></td>
                    <td>${escapeHtml(displayCategory(row))}<div class="mono">${escapeHtml(extracted(row).typeVisa || '')}</div></td>
                    <td><span class="badge">${escapeHtml(row.status || 'received')}</span></td>
                    <td>${escapeHtml(row.created_at || '')}</td>
                    <td><button type="button" class="secondary edit-row-button" data-id="${escapeHtml(row.id)}">Modifier</button></td>
                </tr>
            `).join('');

            document.querySelectorAll('.edit-row-button').forEach((button) => {
                button.addEventListener('click', () => loadSubmissionIntoForm(button.dataset.id));
            });
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
                sex: formData.get('sex') || '',
                nbTravellers: formData.get('nbTravellers') || '1',
                formula: formData.get('formula') || 'standard',
                mobilePhone: formData.get('mobile_phone') || '',
                email: formData.get('email') || '',
                emailConfirm: formData.get('email') || '',
                departureDate: formData.get('departureDate') || '',
                visaStayDuration: formData.get('visaStayDuration') || '',
                travelPurpose: formData.get('travelPurpose') || '',
                typeVisa: formData.get('typeVisa') || '',
                visaFileVariation: formData.get('visaFileVariation') || ''
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

            const response = await fetch('/api/passport-submissions.php', {
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
            formStatus.textContent = `Enregistre. ID ${result.id}.`;
            await loadDashboard();
        }

        function loadSubmissionIntoForm(id) {
            const row = dashboardItems.find((item) => String(item.id) === String(id));
            if (!row) {
                formStatus.textContent = 'Fiche introuvable.';
                return;
            }

            const data = extracted(row);
            manualForm.elements.surname.value = data.surname || row.surname || '';
            manualForm.elements.givenNames.value = data.givenNames || row.given_names || '';
            manualForm.elements.passportNumber.value = data.passportNumber || row.passport_number || '';
            manualForm.elements.nationality.value = data.nationality || row.nationality || '';
            manualForm.elements.birthDate.value = data.birthDate || row.birth_date || '';
            manualForm.elements.expiryDate.value = data.expiryDate || row.expiry_date || '';
            manualForm.elements.mobile_phone.value = data.mobilePhone || row.mobile_phone || '';
            manualForm.elements.email.value = data.email || row.email || '';
            manualForm.elements.nbTravellers.value = data.nbTravellers || row.nb_travellers || '1';
            manualForm.elements.formula.value = data.formula || row.formula || 'standard';
            manualForm.elements.title.value = data.title || row.title || '';
            manualForm.elements.sex.value = data.sex || row.sex || '';
            manualForm.elements.departureDate.value = data.departureDate || '';
            manualForm.elements.visaStayDuration.value = data.visaStayDuration || 'short_stay_visa';
            manualForm.elements.travelPurpose.value = data.travelPurpose || '';
            manualForm.elements.typeVisa.value = data.typeVisa || '';
            manualForm.elements.visaFileVariation.value = data.visaFileVariation || '';
            manualForm.elements.raw_text.value = row.raw_text || '';
            formStatus.textContent = `Fiche ${row.id} chargee dans le formulaire. Modifiez puis enregistrez.`;
            manualForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function extracted(row) {
            return row.extracted_data && typeof row.extracted_data === 'object' ? row.extracted_data : {};
        }

        function displayVisaStay(row) {
            const value = extracted(row).visaStayDuration || '';
            if (value === 'short_stay_visa') return 'Court sejour';
            if (value === 'long_stay_visa') return 'Long sejour';
            if (value === 'transit_visa') return 'Airport transit';
            return value;
        }

        function displayTravelPurpose(row) {
            const value = extracted(row).travelPurpose || '';
            const labels = {
                etablissement_familial_prive: 'Etablissement familial ou prive',
                raisons_medicales: 'Raisons medicales',
                tourisme: 'Tourisme',
                travailler: 'Travailler',
                visite_familiale_privee: 'Visite familiale ou privee',
                etudes: 'Etudes'
            };

            return labels[value] || value;
        }

        function displayCategory(row) {
            const value = extracted(row).visaFileVariation || '';
            const labels = {
                circulation: 'Circulation',
                primo_demand: 'Primo-demande',
                renewal: 'Voyageur Frequent',
                prof_org: 'Organisation Professionnelle'
            };

            return labels[value] || value;
        }

        function displayDate(value) {
            if (!value) return '';
            if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return value;
            const [year, month, day] = value.split('-');
            return `${day}/${month}/${year}`;
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
    <?php endif; ?>
</body>
</html>
