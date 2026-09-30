import {bench,describe} from "vitest";
import {parseSimpleTimeEntry} from "../fast-path";
describe("Telegram parser local benchmark",()=>{bench("simple deterministic message",()=>{parseSimpleTimeEntry("היום מואיד עבד אצל טל 8 שעות");});bench("complex message fallback decision",()=>{parseSimpleTimeEntry("היום אצל טל מואיד ויוסף עבדו 8 שעות וקייס 10 שעות ובשוהם ארנון עבד 7.5 שעות");});});
