# 3.123.0 (2026-10-15)

## Improved
- A drug's Neurotransmitter tone rows now show an up or down arrow (tone rises or falls) instead of a left/right one, with a matching tooltip (5ad358a)
  fr: Les lignes « Tonus des neurotransmetteurs » d'un médicament affichent désormais une flèche vers le haut ou vers le bas (le tonus monte ou baisse) au lieu de gauche/droite, avec l'infobulle correspondante (5ad358a)
- In a source tooltip, a blank line now separates the quote from "How this quote got here" (55e4293)
  fr: Dans l'infobulle d'une source, une ligne vide sépare désormais la citation du « Parcours de cette citation » (55e4293)
- The address bar no longer carries auto-rotate, animation or animation-speed settings: a shared link still applies them if present, but never writes them (d6b76bb)
  fr: La barre d'adresse ne contient plus la rotation automatique, les animations ni leur vitesse : un lien partagé les applique toujours s'il les contient, mais ne les écrit plus (d6b76bb)

## Fixed
- The Pharmacokinetics values (time to peak, half-life, therapeutic range, alert level) no longer sit glued to the previous value's source badge (33b46e7)
  fr: Les valeurs de pharmacocinétique (délai du pic, demi-vie, zone thérapeutique, seuil d'alerte) ne sont plus collées au badge de source de la valeur précédente (33b46e7)
