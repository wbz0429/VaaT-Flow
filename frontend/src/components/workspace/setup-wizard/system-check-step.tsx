"use client";

import {
  ActivityIcon,
  CheckCircle2Icon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface ServiceStatus {
  name: string;
  status: "checking" | "ok" | "error";
  message?: string;
}

export function SystemCheckStep({ onComplete }: { onComplete: () => void }) {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "Gateway API", status: "checking" },
    { name: "Database", status: "checking" },
  ]);
  const [allOk, setAllOk] = useState(false);

  const checkServices = useCallback(async () => {
    setServices([
      { name: "Gateway API", status: "checking" },
      { name: "Database", status: "checking" },
    ]);

    // Check gateway health
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        setServices((prev) =>
          prev.map((s) =>
            s.name === "Gateway API" ? { ...s, status: "ok" } : s,
          ),
        );
      } else {
        setServices((prev) =>
          prev.map((s) =>
            s.name === "Gateway API"
              ? { ...s, status: "error", message: "Service unavailable" }
              : s,
          ),
        );
      }
    } catch {
      setServices((prev) =>
        prev.map((s) =>
          s.name === "Gateway API"
            ? { ...s, status: "error", message: "Cannot connect" }
            : s,
        ),
      );
    }

    // Check setup status (which implicitly checks DB)
    try {
      const res = await fetch("/api/setup/status");
      if (res.ok) {
        setServices((prev) =>
          prev.map((s) =>
            s.name === "Database" ? { ...s, status: "ok" } : s,
          ),
        );
      } else {
        setServices((prev) =>
          prev.map((s) =>
            s.name === "Database"
              ? { ...s, status: "error", message: "Database unavailable" }
              : s,
          ),
        );
      }
    } catch {
      setServices((prev) =>
        prev.map((s) =>
          s.name === "Database"
            ? { ...s, status: "error", message: "Cannot connect" }
            : s,
        ),
      );
    }
  }, []);

  useEffect(() => {
    void checkServices();
  }, [checkServices]);

  useEffect(() => {
    const ok = services.every((s) => s.status === "ok");
    setAllOk(ok);
    if (ok) {
      // Auto-advance after a brief delay
      const timer = setTimeout(onComplete, 1500);
      return () => clearTimeout(timer);
    }
  }, [services, onComplete]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <ActivityIcon className="mx-auto size-12 text-primary" />
        <h2 className="mt-4 text-2xl font-semibold">System Check</h2>
        <p className="text-muted-foreground mt-2">
          Verifying that all services are running correctly
        </p>
      </div>
      <div className="mx-auto max-w-md space-y-3">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between rounded-lg border p-4"
          >
            <span className="font-medium">{service.name}</span>
            <div className="flex items-center gap-2">
              {service.status === "checking" && (
                <LoaderIcon className="text-muted-foreground size-5 animate-spin" />
              )}
              {service.status === "ok" && (
                <CheckCircle2Icon className="size-5 text-green-500" />
              )}
              {service.status === "error" && (
                <>
                  <span className="text-destructive text-sm">
                    {service.message}
                  </span>
                  <XCircleIcon className="text-destructive size-5" />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {!allOk && services.some((s) => s.status === "error") && (
        <div className="text-center">
          <Button variant="outline" onClick={checkServices}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
