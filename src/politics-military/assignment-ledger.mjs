import {inspectRoster} from './person-reference.mjs';

const FORMAT = 'woh.military.assignments';
const copy = value => JSON.parse(JSON.stringify(value));
const validId = id => (typeof id === 'string' && id.trim().length > 0) || (Number.isSafeInteger(id) && id >= 0);
const fail = (code, detail = {}) => ({ok: false, code, ...detail});

function normalize(input) {
  if (!input || !['assign', 'release'].includes(input.action) ||
      typeof input.operationId !== 'string' || !input.operationId.trim() ||
      !Number.isSafeInteger(input.actorId) || input.actorId < 0 || !validId(input.unitId) ||
      !Array.isArray(input.personIds) || input.personIds.some(id => !Number.isSafeInteger(id) || id < 0) ||
      (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0))) {
    throw new TypeError('invalid assignment command');
  }
  if (!input.personIds.length) throw new TypeError('empty roster');
  if (new Set(input.personIds).size !== input.personIds.length) throw new TypeError('duplicate person');
  const c = {action: input.action, operationId: input.operationId, actorId: input.actorId,
    unitId: input.unitId, personIds: [...input.personIds].sort((a, b) => a - b)};
  if (input.expectedRevision !== undefined) c.expectedRevision = input.expectedRevision;
  return c;
}

/** Referenced-person sidecar; no creation of people, units, rank, stock, movement or authority.
 * authorize is a synchronous, read-only world port. Only explicit true permits mutation.
 * Snapshot journal is trusted save data validated structurally, not a proof of past authority.
 */
