import { redirect } from "next/navigation";

import { isApplianceMode } from "@/core/setup/appliance-mode";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isApplianceMode()) {
    redirect("/workspace");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}
