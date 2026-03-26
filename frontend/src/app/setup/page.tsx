import { SetupWizard } from "@/components/workspace/setup-wizard/setup-wizard";

export default function SetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-4xl">
        <SetupWizard />
      </div>
    </div>
  );
}
