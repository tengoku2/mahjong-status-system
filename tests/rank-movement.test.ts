import { describe, expect, it } from "vitest";
import { calculateRankMovements, movementSymbol } from "../src/rank-movement.js";

describe("rank movement", () => {
  it("marks first season match as flat for everyone", () => {
    const movements = calculateRankMovements(
      [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
      []
    );

    expect(movements.get("a")).toBe("same");
    expect(movements.get("b")).toBe("same");
    expect(movements.get("c")).toBe("same");
  });

  it("marks later new entrants as NEW", () => {
    const movements = calculateRankMovements(
      [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
      [{ userId: "a" }, { userId: "b" }]
    );

    expect(movements.get("c")).toBe("new");
  });

  it("distinguishes one-place and multi-place movement", () => {
    const movements = calculateRankMovements(
      [{ userId: "b" }, { userId: "d" }, { userId: "a" }, { userId: "c" }],
      [{ userId: "a" }, { userId: "b" }, { userId: "c" }, { userId: "d" }]
    );

    expect(movements.get("b")).toBe("up_near");
    expect(movements.get("d")).toBe("up_far");
    expect(movements.get("a")).toBe("down_far");
    expect(movements.get("c")).toBe("down_near");
    expect(movementSymbol("new")).toBe("[new]");
  });
});
