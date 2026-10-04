import { getSupabaseConfig } from "@/lib/supabase/config";
import ConnectionCheck from "./connection-check";
import styles from "./setup.module.css";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>CampusConnect</p>
      <h1 className={styles.title}>Development setup</h1>
      <p className={styles.intro}>Check your project connection before starting university email verification.</p>
      <ConnectionCheck configured={Boolean(getSupabaseConfig())} />
      <p className={styles.footnote}>This check reads authentication settings. It does not create accounts or modify your project.</p>
    </main>
  );
}
