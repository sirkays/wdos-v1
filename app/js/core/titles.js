/**
 * Phase 166 — network-specific role titles (approved reference screens).
 * WGMN keeps the Coordinator / Representative titles; WNNN uses Lead titles.
 */
import { t } from './i18n.js';
const WNNN = {
  country_rep: 'Country Lead', deputy_country_rep: 'Deputy Country Lead',
  state_coordinator: 'State / Regional Lead', assistant_state_coordinator: 'Deputy State / Regional Lead',
  state_secretary: 'State / Regional Secretary',
  district_coordinator: 'LGA / District Lead', assistant_district_coordinator: 'Assistant LGA / District Lead',
  cluster_coordinator: 'Community Cluster Lead', assistant_cluster_coordinator: 'Assistant Community Cluster Lead',
  chapter_lead: 'Chapter Lead', assistant_chapter_lead: 'Assistant Chapter Lead',
};
const WGMN = { chapter_lead: 'Chapter Coordinator', assistant_chapter_lead: 'Assistant Chapter Coordinator' };
export function roleTitle(role, network) {
  if (!role) return '';
  if (network === 'WNNN' && WNNN[role]) return WNNN[role];
  if (network === 'WGMN' && WGMN[role]) return WGMN[role];
  return t('role.' + role);
}
