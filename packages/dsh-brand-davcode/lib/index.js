/**
 * Node half of the DavCode identity pack.
 *
 * Everything this pack contributes is browser-side: it occupies the brand slots the
 * shipped UI declares and keeps the product name in the window title and tab icon.
 * Nothing is registered on the host plane, so this half is deliberately empty — it
 * exists because a client row is mounted through its package's main entry.
 *
 * @module dsh-brand-davcode
 */

/** Mount the (empty) host half. */
export function apply() {}
