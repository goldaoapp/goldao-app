import type { GameConfig } from "@/backend";
import { GOLDAO_LEDGER } from "@/lib/goldao-ledger";

/** Name of the test token, shown where the player sees their own wallet. */
export const TEST_TOKEN_LABEL = "GOLDAO TEST";

/**
 * True when the game runs on a ledger that is not the real GOLDAO one. The mode itself is the
 * MODE constant in the backend (lib/ledger.mo); the frontend only reads which ledger it
 * resulted in, so the two can never disagree.
 */
export function isTestLedger(config: GameConfig | undefined): boolean {
  return !!config && config.realLedger && config.ledgerId !== GOLDAO_LEDGER;
}
