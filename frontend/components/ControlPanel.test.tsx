import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMS, type OptimizeParams, type RoutingConfig, type Workload } from "@/lib/api";
import { ControlPanel } from "./ControlPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/MapView", () => ({ default: () => null }));

const { mockDispatch } = vi.hoisted(() => ({
  mockDispatch: {
    workload: null as Workload | null,
    workloadError: null as string | null,
    params: null as unknown as OptimizeParams,
    setParams: vi.fn(),
    routing: { provider: "haversine" } as RoutingConfig,
    setRouting: vi.fn(),
    result: null,
    loading: false,
    error: null,
    runOptimize: vi.fn(),
  },
}));

vi.mock("@/app/providers", () => ({
  useDispatch: () => mockDispatch,
}));

function makeWorkload(techs: number, jobs: number, skills: number): Workload {
  return {
    technicians: Array.from({ length: techs }, (_, i) => ({
      id: i + 1,
      name: `T${i + 1}`,
      home_x: 0,
      home_y: 0,
      shift_start: 0,
      shift_end: 480,
      overtime_eligible: true,
      skills: ["electrical"],
    })),
    jobs: Array.from({ length: jobs }, (_, i) => ({
      id: i + 1,
      site_id: 1,
      site_name: "Site",
      x: 0,
      y: 0,
      required_skill: "electrical",
      priority: 3,
      sla_deadline: 480,
      duration: 30,
      requires_part: false,
      part_available: true,
      is_emergency: false,
    })),
    skills: Array.from({ length: skills }, (_, i) => ({ id: i + 1, name: `skill-${i + 1}` })),
    sites: [],
    region: {
      name: "DFW",
      center: [0, 0],
      lon_min: 0,
      lon_max: 1,
      lat_min: 0,
      lat_max: 1,
    },
  };
}

function controlRow(label: string) {
  const labelEl = screen.getByText(label, { selector: "span" });
  const row = labelEl.parentElement?.parentElement;
  if (!row) throw new Error(`No row for ${label}`);
  return row;
}

function rowValue(label: string) {
  const valueEl = screen.getByText(label, { selector: "span" }).nextElementSibling;
  if (!valueEl) throw new Error(`No value node for ${label}`);
  return valueEl;
}

function rowSlider(label: string) {
  const input = controlRow(label).querySelector("input[type='range']");
  if (!input) throw new Error(`No range input for ${label}`);
  return input as HTMLInputElement;
}

describe("ControlPanel", () => {
  beforeEach(() => {
    mockDispatch.workload = null;
    mockDispatch.workloadError = null;
    mockDispatch.params = { ...DEFAULT_PARAMS };
    mockDispatch.setParams.mockReset();
    mockDispatch.runOptimize.mockReset();
    mockDispatch.loading = false;
    mockDispatch.error = null;
  });

  it("shows em dashes and disables sliders while workload is missing", () => {
    render(<ControlPanel />);

    expect(rowValue("Technicians available")).toHaveTextContent("—");
    expect(rowValue("Jobs in backlog")).toHaveTextContent("—");
    expect(rowSlider("Technicians available")).toBeDisabled();
    expect(rowSlider("Jobs in backlog")).toBeDisabled();
    expect(screen.getByRole("button", { name: "reset" })).toBeDisabled();
  });

  it("shows real slider counts after workload loads", () => {
    mockDispatch.workload = makeWorkload(12, 110, 6);
    render(<ControlPanel />);

    expect(rowValue("Technicians available")).toHaveTextContent("12");
    expect(rowValue("Jobs in backlog")).toHaveTextContent("110");
    expect(rowSlider("Technicians available")).not.toBeDisabled();
    expect(rowSlider("Jobs in backlog")).not.toBeDisabled();
    expect(rowSlider("Technicians available")).toHaveValue("12");
    expect(rowSlider("Jobs in backlog")).toHaveValue("110");
    expect(screen.getByRole("button", { name: "reset" })).not.toBeDisabled();
  });
});
