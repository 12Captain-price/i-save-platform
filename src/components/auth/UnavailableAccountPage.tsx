import { Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function UnavailableAccountPage({ title }: { title: string }) {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-6 py-12 md:py-20">
        <Card className="rounded-xl border border-border bg-card">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              <h1>{title}</h1>
            </CardTitle>
            <CardDescription>This service is not available online yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Please contact the office for assistance. No request has been submitted.
            </p>
          </CardContent>
          <CardFooter className="pt-6">
            <Button variant="outline" asChild className="w-full">
              <Link to="/login">Back to log in</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PublicLayout>
  );
}
