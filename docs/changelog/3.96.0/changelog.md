# 3.96.0 (2026-10-11)

## Added

- Lithium's drug panel now notes that its half-life in the brain was measured at 28 hours, against 16 hours in blood, in a small study of two volunteers: the brain clears lithium more slowly than the blood does. The claim is quoted from the paper's abstract, stored through Europe PMC, which joins the sources for the few claims no textbook or label states. (11da822)
  fr: Le panneau du lithium indique désormais que sa demi-vie dans le cerveau a été mesurée à 28 heures, contre 16 heures dans le sang, dans une petite étude sur deux volontaires : le cerveau élimine le lithium plus lentement que le sang. L'affirmation est citée depuis le résumé de l'article, conservé via Europe PMC, qui rejoint les sources pour les rares affirmations qu'aucun manuel ni notice n'énonce. (11da822)

## Fixed

- Seven pathways backed only by a sentence about a whole set of regions (for example "the cortex projects to the striatum", or "the corpus callosum connects the two hemispheres") now carry an uncertainty warning on the pathway itself, not only on its transmitter or sign. (58ff7dd)
  fr: Sept voies appuyées uniquement par une phrase portant sur tout un ensemble de régions (par exemple « le cortex projette vers le striatum », ou « le corps calleux relie les deux hémisphères ») portent désormais un avertissement d'incertitude sur la voie elle-même, et pas seulement sur son neurotransmetteur ou son signe. (58ff7dd)
- Two brands listed twice under slightly different spellings are merged into one: Tranxene / Tranxène for clorazepate and Risperdal Consta / Risperdalconsta for risperidone. Each now shows once, tagged with both regions and both sources. (00762bf)
  fr: Deux marques listées deux fois sous des orthographes légèrement différentes sont fusionnées : Tranxene / Tranxène pour le clorazépate et Risperdal Consta / Risperdalconsta pour la rispéridone. Chacune n'apparaît plus qu'une fois, avec ses deux régions et ses deux sources. (00762bf)
- A stale half-life pick for a drug whose half-life Stahl already gives is now skipped instead of being reported as a rejection. (480f788)
  fr: Une demi-vie proposée pour un médicament dont Stahl donne déjà la demi-vie est désormais ignorée au lieu d'être signalée comme rejetée. (480f788)

## Data

- Naltrexone/bupropion no longer lists a substance use indication: no source states one for the combination, only for weight management. (d3fa6bb)
  fr: La naltrexone/bupropion n'affiche plus d'indication pour les troubles liés aux substances : aucune source n'en mentionne pour l'association, seulement pour la prise en charge du poids. (d3fa6bb)
