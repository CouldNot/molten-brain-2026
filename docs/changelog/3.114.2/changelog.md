# 3.114.2 (2026-10-13)

## Fixed

- The guided tour's highlight ring no longer points off-screen while the panel is still scrolling to the row it marks: a step that scrolls its target into view now waits for it to arrive (and finishes a stalled smooth scroll with a jump) before ringing it (95eee4f)
  fr: L'anneau de surbrillance de la visite guidée ne pointe plus hors de l'écran pendant que le panneau défile encore vers la ligne qu'il marque : une étape qui fait défiler sa cible attend qu'elle soit arrivée (et termine un défilement doux bloqué par un saut) avant de l'entourer (95eee4f)
