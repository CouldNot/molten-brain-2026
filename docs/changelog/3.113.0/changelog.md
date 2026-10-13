# 3.113.0 (2026-10-13)

## Added
- Receptor panels gain a beta Downstream section: how activating the receptor changes the release of a transmitter, as a source describes the circuit. For example, H3 is an autoreceptor on presynaptic terminals whose activation decreases histamine release, and 5-HT2C sits on GABA interneurons and decreases dopamine release. Each line is its own sourced node (cdfe96d, 522bff0, 4a9b67d)
  fr: Les panneaux des récepteurs gagnent une section bêta En aval : comment l'activation du récepteur modifie la libération d'un neurotransmetteur, selon le circuit décrit par une source. Par exemple, H3 est un autorécepteur des terminaisons présynaptiques dont l'activation diminue la libération d'histamine, et 5-HT2C, situé sur des interneurones GABA, diminue la libération de dopamine. Chaque ligne est son propre nœud sourcé (cdfe96d, 522bff0, 4a9b67d)
- Drug panels gain a beta "Possible release changes via its bindings" section, derived from the drug's directional bindings: an antagonist reverses the effect of activation (pitolisant, an H3 antagonist, could increase histamine release), a binding with no known direction contributes nothing. It is computed, never stored, and worded conditionally (522bff0)
  fr: Les panneaux des médicaments gagnent une section bêta « Modifications de libération possibles via ses liaisons », déduite de leurs liaisons orientées : un antagoniste inverse l'effet de l'activation (le pitolisant, antagoniste H3, pourrait augmenter la libération d'histamine), une liaison sans sens connu n'apporte rien. Elle est calculée, jamais stockée, et formulée au conditionnel (522bff0)

## Data
- 64 receptor release-modulation nodes over 25 receptors (17 autoreceptor, 47 heteroreceptor), from Stahl's Essential Psychopharmacology and the receptors' Wikipedia articles, each quote checked on its page and confirmed by an independent Opus judge, which rejected two (e8de583, cc7ef74)
  fr: 64 nœuds de modulation de la libération sur 25 récepteurs (17 autorécepteurs, 47 hétérorécepteurs), tirés du Stahl's Essential Psychopharmacology et des articles Wikipédia des récepteurs, chaque citation vérifiée sur sa page et confirmée par un juge Opus indépendant, qui en a rejeté deux (e8de583, cc7ef74)

## Improved
- The receptor-effect and release-modulation sourcing passes share one applier loop instead of two copies (5c5d66a)
  fr: Les passes de sourçage des effets des récepteurs et de la modulation de la libération partagent une seule boucle d'application au lieu de deux copies (5c5d66a)

## Docs
- The new node kind, its pipeline and its panels are documented (8857d0a)
  fr: Le nouveau type de nœud, sa chaîne de traitement et ses panneaux sont documentés (8857d0a)
