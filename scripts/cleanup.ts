import { cleanupOldEvents } from '../src/server/cleanup';
import { getCompanyConfig } from '../src/lib/queries';

const config = getCompanyConfig();
const days = config.event_retention_days;
console.log(`[cleanup] Running manual cleanup (retention: ${days} days)...`);
const result = cleanupOldEvents(days);
console.log(`[cleanup] Done. Removed ${result.events} events, ${result.sessions} sessions.`);
