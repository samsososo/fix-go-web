import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessPortal } from "@/lib/access";
import { env, shouldUseSecureCookies } from "@/lib/env";
import {
  createSession,
  findUserById,
  getSessionUser,
  invalidateSession,
  verifyUserCredentials,
} from "@/lib/mock/db";
import { User, UserRole } from "@/types/domain";

export async function getSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!value) {
    return null;
  }

  return value;
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }

  return getSessionUser(session);
}

export async function signInWithCredentials(
  identifier: string,
  password: string,
) {
  const result = await verifyUserCredentials(identifier, password);
  if (!result.ok) {
    return result;
  }

  const { sessionId } = await createSession(result.user.id);
  const cookieStore = await cookies();
  cookieStore.set(env.SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60,
  });

  return { ok: true as const, user: result.user, isDemo: result.isDemo };
}

export async function signInAs(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const { sessionId } = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(env.SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60,
  });

  return user;
}

export async function clearSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (sessionId) {
    await invalidateSession(sessionId);
  }
  cookieStore.delete(env.SESSION_COOKIE_NAME);
}

export async function requireRole(
  role: UserRole | UserRole[],
  locale: string = "zh-HK",
) {
  const user = await getCurrentUser();

  if (!user || !canAccessPortal(user.role, role)) {
    redirect(`/${locale}/auth/login`);
  }

  return user;
}

export function roleHomePath(role: UserRole) {
  return {
    customer: "/customer",
    pro: "/pro",
    admin: "/admin",
  }[role];
}

export function localizedRoleHomePath(role: UserRole, locale: string) {
  return {
    customer: `/${locale}/customer`,
    pro: `/${locale}/pro`,
    admin: `/${locale}/admin`,
  }[role];
}
