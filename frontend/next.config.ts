import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server hydrate pages opened at http://127.0.0.1:3000 too;
  // otherwise buttons that need JavaScript (Show password) do nothing there.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
