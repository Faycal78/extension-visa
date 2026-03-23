# Visa OCR Platform

Plateforme composee de :

- une extension Chrome pour OCR de passeport et pre-remplissage
- un dashboard web PHP 8.1 pour stocker et consulter les donnees recues

## Architecture

- `panel.html` / `panel.js` : extension Chrome
- `webapp/` : dashboard web PHP 8.1
- base SQLite locale dans `webapp/storage/data.sqlite`
- API `POST /api/passport-submissions.php`
- accueil web sur `/`
- dashboard web sur `/dashboard`

## Fonctions Extension

- capture de l'onglet actif
- import d'une image locale
- OCR en `francais`, `anglais`, ou `francais + anglais`
- extraction des champs du passeport
- pre-remplissage du formulaire du site actif
- synchronisation des donnees vers le dashboard web
- copie du texte reconnu

## Fonctions Backend

- reception JSON depuis l'extension
- stockage SQLite des donnees OCR
- dashboard web avec statistiques
- formulaire manuel de saisie

## Performance

- le moteur OCR est precharge a l'ouverture du popup
- l'image est reduite avant OCR pour eviter de traiter des captures trop lourdes
- le mode bilingue `francais + anglais` est plus lent et doit etre reserve aux vrais cas mixtes

## Lancer Le Dashboard Web

1. Aller dans `webapp/`
2. Executer `php -S 127.0.0.1:8000`
3. Ouvrir `http://127.0.0.1:8000/`
4. Le dashboard interne est disponible sur `http://127.0.0.1:8000/dashboard`

## Lancer l'extension

1. Ouvrir `chrome://extensions`
2. Activer le mode developpeur
3. Cliquer sur `Charger l'extension non empaquetee`
4. Selectionner ce dossier
5. Ouvrir une page, cliquer sur l'extension, puis `Capturer l'onglet` ou `Choisir une image`
6. Verifier les champs detectes, puis cliquer sur `Pre-remplir le site`
7. Pour envoyer au dashboard, laisser `http://127.0.0.1:8000` dans le champ backend puis cliquer sur `Envoyer au backend`

## Structure utile

- `manifest.json` : configuration de l'extension
- `panel.html`, `panel.js`, `popup.css` : interface, OCR et pre-remplissage
- `webapp/index.php` : dashboard web
- `webapp/api/passport-submissions.php` : endpoint principal
- `webapp/api/stats.php` : statistiques
- `vendor/tesseract` : moteur OCR pour le navigateur
- `vendor/tesseract-core` : fichiers WebAssembly du moteur
- `vendor/tessdata/4.0.0_best_int` : langues OCR locales

## Notes

- le projet utilise `Tesseract.js`, mais les fichiers utiles ont ete copies dans `vendor/`
- l'extension peut continuer a fonctionner seule pour l'OCR et le pre-remplissage
- le dashboard web est compatible PHP 8.1
- vous pouvez deployer `webapp/` seul sur un hebergement PHP classique
