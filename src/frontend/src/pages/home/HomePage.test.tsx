import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import type { LiveData } from "@/lib/use-live-data";
import HomePage from "./HomePage";

// HomePage renders live market data fetched by useLiveData. Mock the hook so
// the component can be rendered deterministically without network calls.
const mockUseLiveData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/use-live-data", () => ({
  useLiveData: mockUseLiveData,
}));

const emptyLiveData: LiveData = {
  params: {},
  flash: new Set<string>(),
  extra: {
    members: null,
    proposalsActive: null,
    proposalsTotal: null,
    wtnTotal: null,
    wtnIcp: null,
    supply: null,
    totalBurned: null,
  },
};

describe("HomePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockUseLiveData.mockReturnValue(emptyLiveData);
  });

  it("renders the banner label as BETA VERSION", () => {
    render(<HomePage />);
    expect(
      screen.getByText(/BETA VERSION — Data is under active development/i),
    ).toBeInTheDocument();
  });

  it("does not render the old ALPHA VERSION label", () => {
    render(<HomePage />);
    expect(screen.queryByText(/ALPHA VERSION/i)).not.toBeInTheDocument();
  });

  it("keeps the hero content unchanged", () => {
    render(<HomePage />);
    expect(screen.getByText("GOLDAO APP")).toBeInTheDocument();
    expect(
      screen.getByText("Your DAO. Your treasury. Real-time."),
    ).toBeInTheDocument();
    expect(screen.getByText("100% On-Chain")).toBeInTheDocument();
  });

  it("keeps the token stat sections unchanged", () => {
    render(<HomePage />);
    expect(screen.getByText("GOLDAO Token")).toBeInTheDocument();
    expect(screen.getByText("ICP / GOLDAO Ratio")).toBeInTheDocument();
    expect(screen.getByText("Treasury Overview")).toBeInTheDocument();
    expect(screen.getByText("Active / Total Proposals")).toBeInTheDocument();
  });
});
