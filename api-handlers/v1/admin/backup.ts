import { route, ok } from '../../../server/http';
import { sql } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { ACCOUNT_BASE } from '../../../server/accountsView';

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin'] });
    const backup = await sql().begin(async (q) => {
      await q`set transaction isolation level repeatable read, read only`;
      const [registryIntakeLinks,reportDrafts,policyAcceptances,petBreedReferences,standaloneServices, accounts, barangays, records, prelistings, programInterestCampaigns, programInterestAllowedBarangays,
        programInterestPeople, programInterestActivity, stubBatches, stubTickets, programAttendance, stubActivity, programRuntime, programWorkspaceActivity,
        qualityReviews, qualityActivity, registryRequests, registryActivity, registrySourceLinks, censusSubmissions, censusOwners, censusPets, censusRegistryOwners, censusRegistryPets, censusReviewSnapshots, censusStatusHistory, censusDecisionActivity, navigationChanges, navigationSeen, idVerifications, idVerificationLog, activity, controls] = await Promise.all([
        q`select * from ekapon.registry_intake_links order by source,source_id`,
        q`select * from ekapon.report_drafts order by account_id,updated_at`,
        q`select * from ekapon.policy_acceptances order by id`,
        q`select * from ekapon.pet_breed_references order by species,name`,
        q`select * from ekapon.standalone_services order by created_at,id`,
        q.unsafe(`select * from (${ACCOUNT_BASE}) x order by x.id`),
        q`select * from ekapon.barangays order by id`,
        q`select dataset, record_id, record_data, archived, created_at, updated_at from ekapon.dashboard_records order by dataset, record_id`,
        q`select reference, owner_name, mobile, barangay_id, program, pets, submitted_at from ekapon.prelistings order by submitted_at, reference`,
        q`select * from ekapon.program_interest_campaigns order by created_at, id`,
        q`select * from ekapon.program_interest_allowed_barangays order by campaign_id, barangay_id`,
        q`select * from ekapon.program_interest_people order by campaign_id, created_at, id`,
        q`select * from ekapon.program_interest_activity order by id`,
        q`select * from ekapon.stub_batches order by id`,
        q`select * from ekapon.stub_tickets order by id`,
        q`select * from ekapon.program_attendance order by id`,
        q`select * from ekapon.stub_activity order by id`,
        q`select * from ekapon.program_runtime order by program_record_id`,
        q`select * from ekapon.program_workspace_activity order by id`,
        q`select * from ekapon.data_quality_reviews order by id`,
        q`select * from ekapon.data_quality_activity order by id`,
        q`select * from ekapon.registry_requests order by created_at,request_id`,
        q`select * from ekapon.registry_activity order by id`,
        q`select * from ekapon.registry_source_links order by dataset,source_id`,
        q`select * from ekapon.census_submissions order by created_at,id`,
        q`select * from ekapon.census_owners order by submission_id,line_no`,
        q`select * from ekapon.census_pets order by owner_id,line_no`,
        q`select * from ekapon.registry_owners order by id`,
        q`select * from ekapon.registry_pets order by owner_id,id`,
        q`select * from ekapon.census_review_snapshots order by submission_id`,
        q`select * from ekapon.census_submission_status_history order by id`,
        q`select * from ekapon.census_decision_activity order by id`,
        q`select * from ekapon.navigation_changes order by id`,
        q`select * from ekapon.navigation_seen order by account_id,node_id,scope_key`,
        q`select id, user_id, barangay_id, status, reviewer_id, reviewer_name, reviewed_at,
                 decision_reason, submitted_at, purge_after, purged_at
            from ekapon.id_verifications order by submitted_at, id`,
        q`select id, verification_id, user_id, user_name, reviewer_id, reviewer_name,
                 outcome, reason, created_at
            from ekapon.id_verification_log order by id`,
        q`select id, table_name, record_id, operation, account_id,
                 old_data - array['password_hash', 'token', 'secret', 'access_token', 'refresh_token'] as old_data,
                 new_data - array['password_hash', 'token', 'secret', 'access_token', 'refresh_token'] as new_data, created_at
            from ekapon.audit_log order by id`,
        q`select setting_key, setting_value, updated_at from ekapon.system_settings
           union all
         select 'feature_access:' || account_type || ':' || feature_key, to_jsonb(enabled), updated_at
           from ekapon.role_feature_access order by 1`,
      ]);
      return {
        format: 'cityvet-supabase-backup-v1',
        recovery: {
          purpose: 'selected-record-export',
          completeDatabaseBackup: false,
          applicationRestoreSupported: false,
          excluded: [
            'Account password hashes and temporary credentials',
            'Dedicated profile-photo and census-attachment tables',
            'Access grants, permission requests, issues, and notification tables',
            'Import-batch metadata, undo tokens, sequences, schema, and database roles',
          ],
          requiredForRecovery: 'A separately verified database backup and restore procedure',
        },
        exportedAt: new Date().toISOString(),
        exportedBy: { accountId: session.id, username: session.username },
        contains: {
          accounts: accounts.length,
          barangays: barangays.length,
          dashboardRecords: records.length,
          prelistings: prelistings.length,
          programInterestCampaigns: programInterestCampaigns.length,
          programInterestPeople: programInterestPeople.length,
          stubBatches: stubBatches.length,
          stubTickets: stubTickets.length,
          programAttendance: programAttendance.length,
          standaloneServices: standaloneServices.length,
          programRuntime: programRuntime.length,
          qualityReviews: qualityReviews.length,
          qualityReviewActions: qualityActivity.length,
          registryChanges: registryActivity.length,
          censusSubmissions: censusSubmissions.length,
          idVerificationHistory: idVerifications.length,
          idVerificationAuditEntries: idVerificationLog.length,
          auditEntries: activity.length,
        },
        data: {
          registryIntakeLinks,reportDrafts,policyAcceptances,petBreedReferences,
          standaloneServices, accounts, barangays, dashboardRecords: records, prelistings,
          programInterestCampaigns, programInterestAllowedBarangays, programInterestPeople, programInterestActivity,
          stubBatches, stubTickets, programAttendance, stubActivity, programRuntime, programWorkspaceActivity, qualityReviews, qualityActivity,
          registryRequests, registryActivity, registrySourceLinks, idVerifications, idVerificationLog, auditLog: activity, controls,
          censusSubmissions,censusOwners,censusPets,censusRegistryOwners,censusRegistryPets,censusReviewSnapshots,censusStatusHistory,censusDecisionActivity,navigationChanges,navigationSeen,
        },
      };
    });
    return ok(backup, { 'Content-Disposition': `attachment; filename="cityvet-backup-${new Date().toISOString().slice(0, 10)}.json"` });
  },
});
