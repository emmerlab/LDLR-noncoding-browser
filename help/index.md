<!-- # About this browser

This page is written in `help/index.md`. Edit it to describe your project, your data and how to read the tracks. Everything here is plain [Markdown](https://commonmark.org/help/), turned into HTML when you run `npm run build`. -->

## Reading a track

Each signal track has a name, a y-axis with its range, and a title for the units. Peaks or hits called from that signal sit directly underneath in the same color.

![Anatomy of a signal track](images/track-anatomy.svg "Figure 1. A signal track with its y-axis and the peaks track below it.")

<div class="only-mouse">
Click any track name in the viewer to jump to its section below.
</div>

<div class="only-touch">
Tap any track name in the viewer to jump to its section below.
</div> 

## Getting around

<div class="only-mouse">

| Do this | To |
| --- | --- |
| Scroll sideways (trackpad) or shift + scroll | Move along the chromosome |
| Alt / option + scroll over the tracks | Zoom in or out around the pointer |
| Drag across the tracks | Zoom to the region you selected |
| Double-click | Zoom out 3× around the pointer |
| Type in the position box | Jump to `chr19:11,089,082-11,092,493` |
| Zoom slider, top right | Zoom from a whole chromosome down to single bases |
| ← / → keys | Move 10% left or right |

</div>

<div class="only-touch">

| Do this | To |
| --- | --- |
| Swipe sideways on the tracks | Move along the chromosome |
| Two fingers on the tracks, then lift | Zoom to the region between them |
| Touch and hold on the tracks | Show values (like hovering) |
| Tap the track name | Track options, including *About this track* |
| Tap left of the tracks, then the red × | Hide the track |
| Hold left of the tracks for half a second, then drag | Reorder |

</div>

## Arranging tracks

<div class="only-mouse">

- **Reorder:** drag anywhere in the track's left area, up or down.
- **Hide:** hover a track name and click ×. Hidden tracks wait in the *Hidden tracks* tray under the viewer.
- **Bring back:** click a track in the tray to add it back, or drag it to the exact place you want. bed and bedGraph tracks will add close to their corresponding tracks instead of at the bottom.
- **Display options:** click a track name to change how it is drawn.

</div>

<div class="only-touch">

- **Reorder:** tap and hold anywhere in the track's left area, then drag up or down.
- **Hide:** tap track name and tap the red ×. Hidden tracks wait in the *Hidden tracks* tray under the viewer.
- **Bring back:** tap a track in the tray to add it back, or drag it to the exact place you want. bed and bedGraph tracks will add close to their corresponding tracks instead of at the bottom.
- **Display options:** tap a track name to change how it is drawn.

</div>

Your arrangement is remembered in this browser. **Reset view** in the toolbar restores the original layout and position.

## CRISPR tracks

![Schematic of the CRISPR tracks](images/Fig1_crispr.png "Graphical overview of the CRISPRn, CRISPRi, and CRISPRa screens")

The CRISPR tracks summarize saturation screening across the LDLR locus using 16,624 guide RNAs (gRNAs). Each gRNA was tested for its effect on cellular uptake of fluorescently labeled LDL in HuH7 cells. Guide abundance was compared between cells with high and low LDL uptake.

- **CRISPR nuclease (CRISPRn):** Cas9-generated insertions or deletions disrupt targeted sequences. Depletion of a gRNA in the LDL-high population suggests that the targeted region normally promotes LDLR expression or activity.
- **CRISPR inhibition (CRISPRi):** dCas9-KRAB represses regulatory activity without cutting the DNA. Depletion in the LDL-high population suggests that silencing the targeted region reduces LDLR expression or activity.
- **CRISPR activation (CRISPRa):** dCas9-VP64 recruits transcriptional activators. Enrichment in the LDL-high population suggests that activating the targeted region increases LDLR expression or activity.

Track heights represent the significance of effects aggregated over sliding 100-bp genomic windows (−log<sub>10</sub> empirical *p*-value). Peak intervals mark contiguous windows passing the study’s significance threshold (Benjamini–Hochberg-adjusted empirical *p* ≤ 0.01).

The primary enhancer-oriented views show **gRNA depletion for CRISPRn and CRISPRi** and **gRNA enrichment for CRISPRa**. These directions reflect the distinct mechanisms of the three assays and should not be interpreted as directly equivalent molecular perturbations.

## MPRA tracks

![Schematic of the MPRA tracks](images/Fig1_mpra.png "Graphical overview of the MPRA enhancer and repressor tracks")

The massively parallel reporter assay (MPRA) tests whether individual DNA sequences can alter reporter-gene expression outside their native genomic context. The LDLR region was represented by 2,899 overlapping 129-bp tiles, staggered every 43 bp. Each tile was linked to barcode sequences, and its activity was estimated from barcode abundance in messenger RNA relative to genomic DNA after lentiviral integration into HuH7 cells.

- **Enhancer track:** Regions containing tiles with reporter activity significantly above the random-sequence control distribution.
- **Repressor track:** Regions containing tiles with reporter activity significantly below the random-sequence control distribution.

The activity signal at each genomic coordinate represents the average activity of overlapping tiles. Peak intervals mark overlapping or adjacent significant tiles with Benjamini–Hochberg-adjusted *p* < 0.01.

MPRA measures the **sequence-intrinsic sufficiency** of a tile to influence reporter expression. It differs from the CRISPR screens, which perturb sequences in their native genomic context. Consequently, an MPRA-active region may not be significant in a CRISPR screen, and a CRISPR-identified region may not show autonomous MPRA activity.

