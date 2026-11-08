// Shared hosting must not be inferred from the existing school_id columns.
// Provider settings, domain-bound sessions and client branding still need
// institution-aware integration before a shared school runtime can be enabled.
export function assertSchoolRuntimeMode(env=process.env) {
  const mode=env.SCHOOL_HOSTING_MODE || 'DEDICATED_DATABASE';
  if(mode!=='DEDICATED_DATABASE')throw new Error('Only DEDICATED_DATABASE school hosting is enabled. Shared SaaS runtime requires its separate isolation and release acceptance.');
  return mode;
}
