import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const redirectToRaw = params.redirectTo;
  const redirectTo = Array.isArray(redirectToRaw) ? redirectToRaw[0] : redirectToRaw;

  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">SAR2O Fleet</CardTitle>
          <CardDescription>Sign in with your cell number and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm redirectTo={redirectTo} />
        </CardContent>
      </Card>
    </div>
  );
}
