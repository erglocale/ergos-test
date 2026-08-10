// Single source of truth for how dates read in pickers across the app.
// The alerts filters set the house style — "03 Aug 2026" — so every other
// RangePicker/DatePicker imports this rather than repeating a literal.

/** Picker display format, e.g. "03 Aug 2026". */
export const DATE_FORMAT = "DD MMM YYYY";
