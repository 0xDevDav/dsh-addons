/**
 * Node half of the Italian language pack.
 *
 * The pack contributes only browser-side copy: the language definition and one
 * dictionary per locale namespace, registered against the client `locale`
 * service. Nothing is registered on the host plane, so this half is deliberately
 * empty — it exists because a client row is mounted through its package's main
 * entry.
 *
 * @module dsh-locale-it
 */

/** Mount the (empty) host half. */
export function apply() {}
