# 3.98.0 (2026-10-11)

## Added

- Hovering a source's grade pill now shows the date the cited page was downloaded, so you can tell how recent an online source is. (a47a0bc, 48fed7c)
  fr: Survoler la pastille de fiabilité d'une source affiche désormais la date de téléchargement de la page citée, pour savoir à quel point une source en ligne est récente. (a47a0bc, 48fed7c)
- A freshness check now refuses any cited online page (Wikipedia, GtoPdb, DailyMed, ...) downloaded more than twelve months ago, so sources cannot silently go stale. (013c094, 96746c2)
  fr: Une vérification de fraîcheur refuse désormais toute page en ligne citée (Wikipédia, GtoPdb, DailyMed, ...) téléchargée il y a plus de douze mois, pour que les sources ne vieillissent pas en silence. (013c094, 96746c2)

## Data

- Refetched the online sources (English and French Wikipedia, the GtoPdb ligand data, the DailyMed labels): bromocriptine now reads as an alpha-2 agonist and propranolol as a beta-3 partial agonist, following GtoPdb's latest release. (4c07f64, e3dce46)
  fr: Les sources en ligne ont été retéléchargées (Wikipédia anglais et français, les données de ligands de GtoPdb, les notices DailyMed) : la bromocriptine apparaît désormais comme agoniste alpha-2 et le propranolol comme agoniste partiel bêta-3, d'après la dernière version de GtoPdb. (4c07f64, e3dce46)

## Docs

- Documented source freshness and how to refetch an online corpus. (5d9c2db)
  fr: Documentation de la fraîcheur des sources et de la façon de retélécharger un corpus en ligne. (5d9c2db)
