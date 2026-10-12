# 3.106.0 (2026-10-12)

## Added
- New source: the 2026 AGNP consensus guidelines for therapeutic drug monitoring in neuropsychopharmacology. 136 drugs now show their therapeutic reference range and 130 their laboratory alert level in the Pharmacokinetics block (for example clozapine 350–600 ng/mL, alert 1,000 ng/mL), each copied from the guideline's table and checked on its page; the range's tooltip gives how strongly the guideline recommends measuring it (9e834c2, 3667de8)
  fr: Nouvelle source : les recommandations de consensus AGNP 2026 sur le suivi thérapeutique pharmacologique en neuropsychopharmacologie. 136 substances affichent désormais leur zone thérapeutique et 130 leur seuil d'alerte du laboratoire dans le bloc Pharmacocinétique (par exemple clozapine 350–600 ng/mL, alerte 1 000 ng/mL), chacun recopié du tableau de la recommandation et vérifié sur sa page ; l'infobulle de la zone indique à quel point la recommandation conseille de la mesurer (9e834c2, 3667de8)

## Data
- The same guideline's enzyme table now backs 184 existing "metabolised by" rows with a second quote; where it names an enzyme we do not (or the reverse), nothing changes and the difference is listed for review (9e834c2, 537e185)
  fr: Le tableau des enzymes de cette même recommandation appuie désormais 184 lignes « métabolisé par » existantes d'une seconde citation ; là où il nomme une enzyme que nous ne citons pas (ou l'inverse), rien ne change et l'écart est listé pour examen (9e834c2, 537e185)

## Fixed
- Quote checking now reads pages split from rotated (landscape) PDF tables, and ignores soft hyphens and inline formatting tags inside a quoted sentence (c87f9e4, 504fb72)
  fr: La vérification des citations lit désormais les pages issues de tableaux PDF pivotés (paysage), et ignore les traits d'union conditionnels et les balises de mise en forme à l'intérieur d'une phrase citée (c87f9e4, 504fb72)
