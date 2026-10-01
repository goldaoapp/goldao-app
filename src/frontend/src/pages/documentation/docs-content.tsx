/**
 * Gold DAO knowledge hub — curated and updated from docs.gold-dao.org.
 * Pages removed on purpose: GLDT staking, Roadmap, Redeem physical gold,
 * Partner with Gold DAO, FAQ Dashboard, AMAs, Key links, Key canisters,
 * Audit reports, Master spreadsheet, Brand assets and Legal.
 */

import type React from "react";
import {
  type DocsLive,
  NNS_NEURON_ID,
  OGY_NEURON_ID,
  WTN_MAIN_NEURON_ID,
} from "./docs-data";
import {
  A,
  B,
  Callout,
  DocLink,
  Faq,
  Figure,
  H2,
  H3,
  Live,
  Mono,
  OL,
  P,
  Table,
  UL,
} from "./docs-ui";

const GB =
  "https://2669388926-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FhyYilEcr51QGR1f1ZQ8w%2Fuploads%2F";
const img = (path: string, token: string) =>
  `${GB}${path}?alt=media&token=${token}`;

const DASH = "https://dashboard.internetcomputer.org";
const GOLDAO_SNS = "tw2vt-hqaaa-aaaaq-aab6a-cai";
const GOLD_DAPP = "https://app.gldt.org/govern";
const TEAM_NEURON =
  "7eac04f2e207c04b8a7ac01b7505c715821ebbd7bc9815cef0a6842514f3b832";

const short = (id: string) => `${id.slice(0, 6)}…${id.slice(-6)}`;

export interface DocPage {
  id: string;
  title: string;
  group: string;
  /** indent in the menu (sub-page) */
  child?: boolean;
  render: (live: DocsLive) => React.ReactNode;
}

