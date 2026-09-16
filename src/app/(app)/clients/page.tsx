import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ClientsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-muted-foreground text-sm">Coming next, following the same pattern as Vehicles.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Not built yet</CardTitle>
          <CardDescription>
            Client records, banking details, and contracts will land here as the next vertical
            slice.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
