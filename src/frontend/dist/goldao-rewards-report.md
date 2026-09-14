# Gold DAO — Reward System: Technical Report

Document version: 2026-08-31
Sources: `canisters.zip` (verified code), on-chain data, GOLDAO APP simulator code, SNS API responses.

This document covers the full reward pipeline from NNS maturity generation to the ICP/OGY/GLDT/WTN that lands in a staker's wallet. It is structured in three layers: a plain-language summary, a technical walkthrough of what the code does, and an explanation of how GOLDAO APP estimates rewards and why the estimate is always approximate.



## Part 1 — How rewards work (summary)

Gold DAO controls 7 neurons in the ICP Network Nervous System (NNS). These neurons earn ICP through staking rewards (maturity). Every day, a background job checks whether any neuron has accumulated more than 1,000 ICP of maturity. If so, it spawns a child neuron that dissolves in \~7 days. Once dissolved, the ICP is disbursed and split:

* 33 % goes to eligible GOLDAO stakers (distributed weekly as ICP).
* 33 % goes to the buyback engine (conditionally buys and burns GOLDAO, stakes OGY, or compounds ICP).
* 33 % goes to buying GLDT and distributing it to stakers.
* 1 % goes to The Good DAO (external charity wallet).

Before the split happens, the system checks a cycle-management account. If its balance is below 1,000 ICP, one whole disbursed neuron is diverted there to keep the canisters funded. This diversion is pre-split, so it reduces the total that enters the 33/33/33/1 distribution.

To receive rewards, a GOLDAO neuron must be eligible: dissolve delay set to the maximum (2 years) and not currently dissolving. The reward each neuron receives is proportional to its maturity delta since the last distribution — which in practice correlates with voting power and proposal participation.



## Part 2 — Technical walkthrough (from code)

### 2.1 Canisters and principals in the reward pipeline

**Core reward canisters:**

|Canister|ID|Role|
|-|-|-|
|`icp\_neuron`|`j4jiq-sqaaa-aaaap-ab23a-cai`|Controls 7 NNS neurons; spawns, disburses, splits ICP|
|`sns\_rewards`|`iyehc-lqaaa-aaaap-ab25a-cai`|Distributes ICP/OGY/GLDT to eligible GOLDAO neurons|
|`buyback\_burn`|`atslz-hiaaa-aaaam-acq6q-cai`|Swaps ICP→GOLDAO/OGY/GLDT; burns GOLDAO|
|`sns\_neuron\_controller`|`54vkq-taaaa-aaaap-ahqra-cai`|Controls OGY and WTN neurons|

**Governance and ledgers:**

|Canister|ID|
|-|-|
|SNS Governance (GOLDAO)|`tr3th-kiaaa-aaaaq-aab6q-cai`|
|SNS Ledger (GOLDAO)|`tyyy3-4aaaa-aaaaq-aab7q-cai`|
|SNS Index (GOLDAO)|`efv5g-kqaaa-aaaaq-aacaa-cai`|
|NNS Governance|`rrkah-fqaaa-aaaaa-aaaaq-cai`|
|ICP Ledger|`ryjl3-tyaaa-aaaaa-aaaba-cai`|
|OGY Governance|`lnxxh-yaaaa-aaaaq-aadha-cai`|

**DEX pools (ICPSwap):**

|Pair|Pool canister|
|-|-|
|ICP → GOLDAO|`k46ek-4qaaa-aaaag-qcyzq-cai`|
|ICP → OGY|`ttnzy-lyaaa-aaaag-qj2bq-cai`|

