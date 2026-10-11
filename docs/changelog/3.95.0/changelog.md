# 3.95.0 (2026-10-11)

## Added

- The French public drug database (BDPM, from the French medicines agency) joins the sources. Its product sheets are read for how fast a drug peaks, how long it lasts, and its French brand names, which covers drugs sold in France but never in the US. (7f53bc3)
  fr: La base de données publique des médicaments (BDPM, de l'ANSM) rejoint les sources. Ses résumés des caractéristiques du produit sont lus pour le délai du pic d'un médicament, sa demi-vie et ses noms de marque français, ce qui couvre les médicaments vendus en France mais jamais aux États-Unis. (7f53bc3)

## Data

- The time to peak is now sourced for 167 drugs instead of 136, and bumetanide gains a sourced half-life. Four claimed sentences were rejected by a second model, mostly because they gave the peak of a metabolite or of children only. (c9e98fe)
  fr: Le délai du pic est désormais sourcé pour 167 médicaments au lieu de 136, et le bumétanide reçoit une demi-vie sourcée. Quatre phrases revendiquées ont été rejetées par un second modèle, surtout parce qu'elles donnaient le pic d'un métabolite ou des seuls enfants. (c9e98fe)
- 116 French brand names were added to 70 drugs, read straight off the product names, with generics named after the molecule or the laboratory left out. 230 drugs now show at least one brand. (7d57a7e)
  fr: 116 noms de marque français ont été ajoutés à 70 médicaments, lus directement dans le nom des produits, les génériques nommés d'après la molécule ou le laboratoire étant écartés. 230 médicaments affichent désormais au moins une marque. (7d57a7e)
