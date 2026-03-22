# Visa OCR Platform

Plateforme composee de :

- une extension Chrome pour OCR de passeport et pre-remplissage
- un backend Laravel local pour stocker et consulter les donnees recues

## Architecture

- `panel.html` / `panel.js` : extension Chrome
- `server/` : application Laravel 13
- base SQLite locale dans Laravel
- API locale `POST /api/passport-submissions`
- dashboard Laravel sur `/`

## Fonctions Extension

- capture de l'onglet actif
- import d'une image locale
- OCR en `francais`, `anglais`, ou `francais + anglais`
- extraction des champs du passeport
- pre-remplissage du formulaire du site actif
- synchronisation des donnees vers Laravel
- copie du texte reconnu

## Fonctions Backend

- reception JSON depuis l'extension
- stockage SQLite des donnees OCR
- dashboard web pour consulter les soumissions

## Performance

- le moteur OCR est precharge a l'ouverture du popup
- l'image est reduite avant OCR pour eviter de traiter des captures trop lourdes
- le mode bilingue `francais + anglais` est plus lent et doit etre reserve aux vrais cas mixtes

## Lancer Laravel

1. Aller dans `server/`
2. Executer `php artisan serve`
3. Ouvrir `http://127.0.0.1:8000`

## Lancer l'extension

1. Ouvrir `chrome://extensions`
2. Activer le mode developpeur
3. Cliquer sur `Charger l'extension non empaquetee`
4. Selectionner ce dossier
5. Ouvrir une page, cliquer sur l'extension, puis `Capturer l'onglet` ou `Choisir une image`
6. Verifier les champs detectes, puis cliquer sur `Pre-remplir le site`
7. Pour envoyer au backend, laisser `http://127.0.0.1:8000` dans le champ backend puis cliquer sur `Envoyer au backend`

## Structure utile

- `manifest.json` : configuration de l'extension
- `panel.html`, `panel.js`, `popup.css` : interface, OCR et pre-remplissage
- `server/routes/api.php` : endpoint API Laravel
- `server/app/Http/Controllers/PassportSubmissionController.php` : logique backend
- `server/resources/views/dashboard.blade.php` : dashboard web
- `vendor/tesseract` : moteur OCR pour le navigateur
- `vendor/tesseract-core` : fichiers WebAssembly du moteur
- `vendor/tessdata/4.0.0_best_int` : langues OCR locales

## Notes

- le projet utilise `Tesseract.js`, mais les fichiers utiles ont ete copies dans `vendor/`
- l'extension peut continuer a fonctionner seule pour l'OCR et le pre-remplissage
- la synchronisation Laravel suppose que `php artisan serve` tourne localement
# extension-visa
