// The services a fleet manager can book, rather than a free-text box. Typing
// the job in meant "Brake inspection", "brake check" and "Brakes" all became
// separate things and nothing could be counted; picking from a list keeps the
// history comparable across vehicles.
//
// Each entry carries the interval it is normally done at, so choosing a service
// fills the recurrence in — the manager only overrides it when their OEM
// contract says something different.
//
// Everything here is work an electric fleet actually books. There is no oil
// change and no coolant top-up.

export interface ServiceCatalogEntry {
  title: string;
  group: string;
  isRecurring: boolean;
  intervalKm: number | null;
  intervalMonths: number | null;
}

export const SERVICE_CATALOG: ServiceCatalogEntry[] = [
  // ---- scheduled servicing -------------------------------------------------
  { title: "Full service", group: "Scheduled service", isRecurring: true, intervalKm: 10000, intervalMonths: 6 },
  { title: "Periodic health check", group: "Scheduled service", isRecurring: true, intervalKm: 5000, intervalMonths: 3 },
  { title: "Software / firmware update", group: "Scheduled service", isRecurring: true, intervalKm: null, intervalMonths: 6 },

  // ---- wear items ----------------------------------------------------------
  { title: "Brake inspection", group: "Wear items", isRecurring: true, intervalKm: 5000, intervalMonths: 3 },
  { title: "Brake pad replacement", group: "Wear items", isRecurring: true, intervalKm: 20000, intervalMonths: null },
  { title: "Tyre rotation", group: "Wear items", isRecurring: true, intervalKm: 8000, intervalMonths: null },
  { title: "Tyre replacement", group: "Wear items", isRecurring: false, intervalKm: null, intervalMonths: null },
  { title: "Wheel alignment", group: "Wear items", isRecurring: false, intervalKm: null, intervalMonths: null },
  { title: "Suspension check", group: "Wear items", isRecurring: true, intervalKm: 20000, intervalMonths: null },

  // ---- the electric side ---------------------------------------------------
  { title: "Battery health check", group: "Battery & drivetrain", isRecurring: true, intervalKm: null, intervalMonths: 12 },
  { title: "HV cable inspection", group: "Battery & drivetrain", isRecurring: false, intervalKm: null, intervalMonths: null },
  { title: "Charging port inspection", group: "Battery & drivetrain", isRecurring: true, intervalKm: null, intervalMonths: 6 },
  { title: "Motor & drivetrain check", group: "Battery & drivetrain", isRecurring: true, intervalKm: 15000, intervalMonths: 12 },

  // ---- cabin and body ------------------------------------------------------
  { title: "Cabin air filter replacement", group: "Cabin & body", isRecurring: true, intervalKm: null, intervalMonths: 12 },
  { title: "AC service", group: "Cabin & body", isRecurring: true, intervalKm: null, intervalMonths: 12 },
  { title: "Lights & wiper check", group: "Cabin & body", isRecurring: true, intervalKm: null, intervalMonths: 3 },
  { title: "Body / panel repair", group: "Cabin & body", isRecurring: false, intervalKm: null, intervalMonths: null },
];

export function findService(title: string): ServiceCatalogEntry | undefined {
  return SERVICE_CATALOG.find((s) => s.title === title);
}

/** Grouped for the picker, in catalog order. */
export function serviceOptionGroups(): {
  label: string;
  options: { value: string; label: string }[];
}[] {
  const groups: { label: string; options: { value: string; label: string }[] }[] = [];
  for (const entry of SERVICE_CATALOG) {
    let group = groups.find((g) => g.label === entry.group);
    if (!group) {
      group = { label: entry.group, options: [] };
      groups.push(group);
    }
    group.options.push({ value: entry.title, label: entry.title });
  }
  return groups;
}
