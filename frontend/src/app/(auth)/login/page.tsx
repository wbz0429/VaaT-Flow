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

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Login Not Used</CardTitle>
        <CardDescription>
          Appliance mode does not use a separate login screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>Use the setup wizard for first-time initialization.</p>
        <p>After setup is complete, open the workspace directly.</p>
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
