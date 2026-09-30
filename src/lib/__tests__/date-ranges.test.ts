import { describe,expect,it } from "vitest";
import { monthRangeExclusive, nextDateExclusive } from "../date-ranges";

const belongs=(date:string,month:string)=>{const range=monthRangeExclusive(month);return date>=range.from&&date<range.toExclusive;};
describe("calendar DATE month boundaries",()=>{
  it.each([
    ["2026-09-01","2026-09",true],
    ["2026-09-30","2026-09",true],
    ["2026-10-01","2026-09",false],
    ["2026-10-31","2026-10",true],
    ["2026-02-28","2026-02",true],
    ["2027-02-28","2027-02",true],
    ["2028-02-29","2028-02",true],
    ["2026-12-31","2026-12",true],
    ["2027-01-01","2026-12",false],
  ])("places %s in %s correctly",(date,month,expected)=>expect(belongs(date,month)).toBe(expected));
  it("uses the next month as the exclusive September boundary",()=>expect(monthRangeExclusive("2026-09")).toEqual({from:"2026-09-01",toExclusive:"2026-10-01"}));
  it("does not convert December 31 into January",()=>{expect(nextDateExclusive("2026-12-31")).toBe("2027-01-01");expect(belongs("2026-12-31","2026-12")).toBe(true);});
});
