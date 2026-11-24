import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { holidaysFromRows, parseSheetDate, readCsvRows, readHolidaySheet } from "../holidaySheet";
import { buildXlsx } from "../xlsx";

describe("parseSheetDate", () => {
  it("reads the ways a date is usually typed, day first", () => {
    expect(parseSheetDate("2026-12-25")).toBe("2026-12-25");
    expect(parseSheetDate("25/12/2026")).toBe("2026-12-25");
    expect(parseSheetDate("05-01-27")).toBe("2027-01-05");
    expect(parseSheetDate("25.12.2026")).toBe("2026-12-25");
    expect(parseSheetDate("25 Dec 2026")).toBe("2026-12-25");
    expect(parseSheetDate("25-Dec-26")).toBe("2026-12-25");
    expect(parseSheetDate("Friday, 25 December 2026")).toBe("2026-12-25");
    expect(parseSheetDate("December 25, 2026")).toBe("2026-12-25");
    expect(parseSheetDate("1st Jan 2027")).toBe("2027-01-01");
  });
  it("reads Excel day numbers", () => {
    expect(parseSheetDate(46381)).toBe("2026-12-25");
    expect(parseSheetDate("46381")).toBe("2026-12-25");
  });
  it("turns down dates that don't exist", () => {
    expect(parseSheetDate("31/02/2026")).toBeNull();
    expect(parseSheetDate("Christmas")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
  });
});

describe("holidaysFromRows", () => {
  it("finds the columns by the header, with a serial number column in front", () => {
    const r = holidaysFromRows([
      { row: 1, cells: ["List of holidays 2026-27"] },
      { row: 2, cells: ["Sl No", "Date", "Day", "Holiday", "Make-up day"] },
      { row: 3, cells: [1, "25/12/2026", "Friday", "Christmas", "No"] },
      { row: 4, cells: [2, "15/01/2027", "Friday", "Makara Sankranti", ""] },
      { row: 5, cells: [3, "Holi", "", "", ""] },
    ]);
    expect(r.holidays).toEqual([
      { row: 3, date: "2026-12-25", name: "Christmas", makeup: false },
      { row: 4, date: "2027-01-15", name: "Makara Sankranti", makeup: true },
    ]);
    expect(r.problems).toEqual([{ row: 5, text: '"Holi" isn\'t a date I can read' }]);
  });
  it("takes column A as the date and B as the name without a header", () => {
    const r = holidaysFromRows(readCsvRows('25/12/2026,"Christmas, Day"\r\n26-01-2027,Republic Day\n'));
    expect(r.holidays.map((h) => [h.date, h.name])).toEqual([
      ["2026-12-25", "Christmas, Day"],
      ["2027-01-26", "Republic Day"],
    ]);
  });
});

describe("readHolidaySheet", () => {
  it("reads an .xlsx with dates as Excel day numbers", () => {
    const file = buildXlsx("Holidays", [["Date", "Name", "Make-up day"], [46381, "Christmas", "No"], ["2027-01-26", "Republic Day", "Yes"]]);
    expect(readHolidaySheet("h.xlsx", file).holidays).toEqual([
      { row: 2, date: "2026-12-25", name: "Christmas", makeup: false },
      { row: 3, date: "2027-01-26", name: "Republic Day", makeup: true },
    ]);
  });
  it("reads shared strings, as Excel itself saves them", () => {
    const x = (s: string) => strToU8(`<?xml version="1.0"?>${s}`);
    const file = zipSync({
      "xl/workbook.xml": x(`<workbook xmlns:r="r"><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": x(`<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`),
      "xl/sharedStrings.xml": x(`<sst><si><t>Date</t></si><si><t>Holiday</t></si><si><r><t>Gandhi </t></r><r><t>Jayanti &amp; more</t></r></si></sst>`),
      "xl/worksheets/sheet1.xml": x(
        `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" s="1"><v>46662</v></c><c r="B2" t="s"><v>2</v></c></row></sheetData></worksheet>`,
      ),
    });
    expect(readHolidaySheet("h.xlsx", file).holidays).toEqual([{ row: 2, date: "2027-10-02", name: "Gandhi Jayanti & more", makeup: true }]);
  });
  it("asks for .xlsx instead of an old .xls", () => {
    expect(() => readHolidaySheet("h.xls", new Uint8Array())).toThrow(/xlsx/);
  });
});