export const DOC_PAGES: DocPage[] = [
  /* ── Overview ─────────────────────────────────────────────────────────── */
  {
    id: "welcome",
    title: "Welcome to Gold DAO",
    group: "Overview",
    render: () => (
      <>
        <P>
          This is the knowledge hub of the Gold DAO: how the DAO&apos;s treasury
          works, where staker rewards come from, how GOLDAO is burned and how to
          take part in governance.
        </P>
        <H3>What you will find here</H3>
        <UL>
          <li>
            <DocLink to="owned-neurons">Owned neurons</DocLink> — the NNS, OGY
            and WTN neurons that fund all rewards.
          </li>
          <li>
            <DocLink to="burning">Burning mechanisms</DocLink> — how the buyback
            cascade and transfer fees reduce the GOLDAO supply.
          </li>
          <li>
            <DocLink to="stake">Stake GOLDAO</DocLink> and{" "}
            <DocLink to="receive-rewards">receive rewards</DocLink> —
            step-by-step guides.
          </li>
          <li>
            <DocLink to="rewards-calculation">Rewards calculation</DocLink> —
            how the weekly distribution is computed.
          </li>
          <li>
            <DocLink to="token-goldao">Tokens</DocLink> and{" "}
            <DocLink to="faq-intro">FAQs</DocLink>.
          </li>
        </UL>
        <H3>Gold DAO Chapter 2.0</H3>
        <P>
          On December 8th, 2025,{" "}
          <A href="https://nns.ic0.app/proposal/?u=tw2vt-hqaaa-aaaaq-aab6a-cai&proposal=317">
            a proposal
          </A>{" "}
          initiated <B>Gold DAO Chapter 2.0</B>. It describes the steps forward,
          and{" "}
          <A href="https://fjdhj-uyaaa-aaaai-q4fma-cai.icp0.io/GoldDAO_Chapter2.0.pdf">
            this pdf
          </A>{" "}
          explains the background and motivation.
        </P>
        <P>
          Technical visitors can explore the canisters on{" "}
          <A href="https://github.com/GoldDAO/gold-dao">GitHub</A>.
        </P>
      </>
    ),
  },

  /* ── Resources ────────────────────────────────────────────────────────── */
  {
    id: "owned-neurons",
    title: "Gold DAO - Owned Neurons",
    group: "Resources",
    render: (live) => (
      <>
        <P>
          The Gold DAO owns neurons on ICP governance (NNS), ORIGYN governance
          (OGY) and WaterNeuron governance (WTN). Their rewards fund everything
          GOLDAO stakers receive.
        </P>
        <Table
          head={["Neuron", "Network", "Staked", "Rewards go to"]}
          rows={[
            [
              <DocLink key="n" to="nns-neuron">
                NNS neuron
              </DocLink>,
              "ICP",
              <Live key="v" value={live.nnsStaked} unit="ICP" />,
              "Split 33 / 33 / 33 / 1",
            ],
            [
              <DocLink key="n" to="ogy-neuron">
                OGY neuron
              </DocLink>,
              "ORIGYN",
              <Live
                key="v"
                value={live.ogy ? live.ogy.stake : live.ogy}
                unit="OGY"
              />,
              "GOLDAO stakers (weekly)",
            ],
            [
              <DocLink key="n" to="wtn-neuron">
                WTN neurons
              </DocLink>,
              "WaterNeuron",
              <Live
                key="v"
                value={
                  live.wtn
                    ? live.wtn.reduce((s, n) => s + n.stake + n.maturity, 0)
                    : live.wtn
                }
                unit="WTN"
              />,
              "GOLDAO stakers",
            ],
          ]}
        />
        <P>
          Live balances and where the ICP sits right now are in{" "}
          <B>Rewards → Reward Flow</B>.
        </P>
      </>
    ),
  },
  {
    id: "nns-neuron",
    title: "NNS neuron",
    group: "Resources",
    child: true,
    render: (live) => (
      <>
        <P>
          The Gold DAO stakes its ICP in a <B>single NNS neuron</B>, locked for
          8 years and controlled by the{" "}
          <A href={`${DASH}/canister/j4jiq-sqaaa-aaaap-ab23a-cai`}>
            icp_neuron canister
          </A>
          . Its details can be read with the <Mono>list_neurons()</Mono> method
          of that canister.
        </P>
        <Table
          rows={[
            [
              "Neuron ID",
              <A key="a" href={`${DASH}/neuron/${NNS_NEURON_ID}`}>
                {NNS_NEURON_ID}
              </A>,
            ],
            ["Dissolve delay", "8 years"],
            ["Staked", <Live key="s" value={live.nnsStaked} unit="ICP" />],
            [
              "Current maturity",
              <Live key="m" value={live.nnsMaturity} unit="ICP" digits={2} />,
            ],
          ]}
        />
        <H3>From maturity to rewards</H3>
        <OL>
          <li>
            When the neuron&apos;s maturity passes <B>1,000 ICP</B>, it is
            spawned into a new neuron.
          </li>
          <li>
            The spawned neuron dissolves in about 7 days and is disbursed.
          </li>
          <li>
            Before the split, a cycle check runs: if the cycle management
            account holds less than 1,000 ICP, one whole disbursed neuron is
            sent there to keep the canisters funded.
          </li>
          <li>The rest is split between the recipients below.</li>
        </OL>
        <Table
          head={["Recipient", "Account", "Share"]}
          rows={[
            [
              "Staker rewards (sns_rewards)",
              <A
                key="a"
                href={`${DASH}/account/6dc2515bbb9b0a97b8d977ebac3eba643a1fb4b6da8b33455e0dba957f0ce7da`}
              >
                {short(
                  "6dc2515bbb9b0a97b8d977ebac3eba643a1fb4b6da8b33455e0dba957f0ce7da",
                )}
              </A>,
              "33%",
            ],
            [
              "Buyback cascade (buyback_burn)",
              <A
                key="a"
                href={`${DASH}/account/31836130dcff35502d04752ea5b82a24e44d41955f2a30bb8c2d284f4a318d82`}
              >
                {short(
                  "31836130dcff35502d04752ea5b82a24e44d41955f2a30bb8c2d284f4a318d82",
                )}
              </A>,
              "33%",
            ],
            [
              "GLDT purchases for stakers",
              <A
                key="a"
                href={`${DASH}/account/4fe98a124c29830fc6aca41f07326d0a917888478d4d22f1f30ed4612fc067dd`}
              >
                {short(
                  "4fe98a124c29830fc6aca41f07326d0a917888478d4d22f1f30ed4612fc067dd",
                )}
              </A>,
              "33%",
            ],
            [
              "The Good DAO (external)",
              <Mono key="m">w4buy-lgwzr-…-vdu3o-2qe</Mono>,
              "1%",
            ],
          ]}
        />
        <Callout>
          Spawns happen roughly every 8–10 days, while rewards are paid weekly.
          Some weeks therefore have no ICP to distribute and the next paid round
          includes the missed weeks.
        </Callout>
      </>
    ),
  },
  {
    id: "ogy-neuron",
    title: "OGY neuron",
    group: "Resources",
    child: true,
    render: (live) => (
      <>
        <P>
          The ORIGYN Foundation donated a 500 million OGY neuron to the Gold
          DAO. It is controlled by the DAO and its rewards are distributed to
          active GOLDAO stakers. Details can be read with{" "}
          <Mono>list_neurons()</Mono> on the{" "}
          <A href={`${DASH}/canister/54vkq-taaaa-aaaap-ahqra-cai`}>
            sns_neuron_controller canister
          </A>
          .
        </P>
        <Table
          rows={[
            [
              "Neuron ID",
              <A
                key="a"
                href={`${DASH}/sns/leu43-oiaaa-aaaaq-aadgq-cai/neuron/${OGY_NEURON_ID}`}
              >
                {OGY_NEURON_ID}
              </A>,
            ],
            [
              "Dissolve delay",
              live.ogy
                ? `${live.ogy.dissolveDelayYears.toFixed(0)} years`
                : "5 years",
            ],
            [
              "Staked",
              <Live
                key="s"
                value={live.ogy ? live.ogy.stake : live.ogy}
                unit="OGY"
              />,
            ],
            ["Auto-stake maturity", "Yes"],
            [
              "Owner",
              <span key="o">
                Gold DAO via sns_neuron_controller (
                <Mono>54vkq-taaaa-aaaap-ahqra-cai</Mono>)
              </span>,
            ],
          ]}
        />
        <H3>How OGY reaches stakers</H3>
        <UL>
          <li>
            Every Wednesday the controller claims the neuron&apos;s OGY rewards
            and sends them to the{" "}
            <A
              href={`${DASH}/sns/leu43-oiaaa-aaaaq-aadgq-cai/account/iyehc-lqaaa-aaaap-ab25a-cai`}
            >
              sns_rewards pool
            </A>
            , which pays them out the same day at 14:00 UTC.
          </li>
          <li>
            This payment also includes the <B>ORIGYN – Gold DAO partnership</B>:
            ORIGYN&apos;s 100M staked GOLDAO earns rewards that are converted to
            OGY and paid to 5-year OGY stakers, so the DAO&apos;s neuron
            receives a share of them.
          </li>
          <li>
            When the buyback cascade runs in &quot;Buy &amp; stake OGY&quot;
            mode, the OGY bought is added to this neuron.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "wtn-neuron",
    title: "WTN neurons",
    group: "Resources",
    child: true,
    render: (live) => {
      const total = live.wtn
        ? live.wtn.reduce((s, n) => s + n.stake + n.maturity, 0)
        : live.wtn;
      const main = live.wtn?.find((n) => n.id === WTN_MAIN_NEURON_ID);
      const dissolving = live.wtn?.filter((n) => n.dissolving) ?? [];
      return (
        <>
          <P>
            In June 2024 the Gold DAO invested 17,500 ICP in the first SNS sale
            of <A href="https://waterneuron.fi/">WaterNeuron</A>. The WTN
            received are staked in neurons that take part in WaterNeuron
            governance.
          </P>
          <Table
            rows={[
              [
                "Main neuron",
                <A
                  key="a"
                  href={`${DASH}/sns/jmod6-4iaaa-aaaaq-aadkq-cai/neuron/${WTN_MAIN_NEURON_ID}`}
                >
                  {WTN_MAIN_NEURON_ID}
                </A>,
              ],
              [
                "Dissolve delay",
                main
                  ? `${main.dissolveDelayYears.toFixed(0)} years · not dissolving`
                  : "3 years · not dissolving",
              ],
              [
                "Staked (main)",
                <Live
                  key="s"
                  value={
                    main
                      ? main.stake
                      : live.wtn === undefined
                        ? undefined
                        : null
                  }
                  unit="WTN"
                />,
              ],
              [
                "Total WTN (stake + maturity, all neurons)",
                <Live key="t" value={total} unit="WTN" />,
              ],
            ]}
          />
          <H3>Consolidation into one neuron</H3>
          <P>
            The DAO&apos;s other WTN neurons are dissolving. Once dissolved,
            their WTN will be added to the main neuron, so all the WTN —{" "}
            <B>
              <Live value={total} unit="WTN" />
            </B>{" "}
            in total — ends up in a single neuron.
          </P>
          {dissolving.length > 0 && (
            <Table
              head={["Dissolving neuron", "Staked", "Fully dissolved"]}
              rows={dissolving.map((n) => [
                <A
                  key="a"
                  href={`${DASH}/sns/jmod6-4iaaa-aaaaq-aadkq-cai/neuron/${n.id}`}
                >
                  {short(n.id)}
                </A>,
                <Live key="s" value={n.stake} unit="WTN" />,
                n.dissolvedAt
                  ? new Date(n.dissolvedAt * 1000).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—",
              ])}
            />
          )}
          <H3>Rewards</H3>
          <P>
            The WTN stake earns ICP (WaterNeuron shares ICP with all WTN
            neurons) and a small amount of WTN. Both go to active GOLDAO
            stakers; ICP is the larger part, WTN is paid out only occasionally
            because it accumulates slowly. WaterNeuron&apos;s{" "}
            <A href="https://wtn.ic.app/">neuron viewer</A> shows WTN neurons
            and their rewards.
          </P>
        </>
      );
    },
  },
  {
    id: "burning",
    title: "Burning mechanisms",
    group: "Resources",
    render: () => (
      <>
        <P>
          Scarcity is a key driver of demand. GOLDAO supply only goes down: the
          live total burned is on the Home page.
        </P>
        <H3>1 · Buyback cascade</H3>
        <P>
          33% of every disbursed NNS neuron goes to the{" "}
          <A href={`${DASH}/canister/atslz-hiaaa-aaaam-acq6q-cai`}>
            buyback_burn canister
          </A>
          . About every 4 hours (plus a random delay) it asks ICPSwap how much 1
          ICP buys and runs the <B>first</B> rule that passes:
        </P>
        <Table
          head={["Priority", "Action", "Runs when"]}
          rows={[
            ["1", "Buy GOLDAO and burn it", "≥ 500 GOLDAO per ICP"],
            [
              "2",
              "Buy OGY and stake it in the DAO's OGY neuron",
              "≥ 1,000 OGY per ICP",
            ],
            [
              "3",
              "Compound ICP into the NNS neuron",
              "Fallback when neither applies",
            ],
          ]}
        />
        <UL>
          <li>
            Each run uses <B>2.38%</B> of the canister&apos;s{" "}
            <A
              href={`${DASH}/account/31836130dcff35502d04752ea5b82a24e44d41955f2a30bb8c2d284f4a318d82`}
            >
              ICP balance
            </A>
            , so the balance is spent gradually and never drained, keeping
            slippage low.
          </li>
          <li>
            Swaps carry a minimum output, so the DEX rejects a trade if the
            price moves too much.
          </li>
          <li>
            Every day at 12:00 UTC the GOLDAO bought is sent to the GOLDAO
            minting account, which destroys it permanently.
          </li>
        </UL>
        <H3>2 · Transfer fees</H3>
        <P>
          Every GOLDAO transfer pays a 10 GOLDAO fee that is burned, so activity
          on the token also reduces supply.
        </P>
        <Callout>
          The Events page shows each buyback run, which rule was active and the
          daily burn results.
        </Callout>
      </>
    ),
  },

  /* ── How to ───────────────────────────────────────────────────────────── */
  {
    id: "stake",
    title: "Stake GOLDAO Tokens",
    group: "How to",
    render: () => (
      <>
        <P>
          Staking GOLDAO in a neuron lets you vote on Gold DAO proposals and
          earn rewards. There are two steps.
        </P>
        <H2>1. Obtain GOLDAO</H2>
        <P>
          GOLDAO trades against ICP on{" "}
          <A href="https://app.icpswap.com/swap?input=ryjl3-tyaaa-aaaaa-aaaba-cai&output=tyyy3-4aaaa-aaaaq-aab7a-cai">
            ICPSwap
          </A>
          .
        </P>
        <Callout>
          You need at least 100 GOLDAO to create a neuron. Buy a little more to
          cover transfer fees.
        </Callout>
        <H2>2. Stake GOLDAO</H2>
        <P>
          The easiest way is the <A href="https://nns.ic0.app/">NNS dApp</A>,
          using your Internet Identity.
        </P>
        <OL>
          <li>Log in to the NNS dApp with your Internet Identity.</li>
          <li>
            Send your GOLDAO to your NNS dApp principal: go to{" "}
            <B>Tokens → Gold DAO</B>, copy your Principal ID (top right) and
            send the GOLDAO there from the DEX.
            <Figure
              src={img(
                "PivSJ74GMVnihWhFGSdU%2Fimage.png",
                "25d323c1-6192-47d5-931e-0ed9ee199608",
              )}
              alt="Copy your principal in the NNS dApp"
            />
          </li>
          <li>
            Go to <B>Neuron Staking</B> and click <B>Stake GOLDAO</B>. Enter the
            amount and confirm.
            <Figure
              src={img(
                "9hWvBTSHwNnXSpaBQ2EJ%2Fimage.png",
                "ffd4b421-f1d2-4a54-bb34-65abc5846d79",
              )}
              alt="Stake GOLDAO in the NNS dApp"
            />
          </li>
          <li>
            Open the new neuron to manage it.
            <Figure
              src={img(
                "2QYUd6Y901MHWXPntyh4%2Fimage.png",
                "7d408a55-e35c-48a9-ac0b-a00d05735cbb",
              )}
              alt="Neuron settings in the NNS dApp"
            />
            Set the <B>dissolve delay</B> and the <B>voting delegation</B>{" "}
            (follow a neuron if you won&apos;t vote yourself). The main
            contributing team neuron is{" "}
            <A href={`${DASH}/sns/${GOLDAO_SNS}/neuron/${TEAM_NEURON}`}>
              {short(TEAM_NEURON)}
            </A>
            .
          </li>
        </OL>
        <Callout tone="warn">
          To receive staker rewards the neuron must have the{" "}
          <B>maximum dissolve delay of 2 years</B>, must{" "}
          <B>not be dissolving</B> and must <B>vote</B> (directly or by
          following). A shorter delay lets you vote but earns no rewards.
        </Callout>
        <P>
          To claim rewards in the Gold DAO dApp, continue with{" "}
          <DocLink to="configure-neurons">Configure neurons</DocLink>.
        </P>
      </>
    ),
  },
  {
    id: "receive-rewards",
    title: "Receive rewards",
    group: "How to",
    render: () => (
      <>
        <P>
          Every eligible Gold DAO neuron that votes accumulates maturity. The
          rewards canister measures that maturity and assigns each neuron its
          share of the rewards.
        </P>
        <Table
          head={["Token", "Source", "Paid"]}
          rows={[
            [
              "ICP",
              "NNS neuron (33% of each disbursal)",
              "Wednesdays 14:00 UTC, when ICP arrived",
            ],
            ["OGY", "OGY neuron + ORIGYN partnership", "Wednesdays 14:00 UTC"],
            [
              "GLDT",
              "GLDT bought with 33% of each disbursal",
              "First Wednesday of the month, 12:00 UTC",
            ],
            ["WTN", "WTN neurons", "Occasionally, when enough has accumulated"],
          ]}
        />
        <P>
          Rewards are managed in the <A href={GOLD_DAPP}>Gold DAO dApp</A>.
          First{" "}
          <DocLink to="configure-neurons">
            add your neurons with a hotkey
          </DocLink>
          , then <DocLink to="claim-rewards">claim</DocLink>. How the amounts
          are computed is explained in{" "}
          <DocLink to="rewards-calculation">Rewards calculation</DocLink>.
        </P>
      </>
    ),
  },
  {
    id: "configure-neurons",
    title: "Configure neurons",
    group: "How to",
    child: true,
    render: () => (
      <>
        <P>
          To manage your neurons in the Gold DAO dApp, add the dApp principal as
          a <B>hotkey</B> on each neuron. This proves you own them.
        </P>
        <Callout tone="warn">
          Logging in to the Gold DAO dApp with the same Internet Identity as the
          NNS dApp gives you a <B>different principal</B>. That is how Internet
          Identity works, and why neurons are connected with hotkeys.
        </Callout>
        <H2>Add neuron hotkeys</H2>
        <OL>
          <li>
            Log in to the <A href={GOLD_DAPP}>Gold DAO dApp</A>.
            <Figure
              src={img(
                "aTYPW3elfQZDYVSu90rL%2FScreenshot%202025-07-03%20at%2010.31.04.png",
                "2d0212fb-502b-49d9-9c37-fc1a25a02dc7",
              )}
              alt="Gold DAO dApp login"
            />
          </li>
          <li>
            Open the rewards page.
            <Figure
              src={img(
                "hpPuTAcOaQEUmCecO9cC%2Fimage.png",
                "694852eb-1d9c-494a-a280-31ce041340ee",
              )}
              alt="Rewards page"
            />
          </li>
          <li>
            Click <B>+</B> to add a neuron.
            <Figure
              src={img(
                "CATPWY7JKyHPfTDqz3CH%2Fimage.png",
                "3da21e77-5003-4884-906b-352ff9018ff8",
              )}
              alt="Add a neuron"
            />
          </li>
          <li>
            Copy the principal shown in the modal.
            <Figure
              src={img(
                "vMwd8zvLxAp15NAtAWVx%2Fimage.png",
                "f0b9bf2d-0b7d-49aa-936d-7ee687e73d7a",
              )}
              alt="Copy your dApp principal"
            />
          </li>
          <li>
            In a new window, log in to the{" "}
            <A href="https://nns.ic0.app/">NNS dApp</A>, open{" "}
            <B>Neuron Staking</B>, select the neuron, scroll to hotkeys, click{" "}
            <B>Add Hotkey</B> and paste the principal.
            <Figure
              src={img(
                "LnCrVlkyeRcTmsCguAWB%2Fimage.png",
                "ecf1ef12-f946-465e-bb8a-cce66d5f9f26",
              )}
              alt="Add a hotkey in the NNS dApp"
            />
          </li>
          <li>
            Back in the Gold DAO dApp, refresh: the neuron appears in your list.
            <Figure
              src={img(
                "iSvLquUgFGJz8J44VdcQ%2Fimage.png",
                "307481ae-ba4a-435c-9cdc-f7e223142111",
              )}
              alt="Neuron listed in the dApp"
            />
          </li>
        </OL>
        <H2>Add followees</H2>
        <P>
          Your neuron must vote to earn rewards. Vote yourself or follow another
          neuron on every topic.
        </P>
        <Figure
          src={img(
            "3N7StruuYYvsm4bUOB1d%2Fimage.png",
            "cb0314dd-d094-4cd2-9aa5-d01c77797516",
          )}
          alt="Following settings"
        />
        <P>
          To follow the Gold DAO developer team, follow{" "}
          <A href={`${DASH}/sns/${GOLDAO_SNS}/neuron/${TEAM_NEURON}`}>
            {short(TEAM_NEURON)}
          </A>
          .
        </P>
      </>
    ),
  },
  {
    id: "claim-rewards",
    title: "Claim rewards",
    group: "How to",
    child: true,
    render: () => (
      <>
        <P>
          Available rewards appear in your neurons table in the{" "}
          <A href={GOLD_DAPP}>Gold DAO dApp</A>. Click <B>Claim rewards</B> on a
          token to claim it for one neuron, or use the top <B>Claim rewards</B>{" "}
          button to claim everything.
        </P>
        <P>
          The tokens reach your balance after a few seconds; refresh if they
          don&apos;t show up yet.
        </P>
      </>
    ),
  },
  {
    id: "rewards-calculation",
    title: "Rewards calculation",
    group: "How to",
    child: true,
    render: () => (
      <>
        <P>
          Rewards are computed by the <Mono>sns_rewards</Mono> canister (
          <A href={`${DASH}/canister/iyehc-lqaaa-aaaap-ab25a-cai`}>
            iyehc-lqaaa-aaaap-ab25a-cai
          </A>
          ). Each token has its own source, but every token is shared with the
          same rule.
        </P>
        <H2>Who is eligible</H2>
        <UL>
          <li>
            Dissolve delay of <B>2 years</B> (the maximum) and{" "}
            <B>not dissolving</B>. A neuron that stops meeting this is removed
            and stops accruing.
          </li>
          <li>
            The neuron must <B>vote</B> (directly or by following): voting is
            what generates maturity.
          </li>
        </UL>
        <H2>How your share is computed</H2>
        <OL>
          <li>
            Every day at 09:00 UTC the canister reads each neuron&apos;s
            maturity from SNS governance and adds any increase to an
            ever-growing &quot;accumulated maturity&quot;. Claiming or
            disbursing maturity doesn&apos;t reset it.
          </li>
          <li>
            On distribution day, each neuron&apos;s <B>maturity delta</B> is its
            accumulated maturity minus what was already rewarded for that token.
          </li>
          <li>
            Your share = your delta ÷ the sum of all deltas. The pool (minus
            transfer fees) is split by that share.
          </li>
        </OL>
        <P>
          Your share changes every round, because it depends on how much
          maturity your neuron and all other neurons generated since the last
          payment.
        </P>
        <H2>Sources and schedule</H2>
        <Table
          head={["Token", "Source", "Schedule"]}
          rows={[
            [
              "ICP",
              <span key="s">
                33% of each <DocLink to="nns-neuron">NNS neuron</DocLink>{" "}
                disbursal
              </span>,
              "Wednesdays 14:00 UTC",
            ],
            [
              "OGY",
              <span key="s">
                <DocLink to="ogy-neuron">OGY neuron</DocLink> rewards, including
                the ORIGYN partnership
              </span>,
              "Wednesdays 14:00 UTC",
            ],
            [
              "WTN",
              <span key="s">
                <DocLink to="wtn-neuron">WTN neurons</DocLink>
              </span>,
              "Wednesdays, when the pool has WTN",
            ],
            [
              "GLDT",
              "GLDT bought with 33% of each NNS disbursal",
              "First Wednesday of the month, 12:00 UTC",
            ],
          ]}
        />
        <H2>Weeks without a token</H2>
        <P>
          Each token is distributed independently. If a pool is empty (for
          example, no NNS spawn was disbursed that week), that token is skipped
          and the others are still paid. Unrewarded maturity is not lost: the
          next successful round for that token covers all the missed weeks.
        </P>
        <H2>Where your rewards wait</H2>
        <P>
          Rewards for each neuron are held in a subaccount of the{" "}
          <Mono>sns_rewards</Mono> canister named after the neuron ID, until you{" "}
          <DocLink to="claim-rewards">claim them</DocLink>.
        </P>
        <Callout>
          The Rewards simulator estimates your weekly average, and the Events
          page shows what was paid in each recent round.
        </Callout>
      </>
    ),
  },

  /* ── Tokens ───────────────────────────────────────────────────────────── */
  {
    id: "token-goldao",
    title: "GOLDAO",
    group: "Tokens",
    render: () => (
      <>
        <div className="flex items-center gap-3">
          <img
            src="/logos/goldao.png"
            alt="GOLDAO"
            className="size-14 rounded-full"
          />
          <P>
            The governance token of the Gold DAO. Staked GOLDAO gives voting
            power and earns the DAO&apos;s rewards.
          </P>
        </div>
        <Table
          rows={[
            ["Ledger", <Mono key="m">tyyy3-4aaaa-aaaaq-aab7q-cai</Mono>],
            ["Transfer fee", "10 GOLDAO (burned)"],
            [
              "Trade",
              <A
                key="a"
                href="https://app.icpswap.com/swap?input=ryjl3-tyaaa-aaaaa-aaaba-cai&output=tyyy3-4aaaa-aaaaq-aab7a-cai"
              >
                ICPSwap (GOLDAO/ICP)
              </A>,
            ],
          ]}
        />
      </>
    ),
  },
  {
    id: "token-gld-nft",
    title: "GLD NFT",
    group: "Tokens",
    render: () => (
      <>
        <P>
          GLD NFTs are digital certificates of ownership of specific physical
          gold bars, issued with the ORIGYN protocol.
        </P>
        <P>
          Trade them on <A href="https://gold.bity.com/en">Bity</A>.
        </P>
      </>
    ),
  },
  {
    id: "token-gldt",
    title: "GLDT",
    group: "Tokens",
    render: () => (
      <>
        <P>
          GLDT is the fungible gold token (100 GLDT = 1 g of gold). It has been{" "}
          <B>merged into ORIGYN</B>; see{" "}
          <A href="https://nns.ic0.app/proposal/?u=tw2vt-hqaaa-aaaaq-aab6a-cai&proposal=317">
            the proposal
          </A>
          . GOLDAO stakers receive GLDT monthly as part of their rewards.
        </P>
        <H3>Trade GLDT</H3>
        <UL>
          <li>
            <A href="https://app.icpswap.com/swap?input=6c7su-kiaaa-aaaar-qaira-cai&output=cngnf-vqaaa-aaaar-qag4q-cai">
              ICPSwap · GLDT/USDT
            </A>
          </li>
          <li>
            <A href="https://app.icpswap.com/swap?input=6c7su-kiaaa-aaaar-qaira-cai&output=ryjl3-tyaaa-aaaaa-aaaba-cai">
              ICPSwap · GLDT/ICP
            </A>
          </li>
        </UL>
      </>
    ),
  },

  /* ── FAQs ─────────────────────────────────────────────────────────────── */
  {
    id: "faq-intro",
    title: "Introduction to the Gold DAO",
    group: "FAQs",
    render: () => (
      <>
        <Faq q="What is Gold DAO?">
          <P>
            A decentralized autonomous organization that brings gold liquidity
            on-chain: trading gold without banks or intermediaries, as easily as
            trading any token.
          </P>
        </Faq>
        <Faq q="What blockchain does Gold DAO use?">
          <P>
            The <A href="https://internetcomputer.org">Internet Computer</A>{" "}
            (ICP), which runs smart contracts with large storage and compute at
            low cost. Gold DAO works closely with{" "}
            <A href="https://www.origyn.com">ORIGYN</A>, the protocol used to
            issue the GLD NFTs.
          </P>
        </Faq>
        <Faq q="How does governance work?">
          <P>
            Gold DAO is an SNS on the <A href="https://nns.ic0.app">NNS dApp</A>
            . GOLDAO holders stake their tokens in neurons to get voting power;
            decisions on funds and the project are made by vote, and active
            voters are rewarded.
          </P>
        </Faq>
        <Faq q="What are GOLDAO tokens?">
          <P>
            The governance tokens of Gold DAO. Stakers vote on the
            project&apos;s direction and receive rewards in ICP, OGY, GLDT and
            WTN from the DAO&apos;s neurons.
          </P>
        </Faq>
        <Faq q="What makes Gold DAO different?">
          <P>
            The ORIGYN protocol, the partnership with Metalor for the gold, and
            fully decentralized governance: blockchain transparency combined
            with certified real-world gold.
          </P>
        </Faq>
        <Faq q="What is planned next?">
          <P>
            The roadmap of Chapter 2.0 is described in{" "}
            <A href="https://nns.ic0.app/proposal/?u=tw2vt-hqaaa-aaaaq-aab6a-cai&proposal=317">
              proposal 317
            </A>{" "}
            and{" "}
            <A href="https://fjdhj-uyaaa-aaaai-q4fma-cai.icp0.io/GoldDAO_Chapter2.0.pdf">
              this pdf
            </A>
            .
          </P>
        </Faq>
      </>
    ),
  },
  {
    id: "faq-tokens",
    title: "Gold DAO - Ecosystem Tokens",
    group: "FAQs",
    render: () => (
      <>
        <Faq q="GOLDAO">
          <P>
            Governance token of the Gold DAO. Holders vote on development,
            protocol changes and treasury decisions, keeping the project
            community-driven.
          </P>
        </Faq>
        <Faq q="GLD NFT">
          <P>
            Digital certificates of ownership of specific physical gold bars,
            issued with the ORIGYN protocol on ICP. Holders own real gold with
            the flexibility of blockchain, and can trade them on compliant
            platforms.
          </P>
        </Faq>
        <Faq q="GLDT">
          <P>
            The fungible gold token (100 GLDT = 1 g of gold), now merged into
            ORIGYN. GOLDAO stakers receive GLDT monthly.
          </P>
        </Faq>
        <Faq q="USDG (planned)">
          <P>A stablecoin backed by physical gold.</P>
        </Faq>
        <Faq q="OGY (ORIGYN)">
          <P>
            The token of the ORIGYN protocol, used to certify and represent
            physical gold digitally. The Gold DAO holds a large staked OGY
            neuron whose rewards go to GOLDAO stakers.
          </P>
        </Faq>
        <Faq q="ICP (Internet Computer)">
          <P>
            The utility and governance token of the Internet Computer. Staked in
            NNS neurons it earns rewards and voting power. The Gold DAO stakes
            ICP in its <DocLink to="nns-neuron">NNS neuron</DocLink>, and part
            of the rewards goes to GOLDAO stakers through the{" "}
            <Mono>sns_rewards</Mono> canister.
          </P>
        </Faq>
      </>
    ),
  },
];

export const DOC_GROUPS = ["Overview", "Resources", "How to", "Tokens", "FAQs"];
