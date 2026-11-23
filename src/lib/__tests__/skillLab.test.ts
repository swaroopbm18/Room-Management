import { describe, expect, it } from "vitest";
import { isLabRoom, needsLab, skillLabTitle } from "../skillLab";

describe("skillLabTitle", () => {
  it("adds the sections to the name", () => {
    expect(skillLabTitle("Skill Lab", ["3B", "3D"])).toBe("Skill Lab - 3B/3D");
  });
  it("replaces sections already in the name", () => {
    expect(skillLabTitle("Skill Lab - 3B", ["3B", "3F"])).toBe("Skill Lab - 3B/3F");
  });
  it("keeps a name whose dash is not followed by sections", () => {
    expect(skillLabTitle("CIE-2, 5th sem", ["5A"])).toBe("CIE-2, 5th sem - 5A");
  });
  it("defaults the name", () => {
    expect(skillLabTitle("", ["3A"])).toBe("Skill Lab - 3A");
  });
});

describe("labs", () => {
  it("knows a lab room and a practical", () => {
    expect(isLabRoom({ id: "MEL-LAB-01", name: "MEL-LAB-01", kind: "classroom" } as never)).toBe(true);
    expect(needsLab("DBMS(P)-3A")).toBe(true);
    expect(needsLab("DBMS-3A")).toBe(false);
  });
});
