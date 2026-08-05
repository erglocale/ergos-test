"use client";

import MyProfile from "@/components/settings/MyProfile";
import SettingsShell from "@/components/settings/SettingsShell";

export default function Page() {
  return (
    <SettingsShell>
      <MyProfile />
    </SettingsShell>
  );
}
