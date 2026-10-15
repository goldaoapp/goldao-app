import { Principal } from "@icp-sdk/core/principal";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { TransferLogPanel } from "./TransferLogPanel";

// The real module pulls in the storage client, which the test environment cannot load.
const TransferKind = vi.hoisted(() => ({
  loaded: "loaded",
  loadUnanswered: "loadUnanswered",
  loadForgotten: "loadForgotten",
  withdrawn: "withdrawn",
  withdrawUnanswered: "withdrawUnanswered",
  withdrawSettled: "withdrawSettled",
  withdrawRefunded: "withdrawRefunded",
}));
vi.mock("@/backend", () => ({ TransferKind }));
const mockLog = vi.hoisted(() => vi.fn());
const mockInfo = vi.hoisted(() => vi.fn());
vi.mock("./useGame", () => ({
  useTransferLog: mockLog,
  usePlayerInfo: mockInfo,
}));

const PLAYER = Principal.fromText("2vxsx-fae");
const E8S = 100_000_000n;

const entries = [
  {
    id: 2n,
    at: 1_700_000_000_000_000_000n,
    kind: TransferKind.withdrawUnanswered,
    player: PLAYER,
    amount: 990n * E8S,
    txId: undefined,
  },
  {
    id: 1n,
    at: 1_699_999_000_000_000_000n,
    kind: TransferKind.loaded,
    player: PLAYER,
    amount: 1000n * E8S,
    txId: 42n,
  },
];

describe("TransferLogPanel", () => {
  beforeEach(() => {
    mockLog.mockReturnValue({ data: entries, isError: false });
    mockInfo.mockReturnValue({ data: undefined, isError: false });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists the lines with their event, amount and ledger transaction", () => {
    render(<TransferLogPanel />);
    expect(screen.getByText("Load credited")).toBeInTheDocument();
    expect(screen.getByText("Withdrawal, no answer")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "#42" });
    expect(link.getAttribute("href")).toMatch(/\/transaction\/42$/);
    expect(screen.getByText("No transaction id")).toBeInTheDocument();
  });

  it("shows an empty message when there are no lines", () => {
    mockLog.mockReturnValue({ data: [], isError: false });
    render(<TransferLogPanel />);
    expect(screen.getByText("No lines yet.")).toBeInTheDocument();
  });

  it("refuses an invalid principal and does not look it up", () => {
    render(<TransferLogPanel />);
    fireEvent.change(screen.getByPlaceholderText("Player principal"), {
      target: { value: "not a principal" },
    });
    expect(screen.getByText("Not a valid principal.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Look up" })).toBeDisabled();
  });

  it("looks up a player and shows what the game holds for them", () => {
    mockInfo.mockReturnValue({
      data: {
        credit: 1000n * E8S,
        stake: 5n * E8S,
        held: 0n,
        pendingLoad: 0n,
        pendingWithdrawal: 0n,
        entries: [entries[1]],
      },
      isError: false,
    });
    render(<TransferLogPanel />);
    fireEvent.change(screen.getByPlaceholderText("Player principal"), {
      target: { value: PLAYER.toText() },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("Stake in play")).toBeInTheDocument();
    expect(screen.queryByText("Withdrawal, no answer")).toBeNull();
    expect(screen.getByText("Load credited")).toBeInTheDocument();
  });

  it("tells the admin when the log cannot be read", () => {
    mockLog.mockReturnValue({ data: undefined, isError: true });
    render(<TransferLogPanel />);
    expect(screen.getByText(/Could not read the log/)).toBeInTheDocument();
  });
});
