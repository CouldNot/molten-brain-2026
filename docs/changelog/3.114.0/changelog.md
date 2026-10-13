# 3.114.0 (2026-10-13)

## Added

- A claim backed only by animal studies (rat, mouse, monkey...) now carries an "animal evidence" caution, naming the species, on drug bindings, metabolite bindings, projection transmitters and signs, and receptor regions (49f6865, 522bff0)
  fr: Une affirmation appuyée uniquement par des études animales (rat, souris, singe...) porte désormais une mise en garde « données animales » nommant l'espèce, sur les liaisons des médicaments et de leurs métabolites, les neurotransmetteurs et signes des projections, et les régions des récepteurs (49f6865, 522bff0)

## Fixed

- A judge verdict now belongs to the place a quote is cited, not to the quote alone, so a sentence reused to back a second claim is judged again for it: 341 citations were re-judged by an independent Opus judge, and the 8 it rejected were downgraded (two Tmax values, two D2 antagonist bindings, one brand, six sibutramine metabolite bindings) (99648b3, 93bea46, c4b56e3)
  fr: Le verdict d'un juge porte désormais sur l'endroit où une citation est utilisée, et non sur la citation seule : une phrase réutilisée pour une seconde affirmation est jugée à nouveau. 341 citations ont été rejugées par un juge Opus indépendant, et les 8 rejetées ont été rétrogradées (deux Tmax, deux liaisons antagonistes D2, une marque, six liaisons des métabolites de la sibutramine) (99648b3, 93bea46, c4b56e3)

## Data

- Seven active metabolites (dehydroaripiprazole, M-II, desmethylselegiline, l-amphetamine, l-methamphetamine, desipramine from lofepramine, mCPP) now cite a sentence saying they are active, not just their half-life (8e1edae)
  fr: Sept métabolites actifs (déhydroaripiprazole, M-II, desméthylsélégiline, l-amphétamine, l-méthamphétamine, désipramine issue de la lofépramine, mCPP) citent désormais une phrase indiquant qu'ils sont actifs, et non plus seulement leur demi-vie (8e1edae)

## Improved

- The name-folding helpers used to join drug names across sources are now one shared function instead of several copies (66ca968)
  fr: Les fonctions de normalisation des noms utilisées pour relier les médicaments entre sources sont désormais une seule fonction partagée au lieu de plusieurs copies (66ca968)

## Docs

- Site-keyed judge stamps, split verdicts and the animal evidence flag are documented (fe7b817)
  fr: Les verdicts par site de citation, les verdicts partagés et l'indicateur de données animales sont documentés (fe7b817)
