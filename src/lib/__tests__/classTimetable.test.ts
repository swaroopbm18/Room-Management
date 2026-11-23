import { describe, expect, it } from "vitest";
import { classesOf, semestersOf } from "../classTimetable";

describe("classesOf", () => {
  it("reads the sections after the last dash", () => {
    expect(classesOf("DBMS-3B")).toEqual(["3B"]);
    expect(classesOf("KDD-5")).toEqual(["5"]);
    expect(classesOf("DBMS-3B/3C")).toEqual(["3B", "3C"]);
    expect(classesOf("ML-LAB-3a")).toEqual(["3A"]);
  });

  it("gives nothing for a subject with no section", () => {
    expect(classesOf("SKILL")).toEqual([]);
    expect(classesOf("Department meeting")).toEqual([]);
    expect(classesOf("CIE-ML")).toEqual([]);
  });
});

describe("semestersOf", () => {
  it("groups sections by semester and spots whole-semester subjects", () => {
    const r = semestersOf(["DBMS-3B", "DBMS-3A", "KDD-5", "OS-3A", "SKILL"]);
    expect(r.semesters).toEqual([
      { sem: "3", classes: ["3A", "3B"] },
      { sem: "5", classes: ["5"] },
    ]);
    expect(r.hasOther).toBe(true);
    expect([...r.wholeSemester]).toEqual(["5"]);
  });
});
