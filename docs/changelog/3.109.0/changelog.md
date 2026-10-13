# 3.109.0 (2026-10-13)

## Data

- Fifteen missing active metabolites now appear under their parent drug, each with its own sourced bindings where its article states them: desmetramadol (tramadol), norclozapine (clozapine), norfenfluramine (fenfluramine), mCPP (trazodone), dextrorphan (both dextromethorphan combinations), norbuprenorphine, oxymorphone (oxycodone), norketamine and hydroxynorketamine (ketamine), MDA (MDMA), cotinine (nicotine), nordoxepin (doxepin), the two sibutramine metabolites and demoxepam (chlordiazepoxide) (f40c36e, 113d05f)
  fr: Quinze métabolites actifs manquants apparaissent désormais sous leur médicament parent, chacun avec ses propres liaisons sourcées lorsque son article les indique : desmétramadol (tramadol), norclozapine (clozapine), norfenfluramine (fenfluramine), mCPP (trazodone), dextrorphane (les deux associations au dextrométhorphane), norbuprénorphine, oxymorphone (oxycodone), norkétamine et hydroxynorkétamine (kétamine), MDA (MDMA), cotinine (nicotine), nordoxépine (doxépine), les deux métabolites de la sibutramine et le démoxépam (chlordiazépoxide) (f40c36e, 113d05f)
- Codeine, heroin, levodopa, oxcarbazepine and ethyl loflazepate are now marked as prodrugs: their panel shows the receptors they act on through their active metabolite (morphine, dopamine, licarbazepine, ...), and levodopa keeps its own role as the substrate dopamine is made from (db998f6)
  fr: La codéine, l'héroïne, la lévodopa, l'oxcarbazépine et le loflazépate d'éthyle sont désormais marqués comme prodrogues : leur panneau montre les récepteurs sur lesquels ils agissent via leur métabolite actif (morphine, dopamine, licarbazépine, ...), et la lévodopa garde son propre rôle de substrat à partir duquel la dopamine est fabriquée (db998f6)
- A metabolite that is itself a drug of the atlas is now linked to it instead of duplicated: venlafaxine to desvenlafaxine, diazepam to temazepam and oxazepam, thioridazine to mesoridazine, methamphetamine to amphetamine, and more (a184448, 113d05f)
  fr: Un métabolite qui est lui-même un médicament de l'atlas est désormais relié à celui-ci au lieu d'être dupliqué : venlafaxine vers desvenlafaxine, diazépam vers témazépam et oxazépam, thioridazine vers mésoridazine, méthamphétamine vers amphétamine, et d'autres (a184448, 113d05f)
- Prodrug half-lives now describe the drug itself, not its metabolite (flurazepam, clorazepate, prazepam, lumateperone), with the long-lived metabolite's own half-life shown under it; oxycodone and fentanyl half-lives re-picked from oral figures (ace42bb)
  fr: Les demi-vies des prodrogues décrivent désormais le médicament lui-même et non son métabolite (flurazépam, clorazépate, prazépam, lumatépérone), la demi-vie du métabolite à longue durée de vie étant affichée en dessous ; les demi-vies de l'oxycodone et du fentanyl sont reprises à partir de valeurs orales (ace42bb)
- Esketamine's measured affinities are its own again, and seven CYP / UGT metabolism routes whose isoform names were missed are now listed (a0617a7, a60f777, e7beefa)
  fr: Les affinités mesurées de l'eskétamine sont de nouveau les siennes, et sept voies de métabolisme CYP / UGT dont le nom d'isoforme était manqué sont désormais listées (a0617a7, a60f777, e7beefa)

## Docs

- The drug docs list the prodrug roster and how the half-life / metabolite passes merge and are scoped (5a63504)
  fr: La documentation des médicaments liste les prodrogues et explique comment les passes demi-vie / métabolites fusionnent et se restreignent (5a63504)
