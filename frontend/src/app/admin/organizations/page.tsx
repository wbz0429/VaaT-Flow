"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { OrgTable } from "@/components/admin/org-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listOrganizations } from "@/core/admin/api";
import type { OrgSummary } from "@/core/admin/types";
import { useI18n } from "@/core/i18n/hooks";

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    listOrganizations()
      .then(setOrgs)
      .catch((err: Error) => {
        toast.error(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.admin.organizations}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.admin.manageOrgs}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.allOrganizations}</CardTitle>
          <CardDescription>
            {loading ? t.common.loading : `${orgs.length} organization${orgs.length !== 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <OrgTable organizations={orgs} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
