# 3.107.0 (2026-10-12)

## Added

- Paliperidone now reads "Paliperidone (9-OH-risperidone)", and its panel opens with "Active metabolite of Risperidone" (sourced, clickable). Risperidone's active-metabolite row names the same molecule, and searching "9-OH-risperidone" or "9-hydroxyrisperidone" finds it (8e5518d)
  fr: La palipéridone s'affiche désormais « Paliperidone (9-OH-risperidone) », et sa fiche s'ouvre sur « Métabolite actif de Risperidone » (sourcé, cliquable). La ligne de métabolite actif de la rispéridone nomme la même molécule, et une recherche « 9-OH-risperidone » ou « 9-hydroxyrisperidone » la trouve (8e5518d)

## Improved

- Drug panels are shorter: every section (brands, pharmacokinetics, bindings, metabolites, projections, metabolism, interactions...) starts collapsed, and clicking its heading opens it with its content indented. A jump into a section, and the guided tour, open it for you (b554d2e)
  fr: Les fiches de substances sont plus courtes : chaque section (noms commerciaux, pharmacocinétique, liaisons, métabolites, projections, métabolisme, interactions...) est repliée au départ, et un clic sur son titre l'ouvre, son contenu en retrait. Un saut vers une section, et la visite guidée, l'ouvrent pour vous (b554d2e)
- An active metabolite that is itself a modeled drug is now simply its clickable name, styled like the drug list, instead of a "See its N bindings" button (63cc10f)
  fr: Un métabolite actif qui est lui-même une substance modélisée est désormais simplement son nom cliquable, dans le style de la liste des substances, au lieu d'un bouton « Voir ses N liaisons » (63cc10f)

## Fixed

- Paliperidone, amphetamine, methylphenidate and pethidine no longer warn "measured as ..." on their affinities: the database files them under another name of the very same molecule, so there was nothing to warn about (8e5518d)
  fr: La palipéridone, l'amphétamine, le méthylphénidate et la péthidine n'affichent plus « mesuré sur ... » sur leurs affinités : la base les range sous un autre nom de la même molécule, il n'y avait donc rien à signaler (8e5518d)
- In French, time to peak and half-life now use the decimal comma like the therapeutic range beside them ("0,3–3 h") (b5666ce)
  fr: En français, le délai du pic et la demi-vie utilisent désormais la virgule décimale comme la zone thérapeutique voisine (« 0,3–3 h ») (b5666ce)
