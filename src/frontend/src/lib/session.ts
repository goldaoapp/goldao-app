import type { Identity } from "@icp-sdk/core/agent";

/** Sign-in length for players, and for the game admin. */
export const PLAYER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
/** Small tolerance over the admin session length. */
const ADMIN_SESSION_MARGIN_MS = 10 * 60 * 1000;

export const msToNs = (ms: number): bigint => BigInt(ms) * 1_000_000n;

/** When the sign-in of this identity ends (ms since epoch), or null if it has no expiry to read. */
export function sessionEndsAtMs(identity: Identity | null): number | null {
  const chain = (
    identity as {
      getDelegation?: () => {
        delegations: { delegation: { expiration: bigint } }[];
      };
    } | null
  )?.getDelegation?.();
  if (!chain || chain.delegations.length === 0) return null;
  let end: bigint | null = null;
  for (const d of chain.delegations) {
    const e = d.delegation.expiration;
    if (end === null || e < end) end = e;
  }
  return end === null ? null : Number(end / 1_000_000n);
}

/** True when the sign-in is too long for admin work: the admin must sign in again for 8 hours. */
export function sessionTooLongForAdmin(
  endsAtMs: number | null,
  nowMs: number,
): boolean {
  if (endsAtMs === null) return false;
  return endsAtMs - nowMs > ADMIN_SESSION_MS + ADMIN_SESSION_MARGIN_MS;
}

/**
 * The address players authorize comes from the game config. It is used only if it matches the
 * canister this page talks to.
 */
export function trustedSpender(
  claimed: string | undefined,
  pageCanisterId: string | undefined,
): string {
  if (!claimed || !pageCanisterId || claimed !== pageCanisterId) return "";
  return claimed;
}
