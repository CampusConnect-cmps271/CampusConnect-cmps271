import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getMyPreferences, RecommendationsView } from "@/modules/electives";
import styles from "@/modules/electives/electives.module.css";
export const metadata = { title: "Elective recommendations · CampusConnect" };
export default async function RecommendationsPage() {
  const preferences = await getMyPreferences();
  return <AppShell><main className={styles.page}><Link href="/home">← Back to feed</Link><h1>Find your next elective</h1><RecommendationsView preferences={preferences} /></main></AppShell>;
}
