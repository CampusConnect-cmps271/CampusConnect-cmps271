import { getSupabaseConfig } from "@/lib/supabase/config";
import ConnectionCheck from "./connection-check";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main>
      <p className="eyebrow">CampusConnect</p>
      <h1>Development setup</h1>
      <p className="intro">Check your project connection before starting university email verification.</p>
      <ConnectionCheck configured={Boolean(getSupabaseConfig())} />
      <p className="footnote">This check reads authentication settings. It does not create accounts or modify your project.</p>
    </main>
  );
}
