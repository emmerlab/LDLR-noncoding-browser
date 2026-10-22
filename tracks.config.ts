/**
 * tracks.config.ts
 * ----------------------------------------------------------------------------
 * Optional settings for the browser. Every field is optional; delete this file
 * entirely and the build still works with defaults.
 *
 * Tracks are found automatically in `tracksDir` (tracks/new_data here). Use this file to:
 *   - set the title, subtitle and starting position
 *   - order tracks (they appear in the order listed here; unlisted files follow
 *     alphabetically)
 *   - style tracks (label, color, height, y-axis title, ...)
 *
 * Keys under `tracks` are file names in that folder (or the name without extension).
 * Hover any option in your editor to see what it does (from build/config-schema.ts).
 *
 * The settings below style the LDLR tracks in tracks/new_data/.
 */
import { defineConfig } from './build/config-schema';

// Colors reused for each signal and the peaks tucked underneath it.
const PURPLE = '#7570b3';
const INDIGO = '#4b3f87';
const PINK = '#e82989';
const GREEN = '#1b9d79';
const GRAY = '#9aa0a6';
const BLACK = '#1d2127';
const DARKORANGE = '#da6406';
const LIGHTORANGE = '#fdc07f';

export default defineConfig({
  title: 'LDLR Locus Browser',
  subtitle: 'Multimodal functional characterization of the <i>LDLR</i> locus',
  defaultPosition: 'chr19:11,039,463-11,163,820',
  sequenceTrack: {label: 'Sequence hg38' },
  // Visit counts: https://ldlr-noncoding.goatcounter.com (see src/analytics.ts).
  analytics: { goatcounter: 'https://ldlr-noncoding.goatcounter.com/count' },
  genome: {
    chromSizes: 'genome/chrom.sizes',
    fasta: 'genome/hg38_ldlr_region.fa',
  },
  tracks: {
    'genes_coding.bed':    { label: 'canonical genes', color: BLACK, mode: 'pack', marginTop: 2 },
    'genes_noncoding.bed': { label: 'ncRNA', color: GRAY, mode: 'pack', marginTop: 2, hidden: true, after: "genes_coding.bed" },


    'CRISPRn_neglog-pDeplete.wig':{ label:"CRISPRn depletion ", color:PURPLE, yLabel:"-log_{10} p", height: 52, autoscaleGroup:"spr", marginTop:10, centerLabel: true},
    'CRISPRn_depletion-peaks.bed': { label:"", color:PURPLE, mode: 'dense', marginTop: 2, after: "CRISPRn_neglog-pDeplete.wig", missingParentName: "CRISPRn depletion hits", centerLine: true },
    
    'CRISPRn_neglog-pEnrich.wig':{ label:"CRISPRn enrichment ", color:INDIGO, yLabel:"-log_{10} p", height: 52, autoscaleGroup:"spr", marginTop:10, centerLabel: true},
    'CRISPRn_enrichment-peaks.bed': { label:"", color:INDIGO, mode: 'dense', marginTop: 2, after: "CRISPRn_neglog-pEnrich.wig", missingParentName: "CRISPRn enrichment hits", centerLine: true },


    'CRISPRi_neglog-pDeplete.wig':{ label:"CRISPRi depletion ", color:PINK, yLabel:"-log_{10} p", height: 52, autoscaleGroup:"spr", marginTop:10, centerLabel: true},
    'CRISPRi_depletion-peaks.bed': { label:"", color:PINK, mode: 'dense', marginTop: 2, after: "CRISPRi_neglog-pDeplete.wig", missingParentName: "CRISPRi depletion hits", centerLine: true },
    
    'CRISPRi_neglog-pEnrich.wig':{ label:"CRISPRi enrichment ", color:PINK, yLabel:"-log_{10} p", height: 52, autoscaleGroup:"spr", marginTop:10, centerLabel: true},
    // 'CRISPRi_enrichment-peaks.bed': {"label":"", color:PINK, mode: 'dense', marginTop: 2}, // no enrichment peaks for CRISPRi

    'CRISPRa_neglog-pDeplete.wig':{ label:"CRISPRa depletion ", color:GREEN, yLabel:"-log_{10} p", height: 52, autoscaleGroup:"spr", marginTop:10, centerLabel: true},
    'CRISPRa_depletion-peaks.bed': { label:"", color:GREEN, mode: 'dense', marginTop: 2, after: "CRISPRa_neglog-pDeplete.wig", missingParentName: "CRISPRa depletion hits", centerLine: true },
    
    'CRISPRa_neglog-pEnrich.wig':{ label:"CRISPRa enrichment ", color:GREEN, yLabel:"-log_{10} p", height: 52, autoscaleGroup:"spr", marginTop:10, centerLabel: true},
    'CRISPRa_enrichment-peaks.bed': { label:"", color:GREEN, mode: 'dense', marginTop: 2, after: "CRISPRa_neglog-pEnrich.wig", missingParentName: "CRISPRa enrichment hits", centerLine: true },

    'MPRA_normalized-activity.wig':{ label:"MPRA activity (relative)", color:DARKORANGE, altColor: LIGHTORANGE, yLabel:"log_{2}FC", height: 72, autoscaleGroup:"mpra", marginTop:10, centerLabel: true},
    'MPRA_activator-peaks.bed': { label:"Enhancers", color:DARKORANGE, mode: 'dense', marginTop: 2, after: "MPRA_normalized-activity.wig", missingParentName: "MPRA enhancer hits", centerLine: true },
    'MPRA_repressor-peaks.bed': { label:"Repressors", color:LIGHTORANGE, mode: 'dense', marginTop: 2, after:[ "MPRA_normalized-activity.wig", "MPRA_activator-peaks.bed"], missingParentName: "MPRA repressor hits", centerLine: true },
    
    // ATAC
    'ATAC_liver_v2_mean_log2FC.bedGraph': { label: 'ATAC', yLabel: 'log_{2}FC', color: GRAY, height: 46, marginTop: 8, autoscaleGroup:"atac", viewLimits:[0,4] },
    'ATAC_liver_v2_peaks.bed': { label: '', color: GRAY, mode: 'dense', marginTop: 2, centerLine: true, itemRgb: false, after: "ATAC_liver_v2_mean_log2FC.bedGraph", missingParentName: "ATAC peaks" },

    // DHS
    'dhs_liver_v2_mean_log2FC.bedGraph': { label: 'DHS', yLabel: 'Signal', color: GRAY, height: 46, marginTop: 8, autoscaleGroup:"dhs", viewLimits:[0,9] },
    'dhs_liver_v2_peaks.bed': { label: '', color: GRAY, mode: 'dense', marginTop: 2, centerLine: true, itemRgb: false, after: "dhs_liver_v2_mean_log2FC.bedGraph", missingParentName: "DHS peaks" },

    // H3K27ac
    'H3K27ac_liver_v2_mean_log2FC.bedGraph': { label: 'H3K27ac', yLabel: 'log_{2}FC', color: GRAY, height: 46, marginTop: 8, autoscaleGroup:"h3k27a", viewLimits:[0,9] },
    'H3K27ac_liver_v2_peaks.bed': { label: '', color: GRAY, mode: 'dense', marginTop: 2, centerLine: true, itemRgb: false, after: "H3K27ac_liver_v2_mean_log2FC.bedGraph", missingParentName: "H3K27ac peaks" },

    // H3K4me1
    'H3K4me1_liver_v2_mean_log2FC.bedGraph': { label: 'H3K4me1', yLabel: 'log_{2}FC', color: GRAY, height: 46, marginTop: 8, autoscaleGroup:"h3k4me1", viewLimits:[0,4] },
    'H3K4me1_liver_v2_peaks.bed': { label: '', color: GRAY, mode: 'dense', marginTop: 2, centerLine: true, itemRgb: false, after: "H3K4me1_liver_v2_mean_log2FC.bedGraph", missingParentName: "H3K4me1 peaks" },

    // PhastCons
    'phastcons30.bedGraph': { label: 'PhastCons30', yLabel: 'P(Cons.)', color: GRAY, mode: 'dense', height: 52, marginTop: 10, centerLine: true, itemRgb: false, autoscaleGroup:"cons", },
    'phastCons30way.bed': { label:"", color:GRAY, mode: 'dense', marginTop: 2, centerLine: true, itemRgb: false, after: "phastcons30.bedGraph", missingParentName: "PhastCons30 hits" },
    'phastcons100.bedGraph': { label: 'PhastCons100', yLabel: 'P(Cons.)', color: GRAY, mode: 'dense', height: 52, marginTop: 10, centerLine: true, itemRgb: false, autoscaleGroup:"cons", },
    'phastCons100way.bed': { label:"", color:GRAY, mode: 'dense', marginTop: 2, centerLine: true, itemRgb: false, after: "phastcons100.bedGraph", missingParentName: "PhastCons100 hits" },

    // ENCODE cCREs
    'encode3_ccre.bed': { label: 'ENCODE3 cCREs', color: GRAY, mode: 'dense', marginTop: 10, centerLine: true, itemRgb: false, },
    'encode4_ccre.bed': { label: 'ENCODE4 cCREs', color: GRAY, mode: 'dense', marginTop: 10, centerLine: true, itemRgb: false, },

    // Custom tracks for GWAS (upload test)
    // 'aou_effects.bedGraph': { label: 'AoU LDL effects', yLabel: 'Effect', height: 52, marginTop: 10, autoscaleGroup:"gwas", centerLabel: true },
    // 'aou_effects_peaks.bed': { label: '', mode: 'dense', marginTop: 2, centerLine: true, itemRgb: false, after: "aou_effects.bedGraph", missingParentName: "AoU LDL effects (p < 0.001)" },
    // 'aou_LDL_inc_effects_peaks.bed': { label: '↑ LDL mut. (AoU)', mode: 'dense', marginTop: 10, centerLine: true, itemRgb: false, },
    // 'aou_LDL_dec_effects_peaks.bed': { label: '↓ LDL mut. (AoU)', mode: 'dense', marginTop: 10, centerLine: true, itemRgb: false, after: "aou_LDL_inc_effects_peaks.bed", },

    // // Gene models on top, no label (like a figure).
    // 'demo_genes.bed': { label: '', color: '#1d2127', mode: 'full', featureLabels: false, marginTop: 2 },

  },
  tracksDir: 'tracks/new_data',  // optional, default is "tracks"
});
