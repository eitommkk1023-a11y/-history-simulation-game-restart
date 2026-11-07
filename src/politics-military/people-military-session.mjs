import {createAssignmentLedger} from './assignment-ledger.mjs';

const FORMAT = 'woh.people-military';
function populationStamp(people) {
  const p = people?.npc;
  if (!p || !Number.isSafeInteger(p.n) || p.n < 0 || !Number.isSafeInteger(p.day) ||
      typeof p.checksum !== 'function') throw new TypeError('canonical population is required');
  return {n:p.n, day:p.day, seed:p.seed, rng:p.rng, checksum:p.checksum()};
}
const sameStamp = (a,b) => ['n','day','seed','rng','checksum'].every(key => a?.[key] === b?.[key]);

/** Optional population-section adapter. This is not a complete world save or storage transaction.
 * savePeople/loadPeople are synchronous canonical ports. Unit lookup/authority must be read-only;
 * their second argument is the specific current or staged people object (never a captured old one).
 * The caller owns worldKey, canonical unit persistence, and adoption of session.people after restore.
 */
export function createPeopleMilitarySession({worldKey, people, savePeople, loadPeople, resolveUnit, authorize} = {}) {
  if (typeof savePeople !== 'function' || typeof loadPeople !== 'function') {
    throw new TypeError('canonical savePeople and loadPeople ports are required');
  }
  if (typeof resolveUnit !== 'function') throw new TypeError('canonical resolveUnit is required');
  let busy = false;
  function context(target, snapshot) {
    populationStamp(target);
    const ledger = createAssignmentLedger({worldKey, people:target,
      resolveUnit:id=>resolveUnit(id,target),
      authorize:command=>typeof authorize === 'function' && authorize(command,target) === true}, snapshot);
    return {people:target, ledger};
  }
  let current = context(people);
  function exclusive(action) {
    if (busy) throw new TypeError('people/military session is busy');
    busy=true;
    try {return action();} finally {busy=false;}
  }
  function stagedPeople(snapshot) {
    // peopleLoad mutates nested metadata; never give it the caller's save object.
    const loaded = loadPeople(structuredClone(snapshot));
    if (!loaded || typeof loaded.then === 'function' || loaded === current.people || loaded.npc === current.people.npc) {
      throw new TypeError('loadPeople must synchronously construct a separate canonical population');
    }
    populationStamp(loaded);
    return loaded;
  }
  return {
    get people() {return current.people;},
    get revision() {return current.ledger.revision;},
    execute(command) {
      if (busy) return {ok:false, code:'session-busy'};
      return exclusive(()=>current.ledger.execute(command));
    },
    assignments() {return current.ledger.assignments();},
    pendingEvents() {return current.ledger.pendingEvents();},
    acknowledgeEvent(id) {
      if (busy) return false;
      return exclusive(()=>current.ledger.acknowledgeEvent(id));
    },
    save() {
      return exclusive(()=>{
        // Verify the ledger is still bound before invoking any outside port.
        const military = current.ledger.save();
        const population = populationStamp(current.people);
        const saved = savePeople(current.people);
        if (!saved || typeof saved.then === 'function') throw new TypeError('savePeople must return a synchronous snapshot');
        const result = structuredClone({format:FORMAT, version:1, worldKey, population, people:saved, military});
        current.ledger.save();
        if (!sameStamp(population,populationStamp(current.people))) throw new TypeError('population changed during save');
        return result;
      });
    },
    restore(snapshot) {
      return exclusive(()=>{
        if (snapshot?.format !== FORMAT || snapshot.version !== 1 || snapshot.worldKey !== worldKey ||
            !snapshot.population || !snapshot.people || !snapshot.military) throw new TypeError('invalid people/military snapshot');
        const data = structuredClone(snapshot), candidate = stagedPeople(data.people);
        if (!sameStamp(data.population,populationStamp(candidate))) throw new TypeError('population snapshot metadata mismatch');
        const next = context(candidate,data.military);
        if (!sameStamp(data.population,populationStamp(candidate))) throw new TypeError('population changed during snapshot validation');
        // Sole commit point: no active population/ledger replacement on any validation failure.
        current=next;
        return current.people;
      });
    },
    restoreLegacyPeople(snapshot) {
      return exclusive(()=>{
        // Legacy data has no world key: caller must explicitly establish its world provenance.
        // Do not silently downgrade an unsupported new envelope to legacy input.
        if (!snapshot?.meta?.npc || Object.hasOwn(snapshot,'format')) throw new TypeError('invalid legacy people snapshot');
        const next=context(stagedPeople(snapshot));
        current=next;
        return current.people;
      });
    }
  };
}
