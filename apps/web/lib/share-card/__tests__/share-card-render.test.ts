import { ShareCardSvg } from "@/components/share-card/share-card-svg";
import {
  SHARE_CARD_DIMENSIONS,
  SHARE_CARD_SIZES,
  type ShareCardExercise,
  type ShareCardModel,
  shareCardModel,
} from "@jim/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CARD_GRADIENTS } from "../palette";
import { charsThatFit, fitFontSize, truncate, wrapLines } from "../text-fit";

const exercises: ShareCardExercise[] = Array.from({ length: 9 }, (_, index) => ({
  name:
    index === 0
      ? "A very long exercise name for a barbell lift done with a pause"
      : `Lift ${index}`,
  isWarmup: false,
  isCardio: false,
  sets: [
    {
      kind: "working",
      weight: 100 + index,
      reps: 5,
      durationSeconds: null,
      distance: null,
      prKinds: index === 1 ? ["1rm"] : [],
    },
  ],
}));

const models: Record<string, ShareCardModel> = {
  workout: shareCardModel(
    {
      kind: "workout",
      input: {
        name: "Heavy Upper Body Push Pull Day With A Long Name",
        startedAt: new Date(2026, 8, 28, 17, 30),
        endedAt: new Date(2026, 8, 28, 18, 40),
        units: "lb",
        routineColor: "indigo",
        exercises,
        username: "jim",
        bodyweight: 180,
      },
    },
    { includeBodyweight: true },
  ),
  pr: shareCardModel({
    kind: "pr",
    input: {
      exerciseName: "Barbell Bench Press",
      kind: "1rm",
      value: 225,
      weight: 200,
      reps: 4,
      oneRepMax: 227,
      achievedAt: new Date(2026, 8, 28),
      standard: { tier: "intermediate" },
      units: "lb",
      routineColor: null,
      username: null,
      bodyweight: null,
    },
  }),
  achievement: shareCardModel({
    kind: "achievement",
    input: {
      title: "Two plates",
      description: "Lift 225 lb on a barbell",
      category: "plates",
      achievedAt: new Date(2026, 8, 28),
      routineColor: "teal",
      username: "jim",
    },
  }),
};

describe("ShareCardSvg", () => {
  for (const [name, model] of Object.entries(models)) {
    for (const size of SHARE_CARD_SIZES) {
      it(`renders the ${name} card at ${size} size`, () => {
        const markup = renderToStaticMarkup(createElement(ShareCardSvg, { model, size }));
        const { width, height } = SHARE_CARD_DIMENSIONS[size];
        expect(markup).toContain(`viewBox="0 0 ${width} ${height}"`);
        expect(markup).toContain(model.title.slice(0, 10));
        // The image can't follow the phone's theme: no CSS variables, no dark variants.
        expect(markup).not.toMatch(/var\(--/);
        expect(markup).not.toMatch(/dark:/);
        expect(markup).not.toContain("foreignObject");
      });
    }
  }

  it("embeds the card font when given", () => {
    const css = '@font-face{font-family:"JimCard";src:url(data:font/woff2;base64,AAAA)}';
    const markup = renderToStaticMarkup(
      createElement(ShareCardSvg, {
        model: models.workout as ShareCardModel,
        size: "story",
        fontCss: css,
      }),
    );
    expect(markup).toContain(css);
  });

  it("has a gradient for every color key", () => {
    for (const color of ["red", "blue", "default"] as const) {
      expect(CARD_GRADIENTS[color]).toHaveLength(2);
    }
  });
});

describe("text fitting", () => {
  it("truncates with an ellipsis only when too long", () => {
    expect(truncate("Bench", 10)).toBe("Bench");
    expect(truncate("Barbell Bench Press", 10)).toBe("Barbell B…");
  });

  it("picks the largest size that fits", () => {
    expect(fitFontSize("Push", 920, [100, 80, 60])).toBe(100);
    expect(fitFontSize("x".repeat(30), 920, [100, 80, 60])).toBe(60);
  });

  it("counts the characters that fit a width", () => {
    expect(charsThatFit(520, 40)).toBe(25);
  });

  it("wraps to a number of lines and truncates the last", () => {
    expect(wrapLines("Lift 225 lb on a barbell today", 14, 3)).toEqual([
      "Lift 225 lb on",
      "a barbell",
      "today",
    ]);
    expect(wrapLines("one two three four five six", 8, 2)).toEqual(["one two", "three f…"]);
  });
});
