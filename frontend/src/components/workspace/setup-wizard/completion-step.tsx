"use client";

import { CheckCircle2Icon, LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { completeSetup } from "@/core/setup/api";

export function CompletionStep() {
  const [status, setStatus] = useState<"completing" | "done" | "error">(
    "completing",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    completeSetup()
      .then(() => setStatus("done"))
      .catch((err) => {
        setStatus("error");
        setError(
          err instanceof Error ? err.message : "Setup completion failed",
        );
      });
  }, []);

  return (
    <div className="space-y-6 text-center">
      {status === "completing" && (
        <>
          <LoaderIcon className="mx-auto size-12 animate-spin text-primary" />
          <h2 className="text-2xl font-semibold">Finalizing Setup...</h2>
          <p className="text-muted-foreground">
            Generating configuration files
          </p>
        </>
      )}
      {status === "done" && (
        <>
          <CheckCircle2Icon className="mx-auto size-12 text-green-500" />
          <h2 className="text-2xl font-semibold">Setup Complete!</h2>
          <p className="text-muted-foreground">
            Your workspace is ready to use
          </p>
          <Button asChild>
            <a href="/workspace">Go to Workspace</a>
          </Button>
        </>
      )}
      {status === "error" && (
        <>
          <CheckCircle2Icon className="text-destructive mx-auto size-12" />
          <h2 className="text-2xl font-semibold">Setup Error</h2>
          <p className="text-destructive text-sm">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
}
