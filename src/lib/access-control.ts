import type { Prisma, Role } from "@prisma/client";

export type AccessPrincipal = {
  id: string;
  role: Role;
  unitId: string | null;
};

export function documentVisibilityWhere(principal: AccessPrincipal): Prisma.DocumentWhereInput {
  if (principal.role === "ADMIN") return {};
  return {
    OR: [
      { userId: principal.id },
      ...(principal.unitId ? [{ scope: "UNIT" as const, unitId: principal.unitId }] : []),
    ],
  };
}

export function artifactVisibilityWhere(principal: AccessPrincipal): Prisma.ArtifactWhereInput {
  if (principal.role === "ADMIN") return {};
  return {
    OR: [
      { userId: principal.id },
      ...(principal.unitId ? [{ scope: "UNIT" as const, unitId: principal.unitId }] : []),
    ],
  };
}
