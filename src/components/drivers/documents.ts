// The production app pulls per-entity document verification counts from the
// documents service. The real fleet has almost no uploaded documents — at the
// time of writing, a single driver with one PENDING Aadhaar — so the drivers
// list mostly shows just the gray "Total: 0" badge. Mirror that: one driver
// carries a pending document, everyone else has none.
export interface DocumentSummary {
  verified: number;
  pending: number;
  rejected: number;
  total: number;
}

export default function getDocumentSummaryByEntity(id: string): DocumentSummary {
  const pending = id === "drv-3" ? 1 : 0;
  return { verified: 0, pending, rejected: 0, total: pending };
}
