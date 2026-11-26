import {
  Disc3,
  Dumbbell,
  HeartPulse,
  type IconComponent,
  PersonStanding,
  Trophy,
  Weight,
} from "@/components/icons/solar";
import { CARD_GRADIENTS, CARD_INK } from "@/lib/share-card/palette";
import { charsThatFit, fitFontSize, truncate, wrapLines } from "@/lib/share-card/text-fit";
import {
  type AchievementCategory,
  SHARE_CARD_DIMENSIONS,
  type ShareCardModel,
  type ShareCardSize,
  type ShareCardTile,
} from "@jim/core";
import type { ReactNode } from "react";

/**
 * The share image (issue #838): one SVG per card, drawn from a `ShareCardModel`
 * and nothing else. It's rasterized on the phone (`lib/share-card/render.ts`)
 * and shown as the preview, so what's previewed is what's shared. Everything
 * is a fixed color, never a CSS variable or `dark:` class: the image can't
 * follow the phone's theme, so it has to look the same in both.
 *
 * Pure SVG, no `foreignObject`: WebKit taints a canvas that draws one, which
 * would make the PNG unreadable.
 */

const WIDTH = 1080;
const PAD = 84;
const INNER = WIDTH - PAD * 2;
/** Space kept clear at the bottom of every card for the Jim mark and username. */
const FOOTER_RESERVE = 148;

/** Name of the embedded card font; falls back to the system font when none loaded. */
export const CARD_FONT_FAMILY = "JimCard, -apple-system, 'Helvetica Neue', Arial, sans-serif";

const ICONS: Record<AchievementCategory, IconComponent> = {
  workouts: Dumbbell,
  volume: Weight,
  plates: Disc3,
  bodyweight: PersonStanding,
  strength: Trophy,
  cardio: HeartPulse,
};

interface Props {
  model: ShareCardModel;
  size: ShareCardSize;
  /** `@font-face` rules with the font embedded as data, so the canvas draws it. */
  fontCss?: string;
  /** Scale to its container (the preview) instead of fixed pixel size (the PNG). */
  fluid?: boolean;
}

function Text({
  x,
  y,
  size,
  weight = 600,
  fill = CARD_INK.text,
  anchor = "start",
  spacing,
  children,
}: {
  x: number;
  y: number;
  size: number;
  weight?: number;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  spacing?: number;
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      textAnchor={anchor}
      letterSpacing={spacing}
    >
      {children}
    </text>
  );
}

function Tiles({
  tiles,
  y,
  height,
  columns,
  valueSize,
}: {
  tiles: readonly ShareCardTile[];
  y: number;
  height: number;
  columns: number;
  valueSize: number;
}) {
  const gap = 24;
  const width = (INNER - gap * (columns - 1)) / columns;
  // One value size for every tile, set by the widest value, so a row reads evenly.
  const size = Math.min(
    ...tiles.map((tile) =>
      fitFontSize(tile.value, width - 44, [
        valueSize,
        valueSize * 0.86,
        valueSize * 0.72,
        valueSize * 0.6,
      ]),
    ),
  );
  return (
    <g>
      {tiles.map((tile, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = PAD + column * (width + gap);
        const top = y + row * (height + gap);
        return (
          <g key={tile.label}>
            <rect x={x} y={top} width={width} height={height} rx={32} fill={CARD_INK.faint} />
            <Text x={x + 22} y={top + height * 0.36} size={30} weight={500} fill={CARD_INK.muted}>
              {tile.label}
            </Text>
            <Text x={x + 22} y={top + height * 0.8} size={size} weight={700}>
              {tile.value}
            </Text>
          </g>
        );
      })}
    </g>
  );
}

function Frame({
  model,
  height,
  children,
}: { model: ShareCardModel; height: number; children: ReactNode }) {
  const [from, to] = CARD_GRADIENTS[model.colorKey];
  const footerY = height - 84;
  return (
    <>
      <defs>
        <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        {/* A dark wash toward the bottom keeps white text readable on light hues. */}
        <linearGradient id="card-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.42" />
        </linearGradient>
      </defs>
      <rect width={WIDTH} height={height} fill="url(#card-bg)" />
      <rect width={WIDTH} height={height} fill="url(#card-wash)" />
      <circle cx={WIDTH - 40} cy={140} r={420} fill="#ffffff" fillOpacity={0.06} />
      {children}
      <g>
        <rect x={PAD} y={footerY - 40} width={52} height={52} rx={14} fill="#ffffff" />
        <Text
          x={PAD + 26}
          y={footerY}
          size={38}
          weight={800}
          fill={CARD_GRADIENTS[model.colorKey][1]}
          anchor="middle"
        >
          J
        </Text>
        <Text x={PAD + 72} y={footerY} size={36} weight={700} spacing={1}>
          Jim
        </Text>
        {model.username && (
          <Text
            x={WIDTH - PAD}
            y={footerY}
            size={34}
            weight={500}
            fill={CARD_INK.muted}
            anchor="end"
          >
            {truncate(model.username, 24)}
          </Text>
        )}
      </g>
    </>
  );
}

