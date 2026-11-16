import { isValidSettingsPatch } from "@/lib/settings/server-settings";
import { describe, expect, it } from "vitest";
import { ADMIN_SETTINGS_GROUPS, fieldDisplayValue, fieldId, fieldPatch } from "../settings-fields";

const fields = ADMIN_SETTINGS_GROUPS.flatMap((group) => group.fields);

describe("admin settings fields", () => {
  it("lists each setting once", () => {
    const keys = fields.map(fieldId);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("offers only values PATCH /api/settings accepts", () => {
    for (const field of fields) {
      if (field.kind === "select") {
        for (const option of field.options) {
          const patch = fieldPatch(field, String(option.value));
          expect(patch, `${field.key}=${option.value}`).not.toBeNull();
          expect(isValidSettingsPatch(patch), `${field.key}=${option.value}`).toBe(true);
        }
      }
      if (field.kind === "toggle") {
        expect(isValidSettingsPatch(fieldPatch(field, true))).toBe(true);
      }
    }
  });

  it("turns typed numbers and plates into patches, and rejects junk", () => {
    const rest = fields.find((field) => field.key === "defaultRestSeconds");
    const plates = fields.find((field) => field.key === "availablePlates");
    const height = fields.find((field) => field.key === "heightCm");
    if (!rest || !plates || !height) throw new Error("missing fields");
    expect(fieldPatch(rest, "120")).toEqual({ defaultRestSeconds: 120 });
    expect(fieldPatch(rest, "1.5")).toBeNull();
    expect(fieldPatch(rest, "")).toBeNull();
    expect(fieldPatch(height, "")).toEqual({ heightCm: null });
    expect(fieldPatch(plates, "45, 25 10")).toEqual({ availablePlates: [45, 25, 10] });
    expect(fieldPatch(plates, "45, -5")).toBeNull();
    expect(isValidSettingsPatch(fieldPatch(plates, "45, 25"))).toBe(true);
  });

  it("takes a decimal comma in numbers and plates (#675)", () => {
    const bar = fields.find((field) => field.key === "defaultBarWeight");
    const plates = fields.find((field) => field.key === "availablePlates");
    if (!bar || !plates) throw new Error("missing fields");
    expect(fieldPatch(bar, "62,5")).toEqual({ defaultBarWeight: 62.5 });
    expect(fieldPatch(plates, "1,25 2,5")).toEqual({ availablePlates: [1.25, 2.5] });
    expect(fieldPatch(plates, "1,25; 2,5")).toEqual({ availablePlates: [1.25, 2.5] });
  });

  it("edits PRP weight steps in the account's units, keeping other overrides", () => {
    const barbell = fields.find((field) => field.kind === "step" && field.bucket === "barbell");
    if (!barbell) throw new Error("missing step field");
    const settings = {
      units: "kg",
      dprEquipmentIncrements: { barbell: { lb: 5 }, dumbbell: { kg: 1 } },
    } as never;
    expect(fieldDisplayValue(barbell, settings)).toBe("1.25");
    const patch = fieldPatch(barbell, "2,5", settings);
    expect(patch).toEqual({
      dprEquipmentIncrements: { barbell: { lb: 5, kg: 2.5 }, dumbbell: { kg: 1 } },
    });
    expect(isValidSettingsPatch(patch)).toBe(true);
    expect(fieldPatch(barbell, "1.25", settings)).toEqual({
      dprEquipmentIncrements: { barbell: { lb: 5 }, dumbbell: { kg: 1 } },
    });
    expect(fieldPatch(barbell, "-1", settings)).toBeNull();
    expect(fieldPatch(barbell, "2", undefined)).toBeNull();
  });

  it("shows stored values in their controls", () => {
    const plates = fields.find((field) => field.key === "availablePlates");
    const sex = fields.find((field) => field.key === "sex");
    if (!plates || !sex) throw new Error("missing fields");
    const settings = { availablePlates: ["45.00", "2.50"], sex: null } as never;
    expect(fieldDisplayValue(plates, settings)).toBe("45, 2.5");
    expect(fieldDisplayValue(sex, settings)).toBe("null");
  });
});
