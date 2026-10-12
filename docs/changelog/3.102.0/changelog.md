# 3.102.0 (2026-10-12)

## Added
- A new grade, UNKNOWN (∅): a binding direction that was searched for in every source this app draws on (PDSP, the Guide to Pharmacology, English and French Wikipedia, and Europe PMC abstracts), on a recorded date, without any of them stating it. It is a finding about the literature, not a gap in our work, so it gets its own pill and no longer counts against the sourced percentage. Each search expires after a year. (0eef0f9, b0104b1, 8bfb772)
  fr: Une nouvelle note, INCONNU (∅) : un sens d'action d'une liaison recherché, à une date enregistrée, dans toutes les sources de l'application (PDSP, Guide to Pharmacology, Wikipédia en anglais et en français, résumés Europe PMC), sans qu'aucune ne l'indique. C'est un constat sur la littérature, pas une lacune de notre travail : il a sa propre pastille et ne pèse plus sur le pourcentage sourcé. Chaque recherche expire au bout d'un an. (0eef0f9, b0104b1, 8bfb772)

## Fixed
- In a drug's "Acts on" list, the source pill after a binding's direction no longer overlaps the end of the text. (da03d1b)
  fr: Dans la liste « Agit sur » d'un médicament, la pastille de source qui suit le sens d'action d'une liaison ne chevauche plus la fin du texte. (da03d1b)

## Data
- That search gave 52 measured-only bindings their direction (40 antagonists, 9 agonists among them); the other 656 now read UNKNOWN. (2f3880f)
  fr: Cette recherche a donné leur sens d'action à 52 liaisons qui n'avaient qu'une affinité mesurée (dont 40 antagonistes et 9 agonistes) ; les 656 autres sont désormais INCONNU. (2f3880f)
- Newly sourced: the GABA-A action of brotizolam, meprobamate, chloral hydrate and etomidate, brivaracetam at SV2A, the amphetamines' vesicular release through VMAT2, methamphetamine as a releaser at the three monoamine transporters, and the claustrum's glutamatergic projection to the frontal lobe (from primary-paper abstracts). (bdd0573, 2f3880f)
  fr: Nouvellement sourcés : l'action GABA-A du brotizolam, du méprobamate, de l'hydrate de chloral et de l'étomidate, le brivaracétam sur SV2A, la libération vésiculaire des amphétamines via VMAT2, la méthamphétamine comme agent libérateur aux trois transporteurs des monoamines, et la projection glutamatergique du claustrum vers le lobe frontal (d'après des résumés d'articles originaux). (bdd0573, 2f3880f)
- Xanomeline, 2C-B, mescaline, ibogaine, phencyclidine and amoxapine gain the receptor affinities their Wikipedia tables list, and a re-run of the Guide to Pharmacology pass gives several of them, plus asenapine, iloperidone and hydromorphone sites, a direction. (f5c8941, 479b3f8)
  fr: La xanoméline, le 2C-B, la mescaline, l'ibogaïne, la phencyclidine et l'amoxapine reçoivent les affinités listées dans leurs tableaux Wikipédia, et une nouvelle passe du Guide to Pharmacology donne un sens d'action à plusieurs d'entre elles ainsi qu'à des sites de l'asénapine, de l'ilopéridone et de l'hydromorphone. (f5c8941, 479b3f8)
