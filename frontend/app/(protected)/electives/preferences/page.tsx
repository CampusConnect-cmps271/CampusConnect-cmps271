import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getMyPreferences, PreferenceForm } from "@/modules/electives";
import styles from "@/modules/electives/electives.module.css";
export const metadata = { title: "Elective preferences · CampusConnect" };
export default async function PreferencesPage() {
  const preferences = await getMyPreferences();
  return <AppShell><main className={styles.page}>
    <Link href="/home">← Back to feed</Link><h1>Elective preferences</h1>
    <p>Tell us what you want from your next elective. Only you can access these preferences.</p>
    <PreferenceForm initial={preferences} />
    <p><Link href="/electives/recommendations">View elective recommendations →</Link></p>
  </main></AppShell>;
}
