# 3.100.0 (2026-10-11)

## Added
- Prodrugs now act through their active metabolite. A drug its source calls inactive until the body converts it (psilocybin into psilocin, lisdexamfetamine into dextroamphetamine, serdexmethylphenidate into dexmethylphenidate, clorazepate and prazepam into nordazepam) shows a sourced "Prodrug" line and no longer claims bindings of its own. Focusing it still lights the brain regions and pathways its metabolite reaches, and each target in "Acts on" says which metabolite it comes from. (815c5f7, e6eb46f)
  fr: Les promédicaments agissent désormais par leur métabolite actif. Un médicament que sa source dit inactif tant que l'organisme ne l'a pas transformé (la psilocybine en psilocine, la lisdexamfétamine en dexamfétamine, le serdexméthylphénidate en dexméthylphénidate, le clorazépate et le prazépam en nordazépam) affiche une ligne « Promédicament » sourcée et ne revendique plus de liaisons propres. Le sélectionner allume toujours les régions et voies que son métabolite atteint, et chaque cible de « Agit sur » indique de quel métabolite elle vient. (815c5f7, e6eb46f)

## Data
- Psilocin and nordazepam gain their own sourced receptor actions (psilocin: agonist at 5-HT2A, 5-HT2C and 5-HT1A, plus 16 measured binding sites; nordazepam: partial agonist at the GABA-A receptor). (dddca9c)
  fr: La psilocine et le nordazépam reçoivent leurs propres actions sur les récepteurs, sourcées (psilocine : agoniste des récepteurs 5-HT2A, 5-HT2C et 5-HT1A, plus 16 sites de liaison mesurés ; nordazépam : agoniste partiel du récepteur GABA-A). (dddca9c)
