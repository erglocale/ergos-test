"use client";

import OrganizationSettings from "@/components/settings/OrganizationSettings";
import SettingsShell from "@/components/settings/SettingsShell";

export default function Page() {
  return (
    <SettingsShell>
      <OrganizationSettings />
    </SettingsShell>
  );
}
