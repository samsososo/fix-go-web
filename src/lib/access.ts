import { UserRole } from "@/types/domain";

export function canAccessPortal(role: UserRole, guard: UserRole | UserRole[]) {
  const allowed = Array.isArray(guard) ? guard : [guard];
  return allowed.includes(role);
}