function Kicker({
  x,
  y,
  anchor,
  children,
}: {
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  children: ReactNode;
}) {
  return (
    <Text x={x} y={y} size={32} weight={600} fill={CARD_INK.muted} spacing={5} anchor={anchor}>
      {children}
    </Text>
  );
}

function PrPill({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y - 38} width={68} height={46} rx={23} fill={CARD_INK.record} />
      <Text x={x + 34} y={y - 4} size={26} weight={800} fill={CARD_INK.recordInk} anchor="middle">
        PR
      </Text>
    </g>
  );
}

function WorkoutCard({ model, size }: { model: ShareCardModel; size: ShareCardSize }) {
  const story = size === "story";
  const titleSizes = story ? [104, 88, 72] : [84, 72, 60];
  const titleSize = fitFontSize(model.title, INNER, titleSizes);
  const title = truncate(model.title, charsThatFit(INNER, titleSize) + 2);

  const titleY = story ? 330 : 210;
  const tilesTop = story ? 430 : 290;
  // Five tiles (a record and bodyweight on) take two rows rather than three.
  const crowded = model.tiles.length > 4;
  const columns = story ? (crowded ? 3 : 2) : crowded ? 3 : model.tiles.length || 1;
  const tileHeight = story ? 190 : crowded ? 100 : 132;
  const tileRows = Math.ceil(model.tiles.length / columns);
  const tilesBottom = tilesTop + tileRows * tileHeight + (tileRows - 1) * 24;
  const listTop = tilesBottom + (story ? 96 : crowded ? 56 : 72);
  // The list never runs into the footer: rows squeeze to what's left above it.
  const height = SHARE_CARD_DIMENSIONS[size].height;
  const slots = model.exercises.length + (model.moreExercises > 0 ? 1 : 0);
  const room = height - FOOTER_RESERVE - listTop;
  const rowHeight = Math.min(story ? 120 : 66, slots > 0 ? room / slots : 120);
  const nameSize = story ? 46 : 32;

  return (
    <>
      <Kicker x={PAD} y={story ? 200 : 128}>
        {model.subtitles[0]?.toUpperCase()}
      </Kicker>
      <Text x={PAD} y={titleY} size={titleSize} weight={800}>
        {title}
      </Text>
      <Tiles
        tiles={model.tiles}
        y={tilesTop}
        height={tileHeight}
        columns={columns}
        valueSize={story ? 68 : 48}
      />
      <g>
        {model.exercises.map((row, index) => {
          const y = listTop + index * rowHeight;
          const nameX = PAD + 88;
          const setWidth = Math.min(420, [...row.topSet].length * nameSize * 0.52 + 16);
          return (
            <g key={`${row.name}-${index}`}>
              <line
                x1={PAD}
                x2={WIDTH - PAD}
                y1={y - rowHeight * 0.62}
                y2={y - rowHeight * 0.62}
                stroke={CARD_INK.rule}
                strokeWidth={2}
              />
              {row.pr && <PrPill x={PAD} y={y} />}
              <Text x={nameX} y={y} size={nameSize} weight={600}>
                {truncate(row.name, charsThatFit(INNER - 88 - setWidth - 24, nameSize))}
              </Text>
              <Text
                x={WIDTH - PAD}
                y={y}
                size={nameSize}
                weight={500}
                fill={CARD_INK.muted}
                anchor="end"
              >
                {truncate(row.topSet, charsThatFit(setWidth, nameSize))}
              </Text>
            </g>
          );
        })}
        {model.moreExercises > 0 && (
          <Text
            x={PAD}
            y={listTop + model.exercises.length * rowHeight}
            size={nameSize - 4}
            weight={500}
            fill={CARD_INK.muted}
          >
            {`+${model.moreExercises} more`}
          </Text>
        )}
      </g>
    </>
  );
}

