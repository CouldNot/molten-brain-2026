# 3.116.0 (2026-10-13)

## Added

- Receptor and target panels gain a "Genetic variants" section: the variants of the receptor's gene that ClinPGx (formerly PharmGKB) associates with how people respond to a drug, grouped by variant (DRD2 Taq1A, OPRM1 A118G, the serotonin transporter's long and short forms, ...), each with its evidence level, a conditional "may be associated with" sentence, the phenotypes, a link to ClinPGx and a source pill carrying ClinPGx's own per-genotype sentences, under one not-medical-advice caveat (db5451b, 6c68c3a)
  fr: Les fiches des récepteurs et des cibles gagnent une section « Variants génétiques » : les variants du gène du récepteur que ClinPGx (anciennement PharmGKB) associe à la réponse à un médicament, regroupés par variant (Taq1A de DRD2, A118G d'OPRM1, formes longue et courte du transporteur de la sérotonine, ...), chacun avec son niveau de preuve, une phrase au conditionnel « pourrait être associé à », les phénotypes, un lien vers ClinPGx et une pastille de source portant les phrases de ClinPGx par génotype, sous un seul avertissement « pas un avis médical » (db5451b, 6c68c3a)
- A drug panel lists the gene variants ClinPGx annotates for that drug by name, grouped under the receptor or target whose gene carries them (6c68c3a)
  fr: La fiche d'un médicament liste les variants génétiques que ClinPGx annote pour ce médicament nommément, regroupés sous le récepteur ou la cible dont le gène les porte (6c68c3a)

## Data

- New source: ClinPGx clinical annotations (CC BY-SA 4.0), 546 annotations over 46 receptor and target genes at evidence levels 1A to 3 (level 4 left out; all but two are level 3, a single study or several that do not clearly agree), each quote copied verbatim from a committed, pinned export and re-checked against it on every build (db5451b, 97cb8fc)
  fr: Nouvelle source : les annotations cliniques de ClinPGx (CC BY-SA 4.0), 546 annotations sur 46 gènes de récepteurs et de cibles aux niveaux de preuve 1A à 3 (le niveau 4 est écarté ; toutes sauf deux sont de niveau 3, une seule étude ou plusieurs qui ne concordent pas nettement), chaque citation copiée verbatim depuis un export versionné et épinglé, et revérifiée contre lui à chaque génération (db5451b, 97cb8fc)
