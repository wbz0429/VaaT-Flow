import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Registration Not Used</CardTitle>
        <CardDescription>
          Appliance mode is single-user and does not expose self-service registration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>The first local administrator is created during setup.</p>
        <p>Once setup is complete, go straight to the workspace.</p>
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button asChild className="w-full">
          <Link href="/setup">Open Setup</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/workspace">Open Workspace</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
