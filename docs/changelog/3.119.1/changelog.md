# 3.119.1 (2026-10-13)

## Improved
- A drug's neurotransmitter tone no longer gives every weak binding a minimum weight: an affinity of 1 µM now adds nothing, so a few weak hits can add up but no longer outweigh one strong block, and an autoreceptor counts half as much as a reuptake block since it only partly brakes release (0d866ab)
  fr: Le tonus des neurotransmetteurs d'un médicament n'accorde plus de poids minimal à chaque liaison faible : une affinité de 1 µM n'ajoute plus rien, si bien que plusieurs liaisons faibles peuvent s'additionner sans dépasser un blocage puissant, et un autorécepteur compte moitié moins qu'un blocage de la recapture puisqu'il ne freine qu'en partie la libération (0d866ab)
