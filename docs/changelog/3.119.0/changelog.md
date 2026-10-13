# 3.119.0 (2026-10-13)

## Added

- A drug's "Projections affected" section is now "Neurotransmitter tone (indicative)": each system shows its signed value and, below it, the sum it comes from, one line per binding (target, why it changes the tone, +1 or −1 times its affinity weight, its own source badge), under a warning that this is a rough indicative value and not a clinical measure. A system's list of drugs now shows each drug's tone and is ranked by it (c811518)
  fr: La section « Projections concernées » d'un médicament devient « Tonus des neurotransmetteurs (indicatif) » : chaque système affiche sa valeur signée et, en dessous, la somme dont elle provient, une ligne par liaison (cible, pourquoi elle modifie le tonus, +1 ou −1 multiplié par son poids d'affinité, son propre badge de source), sous un avertissement rappelant qu'il s'agit d'une valeur indicative approximative et non d'une mesure clinique. La liste des substances d'un système affiche désormais le tonus de chacune et est classée selon celui-ci (c811518)

## Improved

- The drug's target list is now called "Direct molecular targets", since it holds transporters and enzymes as well as receptors (907cf19)
  fr: La liste des cibles d'un médicament s'appelle désormais « Cibles moléculaires directes », puisqu'elle contient des transporteurs et des enzymes autant que des récepteurs (907cf19)
- Sections you unfold in a panel stay unfolded on the next panel of the same kind, so switching from one drug to another keeps the same sections open for comparison (7c9e683)
  fr: Les sections dépliées dans une fiche restent dépliées dans la fiche suivante du même type : passer d'un médicament à un autre garde les mêmes sections ouvertes pour les comparer (7c9e683)

## Fixed

- An uncertain badge's tooltip no longer prints the same database reference twice (once without its link) (f999e77)
  fr: L'infobulle d'un badge incertain n'affiche plus deux fois la même référence de base de données (dont une sans son lien) (f999e77)
