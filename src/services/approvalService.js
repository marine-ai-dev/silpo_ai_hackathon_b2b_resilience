// approvalService — records an Approval decision (a workflow state
// transition, NOT an agent/LLM call) and flips the ProcurementProposal
// and ProcurementRun status accordingly.
//
// ProcurementProposal.status: draft -> pending_approval -> approved|rejected -> prepared
// ProcurementRun.status:      READY_FOR_APPROVAL -> APPROVED|CANCELLED -> CART_PREPARED

import { collections } from '../repositories/jsonStore.js';
import { RUN_STATES } from './procurementOrchestrator.js';

export function decide({ proposalId, approverName, decision, comment }) {
  const proposal = collections.procurementProposals.getById(proposalId);
  if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
  if (proposal.status !== 'pending_approval') {
    throw new Error(`Proposal ${proposalId} is not pending approval (status=${proposal.status})`);
  }
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error(`Invalid decision: ${decision}`);
  }

  const approval = collections.approvals.insert({
    proposalId,
    approverName,
    decision,
    comment: comment || '',
    decidedAt: new Date().toISOString()
  });

  const newStatus = decision === 'approved' ? 'approved' : 'rejected';
  const updatedProposal = collections.procurementProposals.update(proposalId, {
    status: newStatus,
    history: [
      ...proposal.history,
      { at: approval.decidedAt, actor: approverName || 'Approver', action: `decision_${decision}`, detail: comment || '' }
    ]
  });

  if (proposal.runId) {
    const run = collections.procurementRuns.getById(proposal.runId);
    if (run) {
      collections.procurementRuns.update(run.id, {
        status: decision === 'approved' ? RUN_STATES.APPROVED : RUN_STATES.CANCELLED,
        updatedAt: approval.decidedAt
      });
    }
  }

  return { approval, proposal: updatedProposal };
}
