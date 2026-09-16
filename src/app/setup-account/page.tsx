import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupAccountForm } from "./setup-account-form";

export default function SetupAccountPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Set up your account</CardTitle>
          <CardDescription>
            Used for first-time login and for resetting a forgotten password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetupAccountForm />
        </CardContent>
      </Card>
    </div>
  );
}
