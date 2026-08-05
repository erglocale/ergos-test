"use client";

// Shared surface styles for the vehicle detail page — copied from the
// production Vehicle[id].jsx so every card matches the original look.

export const SURFACE_CARD_STYLE: React.CSSProperties = {
  height: "100%",
  width: "100%",
  border: "1px solid #f0f0f0",
  borderRadius: 10,
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
};

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</div>
  );
}

// Pulse keyframe for the live-status indicators. Injected once per page
// load — keeps the redesign self-contained without touching global CSS.
export function PulseKeyframes() {
  return (
    <style>{`
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `}</style>
  );
}
