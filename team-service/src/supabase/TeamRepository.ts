import { createClient } from "@supabase/supabase-js";
import { HttpError } from "../errors.js";

type TeamServiceLogger = {
  warn?: (payload: Record<string, unknown>, message: string) => void;
  error?: (payload: Record<string, unknown>, message: string) => void;
};

type MembershipRow = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  is_admin: boolean | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type PlanRow = {
  id: string;
  name: string;
  price_brl: number | null;
  max_doctors: number | null;
  max_secretaries: number | null;
  max_patients: number | null;
};

type TeamAccessLevel = "owner" | "doctor_admin" | "doctor" | "secretary";
type TeamMemberKind = "doctor" | "secretary";
type TeamAccountStatus = "active" | "pending";

type TeamMemberMetadata = {
  fullName: string | null;
  email: string | null;
  areaId: string | null;
  specialties: string[];
  licenseCode: string | null;
  memberKind: TeamMemberKind;
};

type ClinicTeamDefaults = {
  areaId: string | null;
  specialties: string[];
};

type ViewerMembership = {
  role: string;
  is_admin: boolean | null;
};

type CreateTeamMemberInput = {
  fullName: string;
  email: string;
  accessLevel: Exclude<TeamAccessLevel, "owner">;
  areaId: string | null;
  specialties: string[];
  licenseCode: string | null;
};

type UpdateTeamMemberInput = {
  fullName: string;
  accessLevel?: TeamAccessLevel;
  areaId: string | null;
  specialties: string[];
  licenseCode: string | null;
};

const DEFAULT_PLAN_LIMITS: Record<string, { name: string; maxDoctors: number; maxSecretaries: number }> = {
  essencial: { name: "essencial", maxDoctors: 1, maxSecretaries: 0 },
  professional: { name: "professional", maxDoctors: 5, maxSecretaries: 1 },
};

