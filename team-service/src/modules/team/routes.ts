import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError } from "../../errors.js";
import { readJsonBody, sendJson } from "../../http/responses.js";
import { TeamModuleService } from "./service.js";

export async function handleTeamRoutes(args: {
  request: IncomingMessage;
  response: ServerResponse;
  pathname: string;
  userId: string;
  service: TeamModuleService;
}) {
  const { request, response, pathname, userId, service } = args;

  const plansMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/plans$/);
  if (request.method === "GET" && plansMatch) {
    const clinicId = decodeURIComponent(plansMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    sendJson(response, 200, await service.listPlans(clinicId, userId));
    return true;
  }

  const activePlanMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/plan$/);
  if (request.method === "PATCH" && activePlanMatch) {
    const clinicId = decodeURIComponent(activePlanMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const body = await readJsonBody<{ planId?: string }>(request);
    sendJson(
      response,
      200,
      await service.updatePlan(clinicId, userId, String(body.planId || ""))
    );
    return true;
  }

  const membersMatch = pathname.match(/^\/team\/clinics\/([^/]+)\/members$/);
  if (request.method === "GET" && membersMatch) {
    const clinicId = decodeURIComponent(membersMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    sendJson(response, 200, await service.listMembers(clinicId, userId));
    return true;
  }

  if (request.method === "POST" && membersMatch) {
    const clinicId = decodeURIComponent(membersMatch[1] || "").trim();
    if (!clinicId) {
      throw new HttpError(400, "clinicId é obrigatório.");
    }

    const body = await readJsonBody<{
      fullName?: string;
      email?: string;
      accessLevel?: "doctor_admin" | "doctor" | "secretary";
      areaId?: string | null;
      specialties?: string[];
      licenseCode?: string | null;
    }>(request);

    const created = await service.createMember(clinicId, userId, {
      fullName: String(body.fullName || ""),
      email: String(body.email || ""),
      accessLevel: body.accessLevel || "doctor",
      areaId: body.areaId ?? null,
      specialties: Array.isArray(body.specialties) ? body.specialties : [],
      licenseCode: body.licenseCode ?? null,
    });

    sendJson(response, 200, { member: created });
    return true;
  }

  const detailMatch = pathname.match(
    /^\/team\/clinics\/([^/]+)\/members\/([^/]+)$/
  );
  if (request.method === "PATCH" && detailMatch) {
    const clinicId = decodeURIComponent(detailMatch[1] || "").trim();
    const memberId = decodeURIComponent(detailMatch[2] || "").trim();
    if (!clinicId || !memberId) {
      throw new HttpError(400, "clinicId e memberId são obrigatórios.");
    }

    const body = await readJsonBody<{
      fullName?: string;
      accessLevel?: "owner" | "doctor_admin" | "doctor" | "secretary";
      areaId?: string | null;
      specialties?: string[];
      licenseCode?: string | null;
    }>(request);

    const updated = await service.updateMember(clinicId, memberId, userId, {
      fullName: String(body.fullName || ""),
      accessLevel: body.accessLevel,
      areaId: body.areaId ?? null,
      specialties: Array.isArray(body.specialties) ? body.specialties : [],
      licenseCode: body.licenseCode ?? null,
    });

    sendJson(response, 200, { member: updated });
    return true;
  }

  return false;
}
