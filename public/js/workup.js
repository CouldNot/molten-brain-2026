// Pre-prescription workup (BETA): the drug panel's "Checks the French label asks for"
// section (node kind drug_workup, BDPM RCP corpus #24; mapped in js/data.js). One node
// per (drug, test, timing), the test and timing labels coming from meta.workup_tests /
// meta.workup_timings. Pure helpers only (no DOM), so tools/tests/workup.test.mjs can
// pin the grouping and the wording. Built with the help of Claude Code.

/** Display order of the two timings (the generator already sorts each drug's rows). */
export const WORKUP_TIMINGS = ["before", "during"];

/**
 * Split a drug's workup rows by timing, keeping the authored order inside each group.
 * Empty groups are dropped, so a drug asked only for monitoring shows one group.
 * @param {Array<{timing: string}>} rows
 * @returns {Array<{timing: string, rows: Array}>}
 */
export function groupWorkup(rows) {
  return WORKUP_TIMINGS
    .map((timing) => ({ timing, rows: (rows || []).filter((r) => r.timing === timing) }))
    .filter((g) => g.rows.length);
}

/**
 * One node as a single line, for the node browser and the Sources popup:
 * "ECG (QT interval), before starting".
 */
export function formatWorkup(n) {
  return `${n.testLabel}, ${n.timingLabel}`;
}
