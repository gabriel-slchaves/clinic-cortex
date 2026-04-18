import { HttpError } from "../../errors.js";

export type ClinicViewerMembership = {
  role: string;
  is_admin: boolean | null;
};

export type AuthenticatedClinicUser = {
  id: string;
};

export type ClinicAccessRepository = {
  authenticateAccessToken(
    accessToken: string
  ): Promise<AuthenticatedClinicUser>;
  ensureClinicAccess(
    userId: string,
    clinicId: string
  ): Promise<ClinicViewerMembership>;
  ensureClinicPlanAccess(
    userId: string,
    clinicId: string
  ): Promise<ClinicViewerMembership>;
};

export type ResolveClinicAccessInput = {
  authorizationHeader?: string | null;
  clinicId?: string | null;
  requireManage?: boolean;
};

export type ResolveClinicAccessResult = {
  ok: true;
  userId: string;
  clinicId: string | null;
  membership?: ClinicViewerMembership;
};

export function extractBearerAccessToken(authorizationHeader?: string | null) {
  const authorization = String(authorizationHeader || "").trim();
  if (!authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "Token de sessão não informado.");
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) {
    throw new HttpError(401, "Token de sessão não informado.");
  }

  return accessToken;
}

export async function resolveClinicAccess(
  repository: ClinicAccessRepository,
  input: ResolveClinicAccessInput
): Promise<ResolveClinicAccessResult> {
  const accessToken = extractBearerAccessToken(input.authorizationHeader);
  const user = await repository.authenticateAccessToken(accessToken);
  const clinicId = String(input.clinicId || "").trim() || null;

  if (!clinicId) {
    return {
      ok: true,
      userId: user.id,
      clinicId: null,
    };
  }

  const membership = input.requireManage
    ? await repository.ensureClinicPlanAccess(user.id, clinicId)
    : await repository.ensureClinicAccess(user.id, clinicId);

  return {
    ok: true,
    userId: user.id,
    clinicId,
    membership,
  };
}
