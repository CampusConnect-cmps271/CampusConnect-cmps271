import { AppShell } from "@/components/AppShell";

export default function LoadingCourses() {
  return <AppShell><main className="mx-auto w-full max-w-6xl px-6 py-12">
    <p role="status">Loading the course catalogue…</p>
  </main></AppShell>;
}