function PrCard({ model, size }: { model: ShareCardModel; size: ShareCardSize }) {
  const story = size === "story";
  const hero = model.hero ?? "";
  const heroSize = fitFontSize(hero, INNER, story ? [190, 150, 120, 96] : [150, 120, 96, 76]);
  const titleSize = fitFontSize(model.title, INNER, story ? [92, 76, 62] : [76, 64, 54]);
  const top = story ? 560 : 250;
  const tilesTop = top + (story ? 520 : 330);
  const columns = Math.max(1, Math.min(model.tiles.length, 2));
  return (
    <>
      <Kicker x={PAD} y={top - (story ? 90 : 80)}>
        PERSONAL RECORD
      </Kicker>
      <Text x={PAD} y={top + (story ? 40 : 30)} size={titleSize} weight={800}>
        {truncate(model.title, charsThatFit(INNER, titleSize) + 2)}
      </Text>
      <Text x={PAD} y={top + (story ? 240 : 190)} size={heroSize} weight={800}>
        {hero}
      </Text>
      <Text x={PAD} y={top + (story ? 330 : 255)} size={38} weight={500} fill={CARD_INK.muted}>
        {model.subtitles.join(" · ")}
      </Text>
      {model.badge && (
        <g>
          <rect
            x={PAD}
            y={top + (story ? 380 : 285)}
            width={Math.max(220, [...model.badge].length * 24 + 64)}
            height={64}
            rx={32}
            fill={CARD_INK.record}
          />
          <Text
            x={PAD + 32}
            y={top + (story ? 424 : 329)}
            size={32}
            weight={800}
            fill={CARD_INK.recordInk}
          >
            {model.badge}
          </Text>
        </g>
      )}
      {model.tiles.length > 0 && (
        <Tiles
          tiles={model.tiles}
          y={story ? tilesTop : top + 400}
          height={story ? 176 : 120}
          columns={columns}
          valueSize={story ? 60 : 46}
        />
      )}
    </>
  );
}

function AchievementCard({ model, size }: { model: ShareCardModel; size: ShareCardSize }) {
  const story = size === "story";
  const Icon = model.icon ? ICONS[model.icon] : Trophy;
  const radius = story ? 230 : 150;
  const centerX = WIDTH / 2;
  const centerY = story ? 640 : 330;
  const titleSize = fitFontSize(model.title, INNER, story ? [96, 80, 66] : [76, 64, 54]);
  const titleY = centerY + radius + (story ? 190 : 165);
  const description = model.subtitles[0] ?? "";
  const date = model.subtitles[1];
  const lines = wrapLines(description, story ? 38 : 44, 3);
  return (
    <>
      <circle cx={centerX} cy={centerY} r={radius + 36} fill="#ffffff" fillOpacity={0.12} />
      <circle cx={centerX} cy={centerY} r={radius} fill="#ffffff" />
      <Icon
        x={centerX - radius * 0.5}
        y={centerY - radius * 0.5}
        width={radius}
        height={radius}
        strokeWidth={1.5}
        color={CARD_GRADIENTS[model.colorKey][1]}
      />
      <Kicker x={centerX} y={titleY - titleSize - 20} anchor="middle">
        ACHIEVEMENT UNLOCKED
      </Kicker>
      <Text x={centerX} y={titleY} size={titleSize} weight={800} anchor="middle">
        {truncate(model.title, charsThatFit(INNER, titleSize) + 2)}
      </Text>
      {lines.map((line, index) => (
        <Text
          key={line}
          x={centerX}
          y={titleY + 70 + index * 54}
          size={38}
          weight={500}
          fill={CARD_INK.muted}
          anchor="middle"
        >
          {line}
        </Text>
      ))}
      {date && (
        <Text
          x={centerX}
          y={titleY + 70 + lines.length * 54 + 30}
          size={34}
          weight={600}
          anchor="middle"
        >
          {date}
        </Text>
      )}
    </>
  );
}

export function ShareCardSvg({ model, size, fontCss, fluid = false }: Props) {
  const { width, height } = SHARE_CARD_DIMENSIONS[size];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={fluid ? undefined : width}
      height={fluid ? undefined : height}
      fontFamily={CARD_FONT_FAMILY}
      role="img"
      aria-label={`${model.title} share card`}
      style={fluid ? { display: "block", maxWidth: "100%", maxHeight: "100%" } : undefined}
    >
      {fontCss && <style>{fontCss}</style>}
      <Frame model={model} height={height}>
        {model.kind === "workout" && <WorkoutCard model={model} size={size} />}
        {model.kind === "pr" && <PrCard model={model} size={size} />}
        {model.kind === "achievement" && <AchievementCard model={model} size={size} />}
      </Frame>
    </svg>
  );
}
