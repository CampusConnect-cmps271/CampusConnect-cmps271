import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getMyPreferences, PreferenceForm } from "@/modules/electives";
import styles from "@/modules/electives/electives.module.css";
import { getOfferingOptions } from "@/modules/electives/offering-options";
export const metadata = { title: "Elective preferences · CampusConnect" };
export default async function PreferencesPage() {
  const [preferences, offeringOptions] = await Promise.all([getMyPreferences(), getOfferingOptions()]);
  return <AppShell><main className={styles.page}>
    <Link href="/home">← Back to feed</Link><h1>Elective preferences</h1>
    <p>Tell us what you want from your next elective. Only you can access these preferences.</p>
    <PreferenceForm initial={preferences} offeringOptions={offeringOptions} />
    <p><Link href="/electives/recommendations">View elective recommendations →</Link></p>
  </main></AppShell>;
}
