import { AppShell } from "@/components/AppShell";

export default function LoadingCourse() {
  return <AppShell><main className="mx-auto w-full max-w-6xl px-6 py-12">
    <p role="status">Loading course information…</p>
  </main></AppShell>;
}
