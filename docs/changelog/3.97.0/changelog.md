# 3.97.0 (2026-10-11)

## Added

- Search now opens in its own popup over the scene, closed by its × button, a click outside it, or Escape, instead of replacing the settings pane. (43fcfae)
  fr: La recherche s'ouvre désormais dans sa propre fenêtre au-dessus de la scène, fermée par son bouton ×, un clic à l'extérieur ou Échap, au lieu de remplacer le panneau des réglages. (43fcfae)
- Search finds a name typed in either language (for example "noyau caudé" in English, "caudate nucleus" in French) and common acronyms such as VTA, LC, NAc, PFC, STN, MPH or DXM. Names starting with what you typed are listed first. (1e0558c)
  fr: La recherche trouve un nom saisi dans l'une ou l'autre langue (par exemple « caudate nucleus » en français, « noyau caudé » en anglais) et les acronymes courants comme AVT, LC, NAc, PFC, STN, MPH ou DXM. Les noms qui commencent par le texte saisi sont listés en premier. (1e0558c)
- The Wikipedia summary at the top of a panel is clipped to its first few lines, with a Read more button to unfold the rest. (d1ed1b9)
  fr: Le résumé Wikipédia en tête d'un panneau est réduit à ses premières lignes, avec un bouton Lire la suite pour déplier le reste. (d1ed1b9)
- A drug with no receptor binding, such as lithium, can now be opened from search and from the drug list. (8190411)
  fr: Un médicament sans liaison à un récepteur, comme le lithium, peut désormais être ouvert depuis la recherche et depuis la liste des médicaments. (8190411)

## Improved

- A drug's metabolism section groups its enzymes under one heading per role (substrate of, inhibits, induces), one enzyme per line, with the "not the full set of routes" note folded above the list. (adfccb9)
  fr: La section métabolisme d'un médicament regroupe ses enzymes sous un titre par rôle (substrat de, inhibe, induit), une enzyme par ligne, avec la note « pas l'ensemble des voies » repliée au-dessus de la liste. (adfccb9)
- The drug panel's timing block is named Pharmacokinetics, and its half-life is labelled as the plasma elimination half-life. (2114aef)
  fr: Le bloc temporel du panneau d'un médicament s'intitule Pharmacocinétique, et sa demi-vie est désignée comme la demi-vie d'élimination plasmatique. (2114aef)
- The What's new popup is wider on large screens. (c1cfa92)
  fr: La fenêtre Nouveautés est plus large sur les grands écrans. (c1cfa92)

## Fixed

- Every source pill now names its grade in words, and its tooltip explains the grade then says what to click; enzyme pills sit after the enzyme they grade. (f01c324, 09f7d11)
  fr: Chaque pastille de source nomme désormais son niveau en toutes lettres, et son infobulle explique ce niveau puis indique où cliquer ; les pastilles des enzymes suivent l'enzyme qu'elles qualifient. (f01c324, 09f7d11)
- The Simulation tab's beta tag sits right after its name. (87e876c)
  fr: L'étiquette bêta de l'onglet Simulation suit directement son nom. (87e876c)

## Docs

- The data tools share one accent-folding helper instead of eight copies. (3a0166c)
  fr: Les outils de données partagent un seul utilitaire de suppression des accents au lieu de huit copies. (3a0166c)
