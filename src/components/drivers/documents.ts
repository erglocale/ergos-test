// The production app pulls per-entity document verification counts from the
// documents service. The sandbox fixtures have no documents collection, so we
// derive a stable, deterministic summary from the entity id instead.
export interface DocumentSummary {
  verified: number;
  pending: number;
  rejected: number;
  total: number;
}

export default function getDocumentSummaryByEntity(id: string): DocumentSummary {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  }
  const n = Math.abs(h);
  const verified = n % 3;
  const pending = (n >> 2) % 2;
  const rejected = n % 7 === 0 ? 1 : 0;
  return { verified, pending, rejected, total: verified + pending + rejected };
}
