"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { requestSetupCode, completeSetup, type SetupState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Please wait…" : children}
    </Button>
  );
}

const initialState: SetupState = { step: "request" };

export function SetupAccountForm() {
  const [state, formAction] = useActionState(
    async (prev: SetupState, formData: FormData) =>
      prev.step === "request"
        ? requestSetupCode(prev, formData)
        : completeSetup(prev, formData),
    initialState
  );
  const router = useRouter();

  useEffect(() => {
    if (state.step === "done") {
      router.replace("/");
    }
  }, [state.step, router]);

  if (state.step === "request") {
    return (
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="phone">Cell number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="082 123 4567"
            required
          />
        </div>
        {state.error && (
          <p className="text-destructive text-sm" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton>Send me a code</SubmitButton>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="phone" value={state.phone} />
      <p className="text-muted-foreground text-sm">
        We sent a code to {state.phone}. Enter it below along with the password you&apos;d
        like to use from now on.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton>Set password &amp; sign in</SubmitButton>
    </form>
  );
}