const DEFAULT_PLAN_ROWS: PlanRow[] = [
  {
    id: "essencial",
    name: "essencial",
    price_brl: 397,
    max_doctors: 1,
    max_secretaries: 0,
    max_patients: 500,
  },
  {
    id: "professional",
    name: "professional",
    price_brl: 697,
    max_doctors: 5,
    max_secretaries: 1,
    max_patients: -1,
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeText(value: unknown) {
  const next = String(value || "").trim();
  return next || null;
}

function normalizeEmail(value: unknown) {
  const next = String(value || "").trim().toLowerCase();
  return next || null;
}

function normalizeSpecialties(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function isValidEmail(value: string | null) {
  return Boolean(value && EMAIL_REGEX.test(value));
}

function emailDomain(value: string | null) {
  if (!value || !value.includes("@")) return null;
  return value.split("@")[1] || null;
}

function memberKindFromAccessLevel(accessLevel: TeamAccessLevel): TeamMemberKind {
  return accessLevel === "secretary" ? "secretary" : "doctor";
}

function accessLevelFromMembership(membership: MembershipRow, metadata: TeamMemberMetadata): TeamAccessLevel {
  if (membership.role === "owner") return "owner";
  if (membership.role === "secretary" || metadata.memberKind === "secretary") return "secretary";
  return membership.is_admin ? "doctor_admin" : "doctor";
}

function membershipRoleFromAccessLevel(accessLevel: Exclude<TeamAccessLevel, "owner">) {
  if (accessLevel === "secretary") {
    return { role: "secretary", isAdmin: false };
  }

  return {
    role: "doctor",
    isAdmin: accessLevel === "doctor_admin",
  };
}

function statusFromAuthUser(user: any): TeamAccountStatus {
  return user?.email_confirmed_at || user?.confirmed_at || user?.last_sign_in_at ? "active" : "pending";
}

function readClinicMetadata(user: any, clinicId: string): TeamMemberMetadata {
  const memberships =
    user &&
    user.app_metadata &&
    typeof user.app_metadata === "object" &&
    user.app_metadata.cc_team_memberships &&
    typeof user.app_metadata.cc_team_memberships === "object"
      ? user.app_metadata.cc_team_memberships
      : {};

  const current =
    memberships && typeof memberships[clinicId] === "object" && memberships[clinicId]
      ? memberships[clinicId]
      : {};

  return {
    fullName: normalizeText((current as any).fullName),
    email: normalizeEmail((current as any).email),
    areaId: normalizeText((current as any).areaId),
    specialties: normalizeSpecialties((current as any).specialties),
    licenseCode: normalizeText((current as any).licenseCode),
    memberKind:
      (current as any).memberKind === "secretary" || (current as any).memberKind === "doctor"
        ? (current as any).memberKind
        : "doctor",
  };
}

function mergeClinicMetadata(user: any, clinicId: string, patch: TeamMemberMetadata) {
  const currentAppMetadata =
    user && user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};

  const memberships =
    currentAppMetadata.cc_team_memberships && typeof currentAppMetadata.cc_team_memberships === "object"
      ? currentAppMetadata.cc_team_memberships
      : {};

  return {
    ...currentAppMetadata,
    cc_team_memberships: {
      ...memberships,
      [clinicId]: {
        fullName: patch.fullName,
        email: patch.email,
        areaId: patch.areaId,
        specialties: patch.specialties,
        licenseCode: patch.licenseCode,
        memberKind: patch.memberKind,
      },
    },
  };
}

function compactPlan(name: string | null | undefined, row?: PlanRow | null) {
  const normalized = String(row?.name || name || "").trim().toLowerCase();
  const fallback = DEFAULT_PLAN_LIMITS[normalized] || DEFAULT_PLAN_LIMITS.professional;
  return {
    name: String(row?.name || fallback.name),
    maxDoctors:
      typeof row?.max_doctors === "number" && Number.isFinite(row.max_doctors)
        ? row.max_doctors
        : fallback.maxDoctors,
    maxSecretaries:
      typeof row?.max_secretaries === "number" && Number.isFinite(row.max_secretaries)
        ? row.max_secretaries
        : fallback.maxSecretaries,
  };
}

function normalizePlanKey(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "essential") return "essencial";
  return normalized;
}

function normalizeTeamMetadataFromInput(args: {
  accessLevel: TeamAccessLevel;
  areaId: unknown;
  specialties: unknown;
  licenseCode: unknown;
  fullName: string | null;
  email: string | null;
}): TeamMemberMetadata {
  const memberKind = memberKindFromAccessLevel(args.accessLevel);
  const isSecretary = memberKind === "secretary";

  return {
    fullName: args.fullName,
    email: args.email,
    areaId: isSecretary ? null : normalizeText(args.areaId),
    specialties: isSecretary ? [] : normalizeSpecialties(args.specialties),
    licenseCode: isSecretary ? null : normalizeText(args.licenseCode),
    memberKind,
  };
}

function applyClinicDefaultsToMetadata(
  metadata: TeamMemberMetadata,
  defaults: ClinicTeamDefaults
): TeamMemberMetadata {
  if (metadata.memberKind === "secretary") {
    return {
      ...metadata,
      areaId: null,
      specialties: [],
      licenseCode: null,
    };
  }

  const nextAreaId = metadata.areaId || defaults.areaId;
  const canReuseClinicSpecialties =
    metadata.specialties.length === 0 &&
    defaults.specialties.length > 0 &&
    (!metadata.areaId || metadata.areaId === defaults.areaId);

  return {
    ...metadata,
    areaId: nextAreaId,
    specialties: canReuseClinicSpecialties ? defaults.specialties : metadata.specialties,
  };
}

export class TeamRepository {
  private readonly admin;
  private readonly logger?: TeamServiceLogger;

  constructor({
    supabaseUrl,
    supabaseServiceRoleKey,
    logger,
  }: {
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    logger?: TeamServiceLogger;
  }) {
    this.admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.logger = logger;
  }

  async authenticateAccessToken(accessToken: string) {
    try {
      const { data, error } = await this.admin.auth.getUser(accessToken);
      if (error) {
        const status = Number((error as any)?.status || 0);
        const message = String((error as any)?.message || "").toLowerCase();
        const invalidSession =
          status === 401 ||
          status === 403 ||
          message.includes("session") ||
          message.includes("token") ||
          message.includes("jwt");

        if (invalidSession) {
          throw new HttpError(401, "Sua sessão expirou. Faça login novamente.", {
            category: "auth_session",
          });
        }

        throw new HttpError(503, "Serviço interno de autenticação indisponível. Tente novamente.", {
          category: "service_unavailable",
          source: "supabase_auth",
          reason: String((error as any)?.message || "unknown"),
        });
      }

      if (!data.user) {
        throw new HttpError(503, "Serviço interno de autenticação indisponível. Tente novamente.", {
          category: "service_unavailable",
          source: "supabase_auth",
          reason: "missing_user_without_error",
        });
      }

      return data.user;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(503, "Serviço interno de autenticação indisponível. Tente novamente.", {
        category: "service_unavailable",
        source: "supabase_auth",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async ensureClinicAccess(userId: string, clinicId: string) {
    const membership = await this.getViewerMembership(userId, clinicId);
    if (!membership) {
      throw new HttpError(403, "Você não tem acesso a esta clínica.");
    }
    return membership;
  }

  async ensureClinicOwnerAccess(userId: string, clinicId: string) {
    const membership = await this.ensureClinicAccess(userId, clinicId);
    if (membership.role !== "owner") {
      throw new HttpError(403, "Somente o admin da clínica pode gerenciar usuários.");
    }
    return membership;
  }

  async ensureClinicPlanAccess(userId: string, clinicId: string) {
    const membership = await this.ensureClinicAccess(userId, clinicId);
    if (membership.role !== "owner" && !membership.is_admin) {
      throw new HttpError(403, "Somente o admin da clínica pode alterar o plano.");
    }
    return membership;
  }

  async listClinicMembers(clinicId: string, viewerUserId: string) {
    const viewerMembership = await this.ensureClinicAccess(viewerUserId, clinicId);
    const [memberships, clinicDefaults] = await Promise.all([
      this.getClinicMemberships(clinicId),
      this.getClinicTeamDefaults(clinicId),
    ]);
    const members = await this.serializeMembers(clinicId, memberships, clinicDefaults);
    const plan = await this.getClinicPlanSummary(clinicId, members);

    return {
      permissions: {
        isOwner: viewerMembership.role === "owner",
        canManage: viewerMembership.role === "owner",
      },
      plan,
      members,
    };
  }

  async createClinicMember(clinicId: string, viewerUserId: string, input: CreateTeamMemberInput) {
    await this.ensureClinicOwnerAccess(viewerUserId, clinicId);

    const normalizedEmail = normalizeEmail(input.email);
    const normalizedName = normalizeText(input.fullName);
    if (!normalizedEmail) {
      throw new HttpError(400, "Informe um e-mail para criar o usuário.", {
        category: "validation",
        field: "email",
      });
    }
    if (!isValidEmail(normalizedEmail)) {
      throw new HttpError(400, "Informe um e-mail válido para criar o usuário.", {
        category: "validation",
        field: "email",
      });
    }
    if (!normalizedName) {
      throw new HttpError(400, "Informe o nome do membro da clínica.", {
        category: "validation",
        field: "fullName",
      });
    }
    if (input.accessLevel === "doctor_admin") {
      throw new HttpError(
        409,
        "A clínica já possui um único admin. Novos usuários devem ser profissionais ou secretárias.",
        {
          category: "admin_policy",
        }
      );
    }

    const [memberships, clinicDefaults] = await Promise.all([
      this.getClinicMemberships(clinicId),
      this.getClinicTeamDefaults(clinicId),
    ]);
    const members = await this.serializeMembers(clinicId, memberships, clinicDefaults);
    await this.ensureCapacity(clinicId, members, memberKindFromAccessLevel(input.accessLevel));

    const authUser = await this.ensureAuthUser({
      email: normalizedEmail,
      fullName: normalizedName,
      clinicId,
    });

    const existingMembership = await this.findMembershipByClinicAndUser(clinicId, authUser.id);
    if (existingMembership && !existingMembership.deleted_at) {
      throw new HttpError(409, "Este usuário já faz parte desta clínica.", {
        category: "membership_conflict",
      });
    }

    const metadata = normalizeTeamMetadataFromInput({
      accessLevel: input.accessLevel,
      fullName: normalizedName,
      email: normalizedEmail,
      areaId: input.areaId,
      specialties: input.specialties,
      licenseCode: input.licenseCode,
    });
    if (metadata.memberKind !== "secretary" && !metadata.areaId) {
      throw new HttpError(400, "Selecione a área de atuação do profissional.", {
        category: "validation",
        field: "areaId",
      });
    }

    await this.syncUserProfileAndMetadata(authUser.id, {
      fullName: normalizedName,
      clinicId,
      metadata,
    });

    const { role, isAdmin } = membershipRoleFromAccessLevel(input.accessLevel);
    const membership = existingMembership?.deleted_at
      ? await this.restoreMembership(existingMembership.id, role, isAdmin)
      : await this.insertMembership({
          clinicId,
          userId: authUser.id,
          role,
          isAdmin,
        });

    return this.serializeMember(clinicId, membership, clinicDefaults);
  }

  async listAvailablePlans(clinicId: string, viewerUserId: string) {
    await this.ensureClinicAccess(viewerUserId, clinicId);

    const [clinic, plans] = await Promise.all([
      this.getClinicDesiredPlan(clinicId),
      this.getAvailablePlans(),
    ]);

    return {
      currentPlanName: clinic,
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        price_brl: typeof plan.price_brl === "number" && Number.isFinite(plan.price_brl) ? plan.price_brl : 0,
        max_doctors:
          typeof plan.max_doctors === "number" && Number.isFinite(plan.max_doctors)
            ? plan.max_doctors
            : compactPlan(plan.name, plan).maxDoctors,
        max_secretaries:
          typeof plan.max_secretaries === "number" && Number.isFinite(plan.max_secretaries)
            ? plan.max_secretaries
            : compactPlan(plan.name, plan).maxSecretaries,
        max_patients:
          typeof plan.max_patients === "number" && Number.isFinite(plan.max_patients) ? plan.max_patients : -1,
      })),
    };
  }

  async updateClinicPlan(clinicId: string, viewerUserId: string, planId: string) {
    await this.ensureClinicPlanAccess(viewerUserId, clinicId);

    const normalizedPlanId = String(planId || "").trim();
    if (!normalizedPlanId) {
      throw new HttpError(400, "Selecione um plano válido.");
    }

    const plans = await this.getAvailablePlans();
    const normalizedRequestedKey = normalizePlanKey(normalizedPlanId);
    const plan =
      plans.find((row) => String(row.id || "").trim() === normalizedPlanId) ||
      plans.find((row) => normalizePlanKey(row.name) === normalizedRequestedKey);
    if (!plan) {
      throw new HttpError(404, "O plano selecionado não foi encontrado.");
    }

    const { error } = await this.admin
      .from("clinics")
      .update({ desired_plan: plan.name })
      .eq("id", clinicId);

    if (error) {
      throw new HttpError(500, "Não foi possível atualizar o plano da clínica.", error);
    }

    return {
      currentPlanName: plan.name,
      plan: {
        id: plan.id,
        name: plan.name,
        price_brl: typeof plan.price_brl === "number" && Number.isFinite(plan.price_brl) ? plan.price_brl : 0,
        max_doctors:
          typeof plan.max_doctors === "number" && Number.isFinite(plan.max_doctors)
            ? plan.max_doctors
            : compactPlan(plan.name, plan).maxDoctors,
        max_secretaries:
          typeof plan.max_secretaries === "number" && Number.isFinite(plan.max_secretaries)
            ? plan.max_secretaries
            : compactPlan(plan.name, plan).maxSecretaries,
        max_patients:
          typeof plan.max_patients === "number" && Number.isFinite(plan.max_patients) ? plan.max_patients : -1,
      },
    };
  }

  async updateClinicMember(
    clinicId: string,
    membershipId: string,
    viewerUserId: string,
    input: UpdateTeamMemberInput
  ) {
    await this.ensureClinicOwnerAccess(viewerUserId, clinicId);

    const [membership, clinicDefaults] = await Promise.all([
      this.getMembershipById(clinicId, membershipId),
      this.getClinicTeamDefaults(clinicId),
    ]);
    if (!membership) {
      throw new HttpError(404, "Membro da clínica não encontrado.");
    }

    const authUser = await this.getUserById(membership.user_id);
    if (!authUser) {
      throw new HttpError(404, "Usuário não encontrado no sistema de autenticação.");
    }

    const normalizedName = normalizeText(input.fullName);
    if (!normalizedName) {
      throw new HttpError(400, "Informe o nome do membro da clínica.", {
        category: "validation",
        field: "fullName",
      });
    }

    const currentMetadata = applyClinicDefaultsToMetadata(readClinicMetadata(authUser, clinicId), clinicDefaults);
    const currentAccessLevel = accessLevelFromMembership(membership, currentMetadata);
    const nextAccessLevel =
      membership.role === "owner"
        ? "owner"
        : this.resolveNextAccessLevel(currentAccessLevel, input.accessLevel);

    const nextMetadata = normalizeTeamMetadataFromInput({
      accessLevel: nextAccessLevel,
      fullName: normalizedName,
      email: normalizeEmail(authUser.email || currentMetadata.email),
      areaId: input.areaId,
      specialties: input.specialties,
      licenseCode: input.licenseCode,
    });
    if (membership.role === "owner") {
      nextMetadata.memberKind = "doctor";
    }
    if (nextMetadata.memberKind !== "secretary" && !nextMetadata.areaId) {
      throw new HttpError(400, "Selecione a área de atuação do profissional.", {
        category: "validation",
        field: "areaId",
      });
    }

    if (membership.role !== "owner" && nextAccessLevel !== "owner") {
      const memberships = await this.getClinicMemberships(clinicId);
      const members = await this.serializeMembers(clinicId, memberships, clinicDefaults);
      await this.ensureCapacity(clinicId, members, nextMetadata.memberKind, membership.id);

      const { role, isAdmin } = membershipRoleFromAccessLevel(nextAccessLevel);
      await this.updateMembershipRole(membership.id, role, isAdmin);
    }

    await this.syncUserProfileAndMetadata(authUser.id, {
      fullName: normalizedName,
      clinicId,
      metadata: nextMetadata,
    });

    const updated = await this.getMembershipById(clinicId, membershipId);
    if (!updated) {
      throw new HttpError(404, "Não foi possível recarregar o membro da clínica.");
    }

    return this.serializeMember(clinicId, updated, clinicDefaults);
  }

  private resolveNextAccessLevel(
    currentAccessLevel: TeamAccessLevel,
    requestedAccessLevel?: TeamAccessLevel
  ): TeamAccessLevel {
    if (!requestedAccessLevel) {
      return currentAccessLevel;
    }

    if (requestedAccessLevel === "owner") {
      throw new HttpError(
        409,
        "A clínica já possui um único admin. Novos usuários devem ser profissionais ou secretárias.",
        {
          category: "admin_policy",
        }
      );
    }

    if (requestedAccessLevel === "doctor_admin" && currentAccessLevel !== "doctor_admin") {
      throw new HttpError(
        409,
        "A clínica já possui um único admin. Novos usuários devem ser profissionais ou secretárias.",
        {
          category: "admin_policy",
        }
      );
    }

    return requestedAccessLevel;
  }

  private async getViewerMembership(userId: string, clinicId: string) {
    const { data, error } = await this.admin
      .from("clinic_members")
      .select("role,is_admin")
      .eq("user_id", userId)
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle<ViewerMembership>();

    if (error) {
      throw new HttpError(500, "Não foi possível validar a permissão da clínica.", error);
    }

    return data;
  }

  private async getClinicMemberships(clinicId: string) {
    const { data, error } = await this.admin
      .from("clinic_members")
      .select("*")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .returns<MembershipRow[]>();

    if (error) {
      throw new HttpError(500, "Não foi possível carregar a equipe da clínica.", error);
    }

    return data || [];
  }

  private async getMembershipById(clinicId: string, membershipId: string) {
    const { data, error } = await this.admin
      .from("clinic_members")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("id", membershipId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle<MembershipRow>();

    if (error) {
      throw new HttpError(500, "Não foi possível carregar o membro da clínica.", error);
    }

    return data;
  }

  private async findMembershipByClinicAndUser(clinicId: string, userId: string) {
    const { data, error } = await this.admin
      .from("clinic_members")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<MembershipRow>();

    if (error) {
      throw new HttpError(500, "Não foi possível verificar a associação do usuário à clínica.", error);
    }

    return data;
  }

  private async insertMembership({
    clinicId,
    userId,
    role,
    isAdmin,
  }: {
    clinicId: string;
    userId: string;
    role: string;
    isAdmin: boolean;
  }) {
    const { data, error } = await this.admin
      .from("clinic_members")
      .insert({
        clinic_id: clinicId,
        user_id: userId,
        role,
        is_admin: isAdmin,
      })
      .select("*")
      .limit(1)
      .maybeSingle<MembershipRow>();

    if (error) {
      throw new HttpError(500, "Não foi possível criar o vínculo do usuário com a clínica.", error);
    }

    if (!data) {
      throw new HttpError(500, "O vínculo do usuário com a clínica não foi retornado.");
    }

    return data;
  }

  private async restoreMembership(membershipId: string, role: string, isAdmin: boolean) {
    const { data, error } = await this.admin
      .from("clinic_members")
      .update({
        deleted_at: null,
        role,
        is_admin: isAdmin,
      })
      .eq("id", membershipId)
      .select("*")
      .limit(1)
      .maybeSingle<MembershipRow>();

    if (error) {
      throw new HttpError(500, "Não foi possível restaurar o vínculo do usuário com a clínica.", error);
    }

    if (!data) {
      throw new HttpError(500, "O vínculo restaurado não foi retornado.");
    }

    return data;
  }

  private async updateMembershipRole(membershipId: string, role: string, isAdmin: boolean) {
    const { error } = await this.admin
      .from("clinic_members")
      .update({
        role,
        is_admin: isAdmin,
      })
      .eq("id", membershipId);

    if (error) {
      throw new HttpError(500, "Não foi possível atualizar o nível de acesso do membro.", error);
    }
  }

  private async getProfilesMap(userIds: string[]) {
    if (!userIds.length) return new Map<string, ProfileRow>();

    const { data, error } = await this.admin
      .from("profiles")
      .select("id,full_name,avatar_url")
      .in("id", userIds)
      .returns<ProfileRow[]>();

    if (error) {
      throw new HttpError(500, "Não foi possível carregar os perfis da equipe.", error);
    }

    return new Map((data || []).map((row) => [row.id, row]));
  }

  private async getUserById(userId: string) {
    const { data, error } = await this.admin.auth.admin.getUserById(userId);
    if (error) {
      throw new HttpError(500, "Não foi possível carregar o usuário da equipe.", error);
    }
    return data.user;
  }

  private async getClinicTeamDefaults(clinicId: string): Promise<ClinicTeamDefaults> {
    const { data, error } = await this.admin
      .from("clinics")
      .select("assistant_area,assistant_specialties")
      .eq("id", clinicId)
      .limit(1)
      .maybeSingle<{ assistant_area: string | null; assistant_specialties: string[] | null }>();

    if (error) {
      throw new HttpError(500, "Não foi possível carregar os dados-base da clínica.", error);
    }

    return {
      areaId: normalizeText(data?.assistant_area),
      specialties: normalizeSpecialties(data?.assistant_specialties || []),
    };
  }

  private async serializeMembers(
    clinicId: string,
    memberships: MembershipRow[],
    clinicDefaults?: ClinicTeamDefaults
  ) {
    const userIds = memberships.map((membership) => membership.user_id);
    const profilesMap = await this.getProfilesMap(userIds);
    const authUsers = await Promise.all(
      userIds.map(async (userId) => [userId, await this.getUserById(userId)] as const)
    );
    const authUsersMap = new Map(authUsers);
    const effectiveClinicDefaults = clinicDefaults || (await this.getClinicTeamDefaults(clinicId));

    return memberships.map((membership) => {
      const authUser = authUsersMap.get(membership.user_id);
      const profile = profilesMap.get(membership.user_id) || null;
      return this.toSerializedMember(clinicId, membership, authUser, profile, effectiveClinicDefaults);
    });
  }

  private async serializeMember(
    clinicId: string,
    membership: MembershipRow,
    clinicDefaults?: ClinicTeamDefaults
  ) {
    const [authUser, profilesMap] = await Promise.all([
      this.getUserById(membership.user_id),
      this.getProfilesMap([membership.user_id]),
    ]);
    const effectiveClinicDefaults = clinicDefaults || (await this.getClinicTeamDefaults(clinicId));

    return this.toSerializedMember(
      clinicId,
      membership,
      authUser,
      profilesMap.get(membership.user_id) || null,
      effectiveClinicDefaults
    );
  }

  private toSerializedMember(
    clinicId: string,
    membership: MembershipRow,
    authUser: any,
    profile: ProfileRow | null,
    clinicDefaults: ClinicTeamDefaults
  ) {
    const metadata = applyClinicDefaultsToMetadata(readClinicMetadata(authUser, clinicId), clinicDefaults);
    const accessLevel = accessLevelFromMembership(membership, metadata);
    const fullName =
      normalizeText(profile?.full_name) ||
      normalizeText(authUser?.user_metadata?.full_name) ||
      metadata.fullName ||
      normalizeText(authUser?.email) ||
      "Sem nome";

    const email = normalizeEmail(authUser?.email) || metadata.email || "";

    return {
      id: membership.id,
      userId: membership.user_id,
      fullName,
      email,
      avatarUrl: profile?.avatar_url || null,
      accessLevel,
      memberKind: accessLevel === "secretary" ? "secretary" : metadata.memberKind || "doctor",
      areaId: metadata.areaId,
      specialties: metadata.specialties,
      licenseCode: metadata.licenseCode,
      accountStatus: statusFromAuthUser(authUser),
      createdAt: membership.created_at,
      isAdmin: Boolean(membership.is_admin),
      isOwner: membership.role === "owner",
    };
  }

  private async getClinicPlanSummary(clinicId: string, members: Array<{ id: string; memberKind: TeamMemberKind }>) {
    const plan = await this.getPlanForClinic(clinicId);

    const usedDoctors = members.filter((member) => member.memberKind === "doctor").length;
    const usedSecretaries = members.filter((member) => member.memberKind === "secretary").length;

    return {
      name: plan.name,
      maxDoctors: plan.maxDoctors,
      maxSecretaries: plan.maxSecretaries,
      usedDoctors,
      usedSecretaries,
      remainingDoctors: plan.maxDoctors < 0 ? -1 : Math.max(0, plan.maxDoctors - usedDoctors),
      remainingSecretaries: plan.maxSecretaries < 0 ? -1 : Math.max(0, plan.maxSecretaries - usedSecretaries),
    };
  }

  private async getPlanForClinic(clinicId: string) {
    const desiredPlan = (await this.getClinicDesiredPlan(clinicId)) || "professional";
    const plans = await this.getAvailablePlans();
    const planRow =
      plans.find((plan) => normalizePlanKey(plan.name) === normalizePlanKey(desiredPlan)) || null;

    return compactPlan(desiredPlan, planRow);
  }

  private async getClinicDesiredPlan(clinicId: string) {
    const { data: clinic, error: clinicError } = await this.admin
      .from("clinics")
      .select("desired_plan")
      .eq("id", clinicId)
      .limit(1)
      .maybeSingle<{ desired_plan: string | null }>();

    if (clinicError) {
      throw new HttpError(500, "Não foi possível carregar o plano atual da clínica.", clinicError);
    }

    return normalizeText(clinic?.desired_plan);
  }

  private async getAvailablePlans() {
    const { data, error } = await this.admin
      .from("plans")
      .select("id,name,price_brl,max_doctors,max_secretaries,max_patients")
      .order("price_brl", { ascending: true })
      .returns<PlanRow[]>();

    if (error) {
      throw new HttpError(500, "Não foi possível carregar os planos disponíveis.", error);
    }

    const rows = (data || []).filter((plan) => normalizeText(plan.name));
    return rows.length ? rows : DEFAULT_PLAN_ROWS;
  }

  private async ensureCapacity(
    clinicId: string,
    members: Array<{ id: string; memberKind: TeamMemberKind }>,
    requestedKind: TeamMemberKind,
    excludeMembershipId?: string
  ) {
    const plan = await this.getPlanForClinic(clinicId);
    const effectiveMembers = excludeMembershipId ? members.filter((member) => member.id !== excludeMembershipId) : members;

    const usedDoctors = effectiveMembers.filter((member) => member.memberKind === "doctor").length;
    const usedSecretaries = effectiveMembers.filter((member) => member.memberKind === "secretary").length;

    if (requestedKind === "doctor" && plan.maxDoctors >= 0 && usedDoctors + 1 > plan.maxDoctors) {
      throw new HttpError(
        409,
        `O ${plan.name === "essencial" ? "plano Essencial" : "plano Professional"} já atingiu o limite de profissionais.`
      );
    }

    if (requestedKind === "secretary" && plan.maxSecretaries >= 0 && usedSecretaries + 1 > plan.maxSecretaries) {
      throw new HttpError(
        409,
        `O ${plan.name === "essencial" ? "plano Essencial" : "plano Professional"} já atingiu o limite de secretárias.`
      );
    }
  }

  private async ensureAuthUser({
    email,
    fullName,
    clinicId,
  }: {
    email: string;
    fullName: string;
    clinicId: string;
  }) {
    const existingUser = await this.findUserByEmail(email);
    if (existingUser) return existingUser;

    const { data, error } = await this.admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
      },
    });

    if (error || !data.user) {
      this.logger?.error?.(
        {
          category: "invite_failure",
          clinicId,
          emailDomain: emailDomain(email),
          status: Number((error as any)?.status || 0) || null,
          error: error instanceof Error ? error.message : String(error || "unknown"),
        },
        "Failed to invite clinic team member"
      );
      throw new HttpError(500, "Não foi possível criar o convite do usuário.", {
        category: "invite_failure",
      });
    }

    return data.user;
  }

  private async findUserByEmail(email: string) {
    const target = email.trim().toLowerCase();
    let page = 1;
    const perPage = 200;

    while (page <= 50) {
      const { data, error } = await this.admin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        throw new HttpError(500, "Não foi possível verificar se o usuário já existe.", error);
      }

      const users = data.users || [];
      const match = users.find((user) => String(user.email || "").trim().toLowerCase() === target);
      if (match) return match;
      if (users.length < perPage) break;
      page += 1;
    }

    return null;
  }

  private async syncUserProfileAndMetadata(
    userId: string,
    {
      fullName,
      clinicId,
      metadata,
    }: {
      fullName: string;
      clinicId: string;
      metadata: TeamMemberMetadata;
    }
  ) {
    const authUser = await this.getUserById(userId);
    const nextAppMetadata = mergeClinicMetadata(authUser, clinicId, metadata);
    const nextUserMetadata = {
      ...(authUser?.user_metadata || {}),
      full_name: fullName,
    };

    const { error: updateError } = await this.admin.auth.admin.updateUserById(userId, {
      app_metadata: nextAppMetadata,
      user_metadata: nextUserMetadata,
    } as any);

    if (updateError) {
      throw new HttpError(500, "Não foi possível atualizar os metadados do usuário.", updateError);
    }

    const { error: profileError } = await this.admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: fullName,
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        }
      );

    if (profileError) {
      throw new HttpError(500, "Não foi possível sincronizar o perfil do usuário.", profileError);
    }
  }
}
