export { jstNow, toJstString, isTimeBefore } from './utils';
export * from './friends';
export * from './tags';
export * from './scenarios';
export * from './broadcasts';
export * from './users';
export * from './line-accounts';
export * from './calendar';
export * from './notifications';
export * from './health';
export * from './entry-routes';
export * from './forms';
export * from './jobs';
export * from './nurseries';
export * from './nursery-contacts';
export * from './profiles';
export * from './attendance';
export * from './reviews';
export * from './credit-score';
export * from './payroll';
export * from './admin-auth';

/**
 * Thin wrapper around D1Database.
 * Pass the result of createDb() into any query helper in this package.
 */
export function createDb(d1: D1Database): D1Database {
  return d1;
}
