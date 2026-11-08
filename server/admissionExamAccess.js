// Pure, fail-closed predicates for entrance-exam authorization.
// Caller MUST first resolve the authenticated applicant identity, fetch tenant-scoped
// database records, and enforce this decision inside the write transaction.
export function examEligibility({ exam, application, assignment, fee, settlement }) {
  if (!exam || exam.status !== 'SCHEDULED') return { allowed: false, reason: 'EXAM_NOT_SCHEDULED' };
  if (!application || !['RECEIVED','UNDER_REVIEW','INTERVIEW_SCHEDULED','OFFERED','ACCEPTED','WAITLISTED'].includes(application.status))
    return { allowed: false, reason: 'APPLICATION_INACTIVE' };
  if (!assignment || assignment.status !== 'INVITED')
    return { allowed: false, reason: 'ASSIGNMENT_NOT_INVITED' };
  if (!fee) return { allowed: false, reason: 'FEE_NOT_CONFIGURED' };
  const validAmount = value => (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value));
  if (!validAmount(fee.amount)) return { allowed: false, reason: 'FEE_INVALID' };
  const amount = Number(fee.amount);
  if (!Number.isFinite(amount) || amount < 0 || !['USD','LRD'].includes(fee.currency))
    return { allowed: false, reason: 'FEE_INVALID' };
  if (amount === 0) return { allowed: true, reason: 'NO_CHARGE' };
  if (!settlement) return { allowed: false, reason: 'PAYMENT_REQUIRED' };
  if (settlement.kind === 'WAIVER' && settlement.channel === 'WAIVER' &&
      validAmount(settlement.amount) && Number(settlement.amount) === 0 && settlement.currency === fee.currency &&
      settlement.verified_at && Number.isFinite(Date.parse(settlement.verified_at)) && typeof settlement.reason === 'string' &&
      settlement.reason.trim().length >= 10) return { allowed: true, reason: 'WAIVER_VERIFIED' };
  if (settlement.kind === 'PAYMENT' &&
      ['CASH','BANK_TRANSFER','MTN_MOMO_VERIFIED'].includes(settlement.channel) &&
      validAmount(settlement.amount) && Number(settlement.amount) === amount &&
      settlement.currency === fee.currency && settlement.verified_at && Number.isFinite(Date.parse(settlement.verified_at)))
    return { allowed: true, reason: 'PAYMENT_VERIFIED' };
  return { allowed: false, reason: 'PAYMENT_MISMATCH' };
}

export function examSittingWindow(exam, now = new Date()) {
  if (!exam || exam.status !== 'SCHEDULED') return { allowed: false, reason: 'EXAM_NOT_SCHEDULED' };
  const start = new Date(exam.starts_at).getTime();
  const end = new Date(exam.ends_at).getTime();
  const current = new Date(now).getTime();
  if (![start,end,current].every(Number.isFinite) || end <= start)
    return { allowed: false, reason: 'INVALID_SCHEDULE' };
  if (current < start) return { allowed: false, reason: 'NOT_STARTED' };
  if (current >= end) return { allowed: false, reason: 'EXAM_ENDED' };
  return { allowed: true, reason: 'IN_WINDOW', endsAt: new Date(end).toISOString() };
}

export function canSubmitExamAttempt({ eligibility, window, attempt, authenticatedApplicationId, applicationId }) {
  if (!authenticatedApplicationId || !applicationId || authenticatedApplicationId !== applicationId)
    return { allowed: false, reason: 'IDENTITY_MISMATCH' };
  if (!eligibility?.allowed) return { allowed: false, reason: eligibility?.reason || 'NOT_ELIGIBLE' };
  if (!window?.allowed) return { allowed: false, reason: window?.reason || 'OUTSIDE_WINDOW' };
  if (!attempt || attempt.status !== 'IN_PROGRESS')
    return { allowed: false, reason: 'ATTEMPT_NOT_ACTIVE' };
  return { allowed: true, reason: 'MAY_SUBMIT' };
}
