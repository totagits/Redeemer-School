/** Public school identity used for branding only. Operational school settings
 * (campuses, academic years, Ministry identifiers, staff and learners) must be
 * configured and stored in the database before the ERP workspace is enabled.
 */
export const THE_REDEEMER_SCHOOL_INFO = {
  schoolCode: 'RIA',
  name: "Redeemer's International Academy",
  formalName: "Redeemer's International Academy",
  motto: 'Academic and Moral Excellence',
  founded: 2022,
  moeEmisCode: 'Not configured',
  moePermitNumber: 'Not configured',
  campuses: [] as Array<{ id: string; name: string; grades?: string }>,
  academicYear: 'Not configured',
  currentTerm: 'Not configured',
  principal: 'Not configured',
};
