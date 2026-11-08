/** Public school identity used for branding only. Operational school settings
 * (campuses, academic years, Ministry identifiers, staff and learners) must be
 * configured and stored in the database before the ERP workspace is enabled.
 */
import {INSTITUTION} from './institution.ts';
export const THE_REDEEMER_SCHOOL_INFO = {
  schoolCode: INSTITUTION.code,
  name: INSTITUTION.name,
  formalName: INSTITUTION.name,
  motto: INSTITUTION.motto,
  founded: INSTITUTION.founded?Number(INSTITUTION.founded):'',
  moeEmisCode: 'Not configured',
  moePermitNumber: 'Not configured',
  campuses: [] as Array<{ id: string; name: string; grades?: string }>,
  academicYear: 'Not configured',
  currentTerm: 'Not configured',
  principal: 'Not configured',
};
