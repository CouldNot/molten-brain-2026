# 3.131.0 (2026-10-17)

## Fixed

- A doubted holder, originator, physchem value or NbN class now shows its orange "uncertain" pill instead of a green one (b11e305)
  fr: Un titulaire, un créateur, une valeur physico-chimique ou une classe NbN mise en doute affiche désormais sa pastille orange « incertain » au lieu d'une verte (b11e305)
- The Effects section hides itself when its index cannot be loaded, instead of showing an empty list (3c98c70)
  fr: La section Effets se masque quand son index ne peut pas être chargé, au lieu d'afficher une liste vide (3c98c70)
- The new-version check retries later when a reload still lands on the old build, and never reloads under an open guided tour (fe50219)
  fr: La vérification de nouvelle version réessaie plus tard quand un rechargement retombe sur l'ancienne version, et ne recharge jamais pendant la visite guidée (fe50219)
- Opening another panel closes a pinned tooltip; the dev banner is built without innerHTML (32b595a, e3e740b)
  fr: Ouvrir un autre panneau ferme une infobulle épinglée ; le bandeau de développement est construit sans innerHTML (32b595a, e3e740b)
- A PDSP measurement cited by an uncertainty reason now reads in full in its tooltip (row, Ki, species, radioligand, paper) instead of a bare database name (d56f48b)
  fr: Une mesure PDSP citée par une raison d'incertitude se lit désormais en entier dans son infobulle (ligne, Ki, espèce, radioligand, article) au lieu du seul nom de la base (d56f48b)

## Data

- MDMA's 5-HT1B and 5-HT1D partial agonism is marked contradicted: two human receptor screens found MDMA inactive at both up to 10000 nM (d56f48b)
  fr: L'agonisme partiel de la MDMA aux récepteurs 5-HT1B et 5-HT1D est marqué contredit : deux criblages sur récepteurs humains l'ont trouvée inactive aux deux jusqu'à 10000 nM (d56f48b)
- GtoPdb function rows are offered for receptor effects only when human, as documented; an isolated-tissue flag cites every isolated-tissue source (c644036, ddbf79d)
  fr: Les lignes de fonction GtoPdb ne sont proposées pour les effets des récepteurs que si elles sont humaines, comme documenté ; un signalement « tissu isolé » cite toutes ses sources (c644036, ddbf79d)

## Improved

- Every model-picked quote now carries a fingerprint of its sentence, so a rebuilt worklist can never attach a verdict to a different sentence (d471ac3, 7571ac1)
  fr: Chaque citation choisie par un modèle porte désormais une empreinte de sa phrase, si bien qu'une liste de travail reconstruite ne peut plus attacher un verdict à une autre phrase (d471ac3, 7571ac1)
- The data checks gate more: one walk for grades and quotes, measured Ki rows behind uncertainty reasons, node ids, and every viewer module for unbound names (7a90d40, bf1af98, e33e863, 0f875c1)
  fr: Les contrôles de données vérifient davantage : un seul parcours pour les grades et les citations, les lignes de Ki derrière les raisons d'incertitude, les identifiants de nœuds, et chaque module du visualiseur pour les noms non liés (7a90d40, bf1af98, e33e863, 0f875c1)
- The viewer's code is split from one 10 500-line file into focused modules, and its styles move out of the page into stylesheets; nothing on screen changes (2899be7, 40c380d, 87b9225, 73bbe06, c1ee254)
  fr: Le code du visualiseur passe d'un fichier de 10 500 lignes à des modules ciblés, et ses styles quittent la page pour des feuilles de style ; rien ne change à l'écran (2899be7, 40c380d, 87b9225, 73bbe06, c1ee254)
- The sourcing tools share one HTTP helper, one quote gate, one cache loader and one salt-word list instead of copies, and the EMA fetcher only follows EMA links (861662d, b866d94, b134d7b, 2ea5e4a, dc28798)
  fr: Les outils de sourçage partagent un seul assistant HTTP, une seule vérification de citation, un seul chargeur de cache et une seule liste de sels au lieu de copies, et le téléchargement EMA ne suit que des liens EMA (861662d, b866d94, b134d7b, 2ea5e4a, dc28798)
