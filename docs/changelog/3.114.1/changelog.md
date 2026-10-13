# 3.114.1 (2026-10-13)

## Fixed

- A DailyMed label is now read with its route of administration, so a generic asenapine "tablet" counts as sublingual and "Extended Phenytoin Sodium Capsules" as extended release: their peak times now sit on the right formulation (e407303, ba311f6)
  fr: Une notice DailyMed est désormais lue avec sa voie d'administration : un « comprimé » générique d'asénapine compte comme sublingual et les « Extended Phenytoin Sodium Capsules » comme à libération prolongée, leurs Tmax sont donc rattachés à la bonne forme (e407303, ba311f6)
- Revex is listed as nalmefene's US injectable brand, not a French one (23c9cc6)
  fr: Revex est indiqué comme la marque injectable américaine du nalméfène, et non comme une marque française (23c9cc6)

## Data

- The citations downgraded in 3.114.0 are sourced again: amisulpride and lumateperone D2 antagonism (Stahl), asenapine and phenytoin peak times (US labels), Revex (Carlat), sibutramine's two metabolites on the serotonin, noradrenaline and dopamine transporters, and disulfiram's active metabolite (Europe PMC abstracts) (23c9cc6, ba311f6, 5c432cc, 3a6218d)
  fr: Les citations rétrogradées en 3.114.0 sont de nouveau sourcées : antagonisme D2 de l'amisulpride et de la lumatépérone (Stahl), Tmax de l'asénapine et de la phénytoïne (notices américaines), Revex (Carlat), les deux métabolites de la sibutramine sur les transporteurs de la sérotonine, de la noradrénaline et de la dopamine, et le métabolite actif du disulfirame (résumés Europe PMC) (23c9cc6, ba311f6, 5c432cc, 3a6218d)
