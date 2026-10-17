# 3.131.2 (2026-10-17)

## Fixed

- When the server answers with an error, the app now keeps showing the copy it already had instead of the error page (d8bef1b)
  fr: Quand le serveur répond par une erreur, l'application garde la copie qu'elle avait déjà au lieu d'afficher la page d'erreur (d8bef1b)
- Opening "What's new" while offline no longer marks the unread notes as read (98d80a3)
  fr: Ouvrir « Nouveautés » hors ligne ne marque plus les notes non lues comme lues (98d80a3)
- Every link taken from the data, including the ClinPGx variant link, now has to be a web address before it is shown (fe5d445)
  fr: Tout lien tiré des données, y compris le lien ClinPGx d'un variant, doit désormais être une adresse web pour être affiché (fe5d445)

## Improved

- Clean-up of the code behind the panels: one shared builder for page elements, one shared "Found in" section for receptors and targets, and every saved preference read in one place (ec2a33a, d8bafbb, 730c0e3, 642e11f)
  fr: Nettoyage du code des panneaux : un seul constructeur d'éléments, une seule section « Présent dans » pour récepteurs et cibles, et toutes les préférences enregistrées lues au même endroit (ec2a33a, d8bafbb, 730c0e3, 642e11f)
- The data tools write their files atomically, refuse a citation page that looks like a file path, and share one reader for the Stahl index, the quote check and the judged files (8065f45, 09a7714, 52b5238, d8c878c, afde4ce, 8766171, 18406cd, 1c20e7b, 2b81088, 8dea2eb)
  fr: Les outils de données écrivent leurs fichiers de façon atomique, refusent une page de citation qui ressemble à un chemin de fichier, et partagent un seul lecteur pour l'index de Stahl, la vérification des citations et les fichiers jugés (8065f45, 09a7714, 52b5238, d8c878c, afde4ce, 8766171, 18406cd, 1c20e7b, 2b81088, 8dea2eb)
