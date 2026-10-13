# 3.112.0 (2026-10-13)

## Improved
- An active metabolite shared by several drugs is now defined once: nordazepam, for instance, is one record whichever of diazepam, clorazepate, prazepam or chlordiazepoxide makes it, so its bindings and half-life can never disagree between parents. The tally already counted each metabolite once by name, so the drug metabolite bindings figure is unchanged by this (444f603, bcbd265)
  fr: Un métabolite actif partagé par plusieurs médicaments n'est plus défini qu'une fois : le nordazépam, par exemple, est un seul enregistrement quel que soit le médicament qui le produit (diazépam, clorazépate, prazépam ou chlordiazépoxide), si bien que ses liaisons et sa demi-vie ne peuvent plus diverger d'un parent à l'autre. Le décompte comptait déjà chaque métabolite une seule fois par son nom, le nombre de liaisons de métabolites reste donc inchangé (444f603, bcbd265)

## Added
- The About panel lists metabolites.jsonl among the downloadable data files (a888bbf)
  fr: Le panneau À propos liste metabolites.jsonl parmi les fichiers de données téléchargeables (a888bbf)

## Data
- Sibutramine is now marked as a prodrug: its two active metabolites, desmethylsibutramine and didesmethylsibutramine, each inhibit serotonin, noradrenaline and dopamine reuptake, with their Ki read from the comparison table in sibutramine's Wikipedia article (15 to 49 nM). Six metabolite bindings are added and sibutramine's own three are removed (463d2bf, 38618e2)
  fr: La sibutramine est désormais signalée comme promédicament : ses deux métabolites actifs, la desméthylsibutramine et la didesméthylsibutramine, inhibent chacun la recapture de la sérotonine, de la noradrénaline et de la dopamine, avec leurs Ki lus dans le tableau comparatif de l'article Wikipédia de la sibutramine (15 à 49 nM). Six liaisons de métabolites sont ajoutées et les trois liaisons propres à la sibutramine retirées (463d2bf, 38618e2)
- Brexpiprazole no longer lists DM-3411 as an active metabolite: its sources describe it as a major metabolite, not an active one (853a0e0)
  fr: Le brexpiprazole ne liste plus DM-3411 comme métabolite actif : ses sources le décrivent comme un métabolite majeur, pas comme un métabolite actif (853a0e0)
- Three half-life quotes (cannabidiol, furosemide, bumetanide) point again at the sentence that states them, after their article text had shifted (3854313)
  fr: Trois citations de demi-vie (cannabidiol, furosémide, bumétanide) pointent de nouveau vers la phrase qui les énonce, après un décalage du texte de leur article (3854313)
