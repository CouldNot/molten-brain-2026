# 3.110.0 (2026-10-13)

## Added
- A drug's Pharmacokinetics section now lists its formulations (immediate, extended or delayed release, orally disintegrating, sublingual, nasal, patch, injection, depot), each with its own sourced brands, time to peak and half-life, so Seroquel XR or Invega Sustenna no longer read as the plain tablet (70d1558, 7e32a5d, b6e354d)
  fr: La section Pharmacocinétique d'un médicament liste désormais ses formes galéniques (libération immédiate, prolongée ou gastro-résistante, orodispersible, sublinguale, nasale, dispositif transdermique, injectable, dépôt), chacune avec ses propres noms commerciaux, délai du pic et demi-vie sourcés, si bien que Seroquel XR ou Invega Sustenna ne se lisent plus comme le comprimé simple (70d1558, 7e32a5d, b6e354d)

## Data
- 182 brands, 78 times to peak and 9 half-lives moved under the formulation their source names, across 142 drugs (38 with more than one formulation): paliperidone's 24 h peak is the extended-release tablet's, lithium and amphetamine get separate immediate and extended-release peaks, oxycodone and propranolol separate half-lives; a value whose source names no product stays on the molecule (af61929, 3822c67)
  fr: 182 noms commerciaux, 78 délais du pic et 9 demi-vies sont rangés sous la forme galénique que leur source nomme, sur 142 médicaments (38 avec plus d'une forme) : le pic à 24 h de la palipéridone est celui du comprimé à libération prolongée, le lithium et l'amphétamine ont des pics distincts en libération immédiate et prolongée, l'oxycodone et le propranolol des demi-vies distinctes ; une valeur dont la source ne nomme aucun produit reste sur la molécule (af61929, 3822c67)

## Fixed
- Prazepam's metabolite quote no longer runs on into the next section of its article, and the data check now refuses any quote spanning a page heading (0d8c3a5)
  fr: La citation du métabolite du prazépam ne déborde plus sur la section suivante de son article, et la vérification des données refuse désormais toute citation qui enjambe un titre de page (0d8c3a5)

## Docs
- The formulation node kind, its pipeline and its viewer rules are documented (9177aed)
  fr: Le type de nœud forme galénique, son pipeline et ses règles d'affichage sont documentés (9177aed)
