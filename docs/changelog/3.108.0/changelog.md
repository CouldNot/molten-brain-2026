# 3.108.0 (2026-10-12)

## Data

- The 2026 AGNP drug-monitoring guideline's enzyme table now adds the metabolic routes no other source named: 141 new "Substrate of" rows over 78 drugs, 34 of which had no metabolising enzyme listed before (bromazepam, triazolam, cyamemazine...). Six enzymes join the list: CYP1A1, UGT1A1, UGT1A3, UGT1A6, UGT2B4 and UGT2B10 (2ffc84f)
  fr: Le tableau des enzymes du guide AGNP 2026 de suivi thérapeutique pharmacologique ajoute désormais les voies métaboliques qu'aucune autre source ne citait : 141 nouvelles lignes « Substrat de » sur 78 substances, dont 34 n'avaient jusque-là aucune enzyme de métabolisation (bromazépam, triazolam, cyamémazine...). Six enzymes rejoignent la liste : CYP1A1, UGT1A1, UGT1A3, UGT1A6, UGT2B4 et UGT2B10 (2ffc84f)

## Fixed

- The expression-sources update script writes its cache in the committed format again, so a re-run changes only the lines it should (b0949dc)
  fr: Le script de mise à jour des sources d'expression écrit de nouveau son cache dans le format versionné, si bien qu'une nouvelle exécution ne modifie que les lignes concernées (b0949dc)

## Docs

- The sourcing-gaps notes record what the AGNP enzyme table added and the four isoforms left out, with why (c6ce60c)
  fr: Les notes sur les lacunes de sourçage indiquent ce que le tableau des enzymes AGNP a ajouté et les quatre isoformes écartées, avec la raison (c6ce60c)