export function createAssignmentLedger({worldKey, people, resolveUnit, authorize} = {}, snapshot) {
  if (typeof worldKey !== 'string' || !worldKey.trim()) throw new TypeError('canonical worldKey is required');
  inspectRoster(people, []);
  if (typeof resolveUnit !== 'function') throw new TypeError('canonical resolveUnit is required');
  const population = people.npc, assignments = new Map(), operations = [], operationIndex = new Map(), acknowledged = new Set();
  let executing = false;
  function requireBoundWorld() {
    if (people.npc !== population) throw new TypeError('canonical population reference changed; recreate the adapter');
  }
  const exists = id => Number.isSafeInteger(id) && id >= 0 && id < population.n;
  function unit(id) { const value = resolveUnit(id); return value?.id === id ? value : null; }
  function conflict(c) {
    for (const personId of c.personIds) {
      const old = assignments.get(personId);
      if (c.action === 'assign' && old) return fail('already-assigned', {personId, assignedUnitId: old.unitId});
      if (c.action === 'release' && (!old || old.unitId !== c.unitId)) return fail('not-assigned-to-unit', {personId});
    }
    return null;
  }
  function commit(c, day) {
    for (const personId of c.personIds) {
      if (c.action === 'assign') assignments.set(personId, {personId, unitId: c.unitId, assignedBy: c.actorId, assignedDay: day});
      else assignments.delete(personId);
    }
    operationIndex.set(c.operationId, operations.length);
    operations.push({command: c, day});
  }
  function receipt(index, replayed) {
    const record = operations[index];
    return {ok: true, operationId: record.command.operationId, revision: index + 1, day: record.day, replayed};
  }

  if (snapshot != null) {
    try {
      if (snapshot.format !== FORMAT || snapshot.version !== 1 || snapshot.worldKey !== worldKey ||
          !Array.isArray(snapshot.operations) || !Array.isArray(snapshot.acknowledged)) throw Error('format or world');
      for (const record of snapshot.operations) {
        const c = normalize(record?.command);
        if (!Number.isSafeInteger(record.day) || record.day > population.day ||
            (operations.length && record.day < operations.at(-1).day) || operationIndex.has(c.operationId) ||
            (c.expectedRevision !== undefined && c.expectedRevision !== operations.length) ||
            !exists(c.actorId) || c.personIds.some(id => !exists(id)) || !unit(c.unitId) || conflict(c)) throw Error('invalid journal');
        // Rebuild historical committed facts without rerunning present-day authority or reviving people.
        commit(c, record.day);
      }
      for (const id of snapshot.acknowledged) {
        if (!operationIndex.has(id) || acknowledged.has(id)) throw Error('invalid acknowledgement');
        acknowledged.add(id);
      }
    } catch (error) {
      throw new TypeError('invalid assignment snapshot: ' + error.message);
    }
  }

  function perform(input) {
      let c;
      try { c = normalize(input); } catch (error) { return fail('invalid-command', {reason: error.message}); }
      const prior = operationIndex.get(c.operationId);
      if (prior !== undefined) {
        return JSON.stringify(operations[prior].command) === JSON.stringify(c)
          ? receipt(prior, true) : fail('operation-id-conflict');
      }
      if (c.expectedRevision !== undefined && c.expectedRevision !== operations.length) return fail('stale-revision');
      if (!exists(c.actorId)) return fail('unknown-actor');
      if (!population.alive(c.actorId)) return fail('actor-not-alive');
      let target;
      try { target = unit(c.unitId); } catch { return fail('unit-unavailable'); }
      if (!target) return fail('unknown-unit');
      if (c.action === 'assign' && target.active === false) return fail('unit-inactive');
      try {
        const request = Object.freeze({...c, personIds: Object.freeze([...c.personIds]), worldKey, day: population.day});
        if (typeof authorize !== 'function' || authorize(request) !== true) return fail('not-authorized');
      } catch { return fail('authority-unavailable'); }
      // Recheck canonical people after the external authority callback, before any ledger mutation.
      if (people.npc !== population) return fail('world-reference-changed');
      if (!exists(c.actorId) || !population.alive(c.actorId)) return fail('actor-not-alive');
      try { target = unit(c.unitId); } catch { return fail('unit-unavailable'); }
      if (!target) return fail('unknown-unit');
      if (c.action === 'assign' && target.active === false) return fail('unit-inactive');
      if (c.action === 'assign') {
        const result = inspectRoster(people, c.personIds);
        if (!result.ok) return fail(result.issues[0].code, {personId: result.issues[0].personId});
      } else if (c.personIds.some(id => !exists(id))) return fail('unknown-person');
      const problem = conflict(c); if (problem) return problem;
      if (!Number.isSafeInteger(population.day) || (operations.length && population.day < operations.at(-1).day)) return fail('world-clock-reversed');
      commit(c, population.day);
      return receipt(operations.length - 1, false);
  }
  return {
    get revision() { return operations.length; },
    isBoundTo(key, targetPeople) { return key === worldKey && targetPeople === people && people.npc === population; },
    execute(input) {
      if (people.npc !== population) return fail('world-reference-changed');
      if (executing) return fail('ledger-busy');
      executing = true;
      try { return perform(input); } finally { executing = false; }
    },
    assignments() {
      requireBoundWorld();
      return [...assignments.values()].sort((a, b) => a.personId - b.personId)
        .map(record => ({...record, exists: exists(record.personId), alive: exists(record.personId) && population.alive(record.personId)}));
    },
    pendingEvents() {
      requireBoundWorld();
      return operations.filter(record => !acknowledged.has(record.command.operationId)).map(({command: c, day}) =>
        ({id: c.operationId, type: 'military.person-assignment', action: c.action, worldKey, day,
          actorId: c.actorId, unitId: c.unitId, personIds: [...c.personIds]}));
    },
    acknowledgeEvent(id) {
      requireBoundWorld();
      if (executing) return false;
      if (!operationIndex.has(id) || acknowledged.has(id)) return false;
      acknowledged.add(id); return true;
    },
    save() {
      requireBoundWorld();
      return {format: FORMAT, version: 1, worldKey, operations: copy(operations), acknowledged: [...acknowledged].sort()};
    }
  };
}
