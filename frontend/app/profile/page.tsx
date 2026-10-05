import Link from "next/link";
import RoleGate from "@/components/role-gate";
import ProfileCard from "../profile-card";

export default function ProfilePage() {
  return (
    <main className="relative">
      <RoleGate allow={["administrator"]}>
        <Link
          href="/admin"
          className="absolute right-4 top-4 z-10 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Manage user roles
        </Link>
      </RoleGate>
      <ProfileCard />
    </main>
  );
}
