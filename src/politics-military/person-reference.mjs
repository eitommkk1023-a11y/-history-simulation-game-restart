/** P0 read-only bridge. IDs belong to the existing world; no people are created here.
 * This validates references, not recruitment eligibility, command authority or arrival.
 * Caller must revalidate at execution time; this is not a reservation/assignment ledger.
 */
export function inspectRoster(people, personIds) {
  const p = people?.npc;
  if (!p || !Number.isSafeInteger(p.n) || !p.group || !p.eth || typeof p.alive !== 'function') {
    throw new TypeError('canonical population is required');
  }
  if (!Array.isArray(personIds)) throw new TypeError('personIds must be an array');
  const seen = new Set(), issues = [], members = [];
  for (const id of personIds) {
    if (!Number.isSafeInteger(id) || id < 0 || id >= p.n) {
      issues.push({code: 'unknown-person', personId: id}); continue;
    }
    if (seen.has(id)) { issues.push({code: 'duplicate-person', personId: id}); continue; }
    seen.add(id);
    if (!p.alive(id)) { issues.push({code: 'person-not-alive', personId: id}); continue; }
    members.push(Object.freeze({personId: id, communityId: p.group[id],
      ethnicityId: p.eth[id] || p.groupEth[p.group[id]], observedDay: p.day,
      physicalPosition: null}));
  }
  return {ok: issues.length === 0, members: issues.length ? [] : members, issues};
}
