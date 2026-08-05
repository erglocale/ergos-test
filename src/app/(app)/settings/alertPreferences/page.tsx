"use client";

import AlertPreferences from "@/components/settings/AlertPreferences";
import SettingsShell from "@/components/settings/SettingsShell";

export default function Page() {
  return (
    <SettingsShell>
      <AlertPreferences />
    </SettingsShell>
  );
}