**Destination accounts (set by governance proposal #341):**

|Destination|Share|Account / Principal|
|-|-|-|
|Stakers (sns\_rewards)|33 %|`iyehc-lqaaa-aaaap-ab25a-cai` (subaccount `6dc2515bbb9b...`)|
|Buyback \& burn|33 %|`atslz-hiaaa-aaaam-acq6q-cai` (subaccount `31836130...`)|
|GLDT purchases|33 %|`5aybl-v7aii-duvsu-ztemq-litdi-ly42r-iyf35-2k46p-ovynj-amtow-rae` (subaccount `4fe98a12...`)|
|The Good DAO|1 %|`w4buy-lgwzr-pccs7-huzhh-qqnws-rns75-iaoox-jolrm-xs2ra-vdu3o-2qe`|
|Cycle management|pre-split|`a51ceabd4d86c16c94936db0422d9b814b4f20e58fa013aeace0053af2305e8c`|
|Compound fallback neuron|fallback|NNS neuron `7446549063176501841`|

**NNS neurons controlled by the DAO:**
`16073046412422000611`, `11817514607310831337`, `10544365593036349438`, `7446549063176501841`, `9474493450491766365`, `7927065134732340009`, `2115552344633178977`.



### 2.2 Step 1 — ICP generation (`icp\_neuron`)

File: `icp\_neuron/impl/src/jobs/process\_neurons.rs`

A daily timer triggers `run\_async()`. It calls NNS governance to list all controlled neurons and then:

**Spawn.** Every neuron whose maturity exceeds `SPAWN\_LIMIT\_ICP = 1000` ICP and has no pending spawn gets a `Spawn` command. This creates a child neuron that will dissolve automatically in \~7 days.

**Disburse.** Neurons whose `spawn\_at\_timestamp\_seconds` has passed (the child has dissolved) receive a `Disburse` command. The ICP lands in the `icp\_neuron` canister's default ICP account.

**Cycle management (pre-split diversion).** For each account in the `cycle\_management\_account` vector (set by governance, not hardcoded):

* Query the account's ICP balance.
* If balance < `100\_000\_000\_000` e8s (1,000 ICP), call `neurons.pop()` to remove one whole disbursed neuron from the queue and transfer its full `cached\_neuron\_stake\_e8s` to that account.
* This happens before the split, so it reduces the ICP available for distribution.
* If the vector is empty, this step is skipped entirely.

**Split.** The remaining neurons are disbursed to the configured recipients using `split\_amount\_to\_each\_recipient`. The weights are on a scale of 10,000 (must sum to exactly 10,000). Maximum 5 recipients, no duplicates, no anonymous principals. Dust (rounding remainder) goes to the last recipient. The payment list is stored in `outstanding\_payments` before any transfer for idempotency — if the canister upgrades mid-transfer, it resumes from where it left off.



### 2.3 Step 2 — Distribution to stakers (`sns\_rewards`)

File: `sns\_rewards/impl/src/jobs/distribute\_rewards.rs`

**Schedule:**

* ICP, OGY, GOLDAO: every Wednesday at 14:00 UTC (`start\_job\_weekly\_at(Weekday::Wednesday, 14, ...)`).
* GLDT: first Wednesday of each month at 12:00 UTC.

**Eligibility.** Before distribution, the canister syncs neuron data from SNS governance. The `upsert\_neuron` method in `neuron\_system.rs` calls `neuron.is\_reward\_eligible()`:

* `DissolveDelaySeconds(s)` where `s >= 63,072,000` (2 years) → eligible.
* `WhenDissolvedTimestampSeconds(\_)` (dissolving) → not eligible.
* `None` → not eligible.

If a neuron loses eligibility between syncs, it is removed from `neuron\_maturity` and stops accruing.

**Maturity delta calculation.** File: `sns\_rewards/api/src/types/payment\_round.rs`, method `calculate\_neuron\_maturity\_for\_interval`:

```
delta = neuron.accumulated\_maturity - neuron.rewarded\_maturity\[token]
```

Where `accumulated\_maturity` is the total maturity SNS governance has reported for that neuron (updated each sync), and `rewarded\_maturity` tracks how much has already been distributed per token. Only positive deltas count. This is impossible to inflate externally — the source of truth is SNS governance.

**Reward formula.** Method `calculate\_neuron\_rewards` uses `BigUint` for precision:

```
scale\_factor = 100\_000\_000\_000\_000
total\_maturity = sum of all deltas
For each neuron:
  percentage = (neuron\_delta × scale\_factor) / total\_maturity
  reward = (tokens\_to\_distribute × percentage) / scale\_factor
```

Where `tokens\_to\_distribute = reward\_pool\_balance - pool\_transfer\_fee - (N × per\_neuron\_fee)`.

**Fee deductions.** One fee to transfer from the reward pool to the round pool, plus one fee per neuron with a positive delta. These are subtracted from the distributable amount before calculating shares.

**Fund flow.** Reward pool lives at subaccount `\[0u8;32]`. Each round gets its own subaccount `\[0u8;30, round\_id\_u16]`. Each neuron's reward sits at a subaccount derived from its `NeuronId` bytes. The neuron owner (or any hotkey in `neuron.permissions`) calls `claim\_reward` to transfer from the neuron's subaccount to their wallet.

**Concurrency guards.** `is\_synchronizing\_neurons` and `reward\_distribution\_in\_progress` flags prevent overlapping runs. Up to 3 retries per round; the round moves to history only when all payments complete.

**Known bug.** `next\_14\_feb\_seconds` is hardcoded to 2026 (`Date::from\_calendar\_date(2026, ...)`), which will cause an issue after February 2026.



### 2.4 Step 3 — Buyback engine (`buyback\_burn`)

File: `buyback\_burn/impl/src/jobs/swap\_tokens.rs`

Two independent timer systems:

**Constrained jobs (shared timer, \~every 4 hours + random delay):**

1. Filter jobs where `constraints` is non-empty.
2. Sort by ascending job ID (lower ID = higher priority).
3. For each job, request a quote from ICPSwap with a nominal of 1 ICP (`100\_000\_000` e8s) and check all constraints.
4. The first job whose constraints pass executes and the function returns (mutual exclusion — only one constrained job per cycle).
5. If no constrained job qualifies, fall through to `stake\_icp` (compound fallback).

**Configured constrained jobs (from governance):**

|Priority|Action|Constraint|What happens on execution|
|-|-|-|-|
|1st|Buy GOLDAO|`MinBuyRatio(500)` — at least 500 GOLDAO per ICP|Buys GOLDAO; daily burn job (12 UTC) transfers it to the GOLDAO ledger minting account (permanent destruction)|
|2nd|Buy \& stake OGY|`MinBuyRatio(1000)` — at least 1,000 OGY per ICP|Buys OGY; post-transfer action `SnsClaimOrRefresh` stakes it in the OGY SNS|
|3rd (fallback)|Compound ICP|No ratio check|Applies `Rate(2\_380\_950)` = 2.38% of ICP balance → stakes into NNS neuron `7446549063176501841` via `ClaimOrRefresh`|

The swap amount is `rate\_per\_interval.apply\_to(balance) - fee`, where `Rate` uses `SCALE = 100\_000\_000` (= 100%). The rate of 2,380,950 / 100,000,000 = 2.38% per execution is \~1/42 of the weekly balance (exponential decay, never fully drains). Slippage protection: the actual swap passes `min\_output\_amount` so the DEX rejects if the price moved unfavorably.

**Unconstrained jobs (independent timer per job):**

|Job|Constraint|Behavior|
|-|-|-|
|GLDT (ID 1, added by proposal #357)|`constraints: \[]` (empty — no price check)|Buys GLDT unconditionally. Amount = `rate\_per\_interval.apply\_to(balance)`. Only the optional `max\_amount` field could limit it (verify on-chain whether it is set or `None`).|



### 2.5 Step 4 — Claiming rewards

File: `sns\_rewards/impl/src/updates/claim\_reward.rs`

Any principal listed in `neuron.permissions` (the owner or any hotkey) can call `claim\_reward(neuron\_id, token)`. Authentication is by hotkey — the caller must be in the neuron's permission set. The grantable permissions for hotkeys in this SNS do not include `Disburse` or `ManagePrincipals`, so a hotkey can claim rewards but cannot steal the stake or lock out the owner.

Double-claim protection is implicit: the ledger is the source of truth, and once the subaccount balance is transferred, a second claim for the same round finds zero balance.



## Part 3 — How GOLDAO APP estimates rewards

### 3.1 The model

```
icp\_gross   = icp\_staked × (nns\_apy / 100)        // total annual ICP from NNS
icp\_to\_stakers = icp\_gross × 0.33                  // 33% to stakers
ogy\_annual  = ogy\_staked × (ogy\_apy / 100)         // annual OGY from ORIGYN neuron
```

**By-amount mode:**

```
share = user\_goldao / goldao\_eligible
reward\_icp = icp\_to\_stakers × share
reward\_ogy = ogy\_annual × share
```

**By-neuron mode (with voting power):**

```
estimated\_total\_vp = goldao\_eligible × 2.3          // avg VP multiplier
share = neuron.voting\_power / estimated\_total\_vp
reward\_icp = icp\_to\_stakers × share
reward\_ogy = ogy\_annual × share
```

The 2.3× average multiplier is derived from on-chain data: \~673M total voting power / \~292M eligible stake ≈ 2.3. It reflects the cohort's average dissolve delay bonus (×2, since all eligible neurons are at max delay) plus average age bonus (\~15% of the 50% max).

Weekly = annual / 52. Monthly = annual / 12.

**WTN** is treated separately as a one-time future payout (distributed when neurons dissolve), shown amortized over a year for comparison but excluded from recurring totals.

**Eligibility check** for the looked-up neuron mirrors the canister logic:

* `current\_dissolve\_delay\_seconds >= 63,072,000` (2 years) AND
* `state != "Dissolving"`

Both conditions must be true. If either fails, the neuron's reward estimate is zero.



### 3.2 Data sources

|Parameter|Source|Live?|
|-|-|-|
|`goldao\_eligible`|SNS API dissolve-delay groups ("max delay" cohort `total\_stake`)|Yes, polled every 30s|
|`price\_icp\_usd`|Binance + Coinbase average|Yes|
|`price\_ogy\_usd`|ICPSwap pool ratio × ICP price|Yes|
|`ogy\_staked`|SNS neuron controller balance|Yes|
|`wtn\_total`|SNS neuron controller WTN neurons|Yes|
|`wtn\_per\_icp`|ICPSwap WTN/ICP pool|Yes|
|`icp\_staked`|Hardcoded default (555,888 ICP)|No — will be live once NNS neurons are consolidated|
|`nns\_apy`|Hardcoded default (8.15%)|No|
|`ogy\_apy`|Hardcoded default (6%)|No|
|`neuron.voting\_power`|SNS API neuron detail endpoint|Yes (By-neuron mode only)|



### 3.3 Why the estimate is always approximate

The estimate differs from the actual reward because of variables that cannot be known in advance. These are listed below, grouped by whether they push the estimate up or down relative to reality.

**Variables that make the estimate LOWER than reality (user receives more):**

1. **Participation rate.** The model assumes all eligible voting power participates equally. In practice, many neurons don't vote on every proposal. Non-voters generate less maturity delta and receive a smaller share, which concentrates rewards among active voters. This is the single largest source of deviation — in observed data, a fully active voter received \~46% more than the model predicted, entirely explained by \~40% of eligible VP not participating that week.
2. **Age bonus above average.** A neuron with more than \~8 months of age has a VP multiplier above the cohort average of 2.3×. Its real share is higher than what the model computes using the average. (By-neuron mode partially corrects this by using the neuron's actual VP.)
3. **Shrinking eligible pool.** If neurons leave the eligible pool (dissolve, reduce delay) between the model snapshot and the actual distribution, the remaining neurons split a larger share.

**Variables that make the estimate HIGHER than reality (user receives less):**

4. **Cycle management diversion.** When the cycle account balance drops below 1,000 ICP, one whole disbursed neuron is taken before the split. The model applies 33% to the full gross ICP — it doesn't subtract this diversion. Impact: intermittent, can remove an entire neuron's worth of ICP from one distribution cycle.
5. **Age bonus below average.** A newly eligible neuron (just locked for 2 years, no age bonus) has a VP multiplier of 2.0× vs the average 2.3×. The model overestimates its share by \~13%.
6. **Transaction fees.** The canister deducts 1 pool-transfer fee + N per-neuron fees from the distributable amount. The model ignores fees. Impact: negligible (fees are \~0.0001 ICP per neuron, total <0.01% of the pool).
7. **NNS APY and staked ICP changes.** The defaults are static estimates. If the actual NNS APY is lower than 8.15%, or the effective staked ICP is less than 555,888 (e.g., after a cycle diversion depleted a neuron), the real pool is smaller.

**Variables that could go either way:**

8. **Maturity delta vs stake share.** The canister distributes by maturity delta, the model by stake (or VP in By-neuron mode). Maturity depends on staked maturity, voting, and proposal volume — none of which the model captures. Week to week, this can swing in either direction.
9. **Number and type of proposals.** More proposals in a week means more maturity generated, a larger pool, and a larger reward — but only for neurons that voted on them. Weeks with few proposals produce smaller pools.
10. **OGY neuron dynamics.** The OGY reward depends on ORIGYN's SNS neuron — its voting record, the OGY APY, and the OGY/ICP exchange rate at distribution time. The model uses a fixed 6% APY assumption.



### 3.4 Accuracy in practice

With a real-world data point (week of 2026-08-19 to 2026-08-26):

|Metric|Model estimate|Actual received|Ratio|
|-|-|-|-|
|ICP per week|1.966|2.882|0.68×|
|Primary driver of gap|—|Participation (\~40% of eligible VP did not vote)|—|

The model is designed to be a conservative lower bound for active voters. It will underestimate for voters with above-average participation and overestimate for passive holders. The gap narrows when participation is high across the cohort and widens when many neurons are idle.



### 3.5 Future improvements (planned)

1. **Live ICP pool.** Replace the static `icp\_staked × nns\_apy` with the actual ICP amount distributed by `sns\_rewards` per round (queried from the reward canister or ledger). This collapses variables 4, 6, and 7 into a single measured value.
2. **Reward Flow live data.** Connect the flow diagram to on-chain balances at each node (sns\_rewards subaccount, buyback\_burn ICP balance, cycle management account) to show real-time ICP at each stage.
3. **Historical reward tracking.** Query past payment rounds from `sns\_rewards` to show actual vs estimated over time and calibrate the average VP multiplier dynamically.

