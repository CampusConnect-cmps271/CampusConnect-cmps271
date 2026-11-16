import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function CommunityNotFound() {
  return (
    <AppShell>
      <main className="flex-1 px-4 py-10">
        <section className="mx-auto flex max-w-xl flex-col gap-3 text-center">
          <h1 className="text-2xl font-bold text-[var(--ink)]">Community not found</h1>
          <p className="text-sm text-[var(--ink-soft)]">There is no community at this address.</p>
          <Link href="/communities" className="font-medium text-[var(--maroon)] hover:underline">
            Find communities
          </Link>
        </section>
      </main>
    </AppShell>
  );
}
