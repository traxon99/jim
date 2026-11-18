import { ShareCardSvg } from "@/components/share-card/share-card-svg";
import { SHARE_CARD_DIMENSIONS, type ShareCardModel, type ShareCardSize } from "@jim/core";
import { createElement } from "react";

/** The card as standalone SVG markup, with `fontCss` embedded when given. */
export async function renderShareCardSvg(
  model: ShareCardModel,
  size: ShareCardSize,
  fontCss = "",
): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(createElement(ShareCardSvg, { model, size, fontCss }));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rasterizes the card to a PNG on the phone: SVG markup, drawn to an
 * offscreen canvas. No network involved, so it works offline (issue #838).
 */
export async function renderShareCardPng(
  model: ShareCardModel,
  size: ShareCardSize,
  fontCss = "",
): Promise<Blob> {
  const markup = await renderShareCardSvg(model, size, fontCss);
  const { width, height } = SHARE_CARD_DIMENSIONS[size];
  const image = new Image();
  image.decoding = "async";
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This device can't draw the image.");
  context.drawImage(image, 0, 0, width, height);
  if (fontCss) {
    // Safari can draw an SVG image before its embedded font is ready; a second
    // pass a moment later has it.
    await wait(80);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't make the image."))),
      "image/png",
    );
  });
}
