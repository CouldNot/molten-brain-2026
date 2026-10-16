# 3.129.0 (2026-10-16)

## Added

- Every receptor's Effects section now shows something: a sourced effect, or a blue "unknown" pill saying which sources were searched and when; 5-HT1F gains antimigraine and sedation from papers (faeaf9a, 1c97f34, 86a9a75, 008da4f, 6d2e92b, a4047fe)
  fr: La section Effets de chaque récepteur affiche désormais quelque chose : un effet sourcé, ou une pastille bleue « inconnu » indiquant quelles sources ont été cherchées et quand ; le 5-HT1F gagne antimigraineux et sédation d'après des articles (faeaf9a, 1c97f34, 86a9a75, 008da4f, 6d2e92b, a4047fe)
- Eight new effects (bronchoconstriction, more gastric acid, muscle weakness, exaggerated startle, night blindness, ataxia, itch, itch relief), so glycine, mGluR1, mGluR6 and the muscle nicotinic receptor now have sourced effects (551f8cf, 4266381)
  fr: Huit nouveaux effets (bronchoconstriction, hausse de l'acidité gastrique, faiblesse musculaire, sursaut exagéré, cécité nocturne, ataxie, démangeaisons, soulagement des démangeaisons), si bien que les récepteurs glycine, mGluR1, mGluR6 et nicotinique musculaire ont désormais des effets sourcés (551f8cf, 4266381)
- An effect backed only by isolated human tissue (not living patients) now carries an orange warning (6fede37, 900de13)
  fr: Un effet appuyé seulement sur du tissu humain isolé (et non sur des patients) porte désormais un avertissement orange (6fede37, 900de13)
- Workup: checks the label asks only for some patients now show as "only if: ...", quoting the label; every label line was judged, and drugs with no French product use their European (EMA) label, so 246 checks over 85 drugs (982c1b3, 7bc8b80, c608391, f61c456, 04f10a2, d715d42, 246f31b, c4769ca)
  fr: Bilan : les examens que le RCP ne demande que pour certains patients s'affichent désormais « seulement si : ... », citant le RCP ; chaque ligne du RCP a été jugée, et les médicaments sans produit français utilisent leur RCP européen (EMA), soit 246 examens pour 85 médicaments (982c1b3, 7bc8b80, c608391, f61c456, 04f10a2, d715d42, 246f31b, c4769ca)
- 33 new drug bindings stated in the drugs' Wikipedia articles (amantadine, isoflurane, nitrous oxide, methamphetamine, ...), each quote checked (043afd5, c75c6d1, bc22195, 73f62d7, 3cd9aca)
  fr: 33 nouvelles liaisons de médicaments énoncées dans leurs articles Wikipédia (amantadine, isoflurane, protoxyde d'azote, méthamphétamine, ...), chaque citation vérifiée (043afd5, c75c6d1, bc22195, 73f62d7, 3cd9aca)

## Improved

- A tab showing an older build (a restored tab, or an offline launch) now reloads onto the latest version as soon as the server answers (510c81a)
  fr: Un onglet affichant une ancienne version (onglet restauré, ou lancement hors ligne) se recharge désormais sur la dernière version dès que le serveur répond (510c81a)
- Any data point can now be marked contradicted; amisulpride's tentative D2 partial agonism is flagged against GtoPdb, Wikipedia and a cAMP assay (e5ea521, b2b85d5, 187a488, c18614e)
  fr: Toute donnée peut désormais être marquée contredite ; l'agonisme partiel D2 incertain de l'amisulpride est signalé face à GtoPdb, Wikipédia et un test AMPc (e5ea521, b2b85d5, 187a488, c18614e)
- The effects index is computed once at build time instead of twice (1870cf3, cf89a12)
  fr: L'index des effets est calculé une seule fois à la construction au lieu de deux (1870cf3, cf89a12)

## Fixed

- "GABA-A-rho" no longer matches every GABA-A sentence when mining prose (6519e73)
  fr: « GABA-A-rho » ne correspond plus à chaque phrase sur le GABA-A lors de la fouille de texte (6519e73)

## Docs

- UNKNOWN effects, the tissue flag, site-keyed contradictions, the binding-gap pass and the EMA label fallback are documented (c84fa35, 32d7e2a, f9b1687, 03c03b4, ea2de9e)
  fr: Les effets INCONNUS, l'avertissement tissu isolé, les contradictions par site, la passe des liaisons manquantes et le repli sur le RCP de l'EMA sont documentés (c84fa35, 32d7e2a, f9b1687, 03c03b4, ea2de9e)
