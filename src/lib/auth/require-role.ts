import "server-only";

import { getCurrentProfile, type CurrentProfile } from "./current-profile";

export class NotAuthorizedError extends Error {
  constructor() {
    super("Not authorized");
  }
}

export async function requireManagerOrAdmin(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    throw new NotAuthorizedError();
  }
  return profile;
}

export async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    throw new NotAuthorizedError();
  }
  return profile;
}
