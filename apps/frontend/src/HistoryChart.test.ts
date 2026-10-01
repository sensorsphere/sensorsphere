import { describe, expect, it } from "vitest";

import { nextHistoryLegendSelection } from "./HistoryChart";

const names = ["A", "B", "C"];

describe("nextHistoryLegendSelection", () => {
  it("keeps the normal ECharts toggle selection", () => {
    expect(
      nextHistoryLegendSelection(
        names,
        { A: true, B: false, C: true },
        "B",
        false
      )
    ).toEqual({ A: true, B: false, C: true });
  });

  it("isolates the clicked series on solo click", () => {
    expect(
      nextHistoryLegendSelection(
        names,
        { A: true, B: true, C: true },
        "B",
        true
      )
    ).toEqual({ A: false, B: true, C: false });
  });


  it("restores every series when the clicked series is already solo", () => {
    expect(
      nextHistoryLegendSelection(
        names,
        { A: false, B: true, C: false },
        "B",
        true
      )
    ).toEqual({ A: true, B: true, C: true });
  });
});
