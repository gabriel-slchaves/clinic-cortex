import { TeamRepository } from "../../repositories/supabase/TeamRepository.js";

type CreateTeamMemberInput = Parameters<TeamRepository["createClinicMember"]>[2];
type UpdateTeamMemberInput = Parameters<TeamRepository["updateClinicMember"]>[3];

export class TeamModuleService {
  constructor(private readonly repository: TeamRepository) {}

  listPlans(clinicId: string, userId: string) {
    return this.repository.listAvailablePlans(clinicId, userId);
  }

  updatePlan(clinicId: string, userId: string, planId: string) {
    return this.repository.updateClinicPlan(clinicId, userId, planId);
  }

  listMembers(clinicId: string, userId: string) {
    return this.repository.listClinicMembers(clinicId, userId);
  }

  createMember(clinicId: string, userId: string, input: CreateTeamMemberInput) {
    return this.repository.createClinicMember(clinicId, userId, input);
  }

  updateMember(
    clinicId: string,
    memberId: string,
    userId: string,
    input: UpdateTeamMemberInput
  ) {
    return this.repository.updateClinicMember(clinicId, memberId, userId, input);
  }
}

export function createTeamModuleService(args: {
  repository: TeamRepository;
}) {
  return new TeamModuleService(args.repository);
}
