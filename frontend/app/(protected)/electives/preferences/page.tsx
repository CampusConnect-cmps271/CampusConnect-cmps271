import Link from "next/link";
import { BrowseElectives } from "@/modules/electives/BrowseElectives";
import { AppShell } from "@/components/AppShell";
import { getMyPreferences, PreferenceForm } from "@/modules/electives";
import styles from "@/modules/electives/electives.module.css";
import { getOfferingOptions } from "@/modules/electives/offering-options";
export const metadata = { title: "Elective preferences · CampusConnect" };
export default async function PreferencesPage() {
  const [preferences, offeringOptions] = await Promise.all([getMyPreferences(), getOfferingOptions()]);
  return <AppShell><main className={styles.page}>
    <Link href="/home">← Back to feed</Link><h1>Find your next elective</h1>
    <BrowseElectives options={offeringOptions} />
    <PreferenceForm initial={preferences} offeringOptions={offeringOptions} />

  </main></AppShell>;
}
