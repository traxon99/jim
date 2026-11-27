import { type MuscleTargets, groupTagsFromTargets, muscleTargetsError } from "@jim/core";
import type { SeedExercise } from "./free-exercise-db";

/**
 * Jim's fork of free-exercise-db's muscle data (issue #874). The upstream
 * dataset stays pinned and untouched; this file re-tags each exercise with
 * nodes of the muscle tree (core's MUSCLE_TREE), and the seed derives the
 * group tags from them. Two layers:
 *
 * 1. `STAPLE_TARGETS`: hand-tagged lifts, by slug. These win outright.
 * 2. Name rules per group: each group upstream tagged is resolved to the
 *    muscles or heads the exercise's name says it works, keeping upstream's
 *    primary/secondary call. A group no rule can resolve stays tagged at
 *    group level, so it counts exactly as it did before.
 *
 * Rules are deliberately conservative: a wrong head is worse than a group.
 */

type Tags = { p: readonly string[]; s?: readonly string[] };

/**
 * Hand-tagged staples (slugs from free-exercise-db and core's curated list).
 * The reasoning per lift is in the muscle tree report's staple-lift table.
 */
export const STAPLE_TARGETS: Readonly<Record<string, Tags>> = {
  // Chest
  "barbell-bench-press-medium-grip": {
    p: ["lower_chest"],
    s: ["upper_chest", "front_delt", "triceps_lateral", "triceps_medial", "serratus_anterior"],
  },
  "dumbbell-bench-press": {
    p: ["lower_chest"],
    s: ["upper_chest", "front_delt", "triceps_lateral", "triceps_medial"],
  },
  "barbell-incline-bench-press-medium-grip": {
    p: ["upper_chest", "front_delt"],
    s: ["lower_chest", "triceps_lateral", "triceps_medial"],
  },
  "incline-dumbbell-press": {
    p: ["upper_chest", "front_delt"],
    s: ["lower_chest", "triceps_lateral", "triceps_medial"],
  },
  "dips-chest-version": {
    p: ["lower_chest", "triceps_brachii"],
    s: ["front_delt", "pectoralis_minor"],
  },
  pushups: {
    p: ["lower_chest"],
    s: ["upper_chest", "front_delt", "triceps_brachii", "serratus_anterior", "rectus_abdominis"],
  },
  // Shoulders
  "standing-military-press": {
    p: ["front_delt"],
    s: ["side_delt", "triceps_brachii", "upper_traps", "serratus_anterior"],
  },
  "dumbbell-shoulder-press": {
    p: ["front_delt"],
    s: ["side_delt", "triceps_brachii", "upper_traps", "serratus_anterior"],
  },
  "side-lateral-raise": { p: ["side_delt"], s: ["supraspinatus", "upper_traps", "front_delt"] },
  "face-pull": {
    p: ["rear_delt", "middle_traps"],
    s: ["lower_traps", "rhomboids", "infraspinatus_teres_minor"],
  },
  "reverse-flyes": {
    p: ["rear_delt"],
    s: ["middle_traps", "rhomboids", "infraspinatus_teres_minor"],
  },
  "external-rotation-with-cable": { p: ["infraspinatus_teres_minor"], s: ["rear_delt"] },
  // Back
  "bent-over-barbell-row": {
    p: ["latissimus_dorsi", "middle_traps", "rhomboids"],
    s: ["rear_delt", "teres_major", "biceps_brachii", "brachialis", "erector_spinae"],
  },
  "one-arm-dumbbell-row": {
    p: ["latissimus_dorsi", "middle_traps", "rhomboids"],
    s: ["rear_delt", "teres_major", "biceps_brachii", "brachialis"],
  },
  "seated-cable-rows": {
    p: ["latissimus_dorsi", "middle_traps", "rhomboids"],
    s: ["rear_delt", "teres_major", "biceps_brachii", "brachialis", "erector_spinae"],
  },
  pullups: {
    p: ["latissimus_dorsi"],
    s: [
      "teres_major",
      "lower_traps",
      "rhomboids",
      "biceps_brachii",
      "brachialis",
      "brachioradialis",
    ],
  },
  "chin-up": {
    p: ["latissimus_dorsi", "biceps_brachii"],
    s: ["teres_major", "lower_traps", "rhomboids", "brachialis"],
  },
  "wide-grip-lat-pulldown": {
    p: ["latissimus_dorsi"],
    s: [
      "teres_major",
      "lower_traps",
      "rhomboids",
      "biceps_brachii",
      "brachialis",
      "brachioradialis",
    ],
  },
  "barbell-shrug": { p: ["upper_traps"], s: ["levator_scapulae", "finger_flexors"] },
  "dumbbell-shrug": { p: ["upper_traps"], s: ["levator_scapulae", "finger_flexors"] },
  // Legs and hinge
  "barbell-deadlift": {
    p: ["gluteus_maximus", "erector_spinae", "adductor_magnus"],
    s: [
      "biceps_femoris_long",
      "semitendinosus",
      "semimembranosus",
      "vastus_lateralis",
      "vastus_medialis",
      "vastus_intermedius",
      "upper_traps",
      "middle_traps",
      "latissimus_dorsi",
      "finger_flexors",
    ],
  },
  "romanian-deadlift": {
    p: ["biceps_femoris_long", "semitendinosus", "semimembranosus", "gluteus_maximus"],
    s: ["adductor_magnus", "erector_spinae", "finger_flexors"],
  },
  "stiff-legged-barbell-deadlift": {
    p: ["biceps_femoris_long", "semitendinosus", "semimembranosus", "gluteus_maximus"],
    s: ["adductor_magnus", "erector_spinae", "finger_flexors"],
  },
  "barbell-full-squat": {
    p: ["vastus_lateralis", "vastus_medialis", "vastus_intermedius", "gluteus_maximus"],
    s: ["adductor_magnus", "rectus_femoris", "erector_spinae", "soleus"],
  },
  "barbell-squat": {
    p: ["vastus_lateralis", "vastus_medialis", "vastus_intermedius", "gluteus_maximus"],
    s: ["adductor_magnus", "rectus_femoris", "erector_spinae", "soleus"],
  },
  "front-barbell-squat": {
    p: ["vastus_lateralis", "vastus_medialis", "vastus_intermedius"],
    s: ["gluteus_maximus", "adductor_magnus", "rectus_femoris", "erector_spinae"],
  },
  "leg-press": {
    p: ["vastus_lateralis", "vastus_medialis", "vastus_intermedius"],
    s: ["gluteus_maximus", "adductor_magnus"],
  },
  "leg-extensions": {
    p: ["rectus_femoris", "vastus_lateralis", "vastus_medialis", "vastus_intermedius"],
  },
  "seated-leg-curl": {
    p: ["biceps_femoris_long", "biceps_femoris_short", "semitendinosus", "semimembranosus"],
    s: ["gastrocnemius"],
  },
  "lying-leg-curls": {
    p: ["biceps_femoris_long", "biceps_femoris_short", "semitendinosus", "semimembranosus"],
    s: ["gastrocnemius"],
  },
  "barbell-hip-thrust": {
    p: ["gluteus_maximus"],
    s: ["biceps_femoris_long", "semitendinosus", "semimembranosus", "adductor_magnus"],
  },
  "barbell-glute-bridge": {
    p: ["gluteus_maximus"],
    s: ["biceps_femoris_long", "semitendinosus", "semimembranosus"],
  },
  "thigh-abductor": { p: ["gluteus_medius", "gluteus_minimus"] },
  "thigh-adductor": {
    p: ["adductor_magnus", "adductor_longus", "adductor_brevis", "pectineus", "gracilis"],
  },
  "standing-calf-raises": { p: ["gastrocnemius"], s: ["soleus"] },
  "seated-calf-raise": { p: ["soleus"] },
  // Arms
  "barbell-curl": { p: ["biceps_brachii"], s: ["brachialis", "brachioradialis"] },
  "dumbbell-bicep-curl": { p: ["biceps_brachii"], s: ["brachialis", "brachioradialis"] },
  "hammer-curls": { p: ["brachialis", "brachioradialis"], s: ["biceps_brachii"] },
  "triceps-pushdown": { p: ["triceps_lateral", "triceps_medial"], s: ["triceps_long"] },
  "cable-rope-overhead-triceps-extension": {
    p: ["triceps_long"],
    s: ["triceps_lateral", "triceps_medial"],
  },
  "ez-bar-skullcrusher": { p: ["triceps_long"], s: ["triceps_lateral", "triceps_medial"] },
  // Core
  "cable-crunch": { p: ["rectus_abdominis"], s: ["external_obliques", "internal_obliques"] },
  "hanging-leg-raise": {
    p: ["iliopsoas", "rectus_abdominis"],
    s: ["rectus_femoris", "external_obliques"],
  },
  "pallof-press": {
    p: ["external_obliques", "internal_obliques"],
    s: ["transversus_abdominis", "rectus_abdominis"],
  },
  plank: {
    p: ["rectus_abdominis", "transversus_abdominis"],
    s: ["external_obliques", "internal_obliques"],
  },
};

/** One resolver per group: the nodes a name says the group stands for here, or null. */
type Resolver = (name: string, role: "primary" | "secondary") => readonly string[] | null;

const has = (name: string, pattern: RegExp) => pattern.test(name);

const PRESS = /press|push.?up|dip|jerk|thruster|floor press|svend|landmine/i;
const PULL = /row|pull|chin|pulldown|face pull|deadlift|clean|snatch|swing|shrug/i;
const VASTI = ["vastus_lateralis", "vastus_medialis", "vastus_intermedius"] as const;
const SEMIS = ["semitendinosus", "semimembranosus"] as const;

const RESOLVERS: Partial<Record<string, Resolver>> = {
  shoulders: (name, role) => {
    if (has(name, /external rotation|cuban|car driver/i)) return ["infraspinatus_teres_minor"];
    if (has(name, /internal rotation/i)) return ["subscapularis"];
    if (has(name, /scaption|\bY.?raise/i)) return ["side_delt", "supraspinatus"];
    if (
      has(
        name,
        /rear|reverse fl|reverse.*fly|face pull|pull.?apart|bent.over.*(raise|lateral|fly)|back fl|posterior/i,
      )
    )
      return ["rear_delt"];
    if (has(name, /lateral|side raise|upright row|side.?lateral|deltoid raise|iron cross/i))
      return ["side_delt"];
    if (has(name, /front.*raise|front plate|front cable|front dumbbell|front two/i))
      return ["front_delt"];
    if (has(name, /arnold|military|overhead press|shoulder press|push press|jerk|handstand|pike/i))
      return role === "primary" ? ["front_delt", "side_delt"] : ["front_delt"];
    if (role === "secondary" && has(name, PRESS)) return ["front_delt"];
    if (role === "secondary" && has(name, /row|pull|fly|face/i)) return ["rear_delt"];
    if (role === "secondary" && has(name, /fly|flye|crossover|pec deck/i)) return ["front_delt"];
    if (has(name, /incline shoulder raise/i)) return ["serratus_anterior"];
    return ["deltoid"];
  },
  chest: (name) => {
    if (has(name, /incline/i)) return ["upper_chest"];
    if (has(name, /decline|dip/i)) return ["lower_chest"];
    if (has(name, /low.?to.?high|low cable|low pulley/i)) return ["upper_chest"];
    if (has(name, /high.?to.?low|high cable|high pulley/i)) return ["lower_chest"];
    if (has(name, /pullover/i)) return ["lower_chest"];
    if (
      has(name, /bench press|push.?up|chest press|fly|flye|crossover|pec deck|floor press|svend/i)
    )
      return ["lower_chest", "upper_chest"];
    return ["pectoralis_major"];
  },
  triceps: (name) => {
    if (
      has(
        name,
        /overhead|french|skull|lying.*extension|ez.?bar.*extension|tate|incline.*extension|behind.*head/i,
      )
    )
      return ["triceps_long"];
    if (has(name, /pushdown|push.?down|kickback|kick.?back/i))
      return ["triceps_lateral", "triceps_medial"];
    if (has(name, PRESS)) return ["triceps_lateral", "triceps_medial", "triceps_long"];
    return ["triceps_brachii"];
  },
  biceps: (name) => {
    if (has(name, /hammer|reverse|zottman|cross.?body/i)) return ["brachialis"];
    if (has(name, /curl/i)) return ["biceps_brachii"];
    if (has(name, PULL)) return ["biceps_brachii", "brachialis"];
    return ["biceps_brachii"];
  },
  forearms: (name) => {
    if (has(name, /reverse.*curl|hammer|zottman/i)) return ["brachioradialis"];
    if (has(name, /wrist curl|palms.?up|finger|plate pinch|gripper/i) && !has(name, /reverse/i))
      return ["wrist_flexors"];
    if (has(name, /reverse wrist|wrist extension|palms.?down/i)) return ["wrist_extensors"];
    if (has(name, /pronat|supinat|wrist roller|wrist rotation/i)) return ["pronators_supinator"];
    if (has(name, /curl/i)) return ["brachioradialis", "wrist_flexors"];
    if (
      has(
        name,
        /farmer|carry|hang|deadlift|shrug|row|pull|grip|towel|clean|snatch|stone|keg|load|tire|rope|chin|muscle up|drag|squeeze|wheel|bell/i,
      )
    )
      return ["finger_flexors"];
    return null;
  },
  traps: (name) => {
    if (has(name, /shrug|upright row|farmer|carry|clean|snatch|high pull/i)) return ["upper_traps"];
    if (has(name, /deadlift|rack pull|stone|keg|load|tire|yoke|stairs|rickshaw/i))
      return ["upper_traps", "middle_traps"];
    if (has(name, /scaption/i)) return ["upper_traps", "lower_traps"];
    if (has(name, /face pull|row|rear|reverse fl|pull.?apart/i)) return ["middle_traps"];
    if (has(name, /\bY.?raise|prone|pulldown|pull.?up|chin/i)) return ["lower_traps"];
    if (has(name, /press|jerk|raise/i)) return ["upper_traps"];
    return null;
  },
  "middle back": () => ["rhomboids"],
  lats: (name) => {
    if (has(name, /straight.?arm|pullover/i)) return ["latissimus_dorsi", "teres_major"];
    return ["latissimus_dorsi"];
  },
  "lower back": (name) => {
    if (has(name, /side bend|suitcase|quadratus/i)) return ["quadratus_lumborum"];
    return ["erector_spinae"];
  },
  abdominals: (name, role) => {
    if (
      has(
        name,
        /oblique|twist|side|woodchop|wood chop|russian|windmill|pallof|rotation|saxon|bicycle/i,
      )
    )
      return ["external_obliques", "internal_obliques"];
    if (has(name, /vacuum|dead bug|hollow/i)) return ["transversus_abdominis"];
    if (has(name, /leg raise|knee raise|leg lift|flutter|scissor|v.?up|jackknife/i))
      return ["rectus_abdominis", "iliopsoas"];
    if (has(name, /plank|ab roll|rollout|wheel/i))
      return ["rectus_abdominis", "transversus_abdominis"];
    if (has(name, /pull.?in|hip raise|knee|pike|butt.?up|cocoon|elbow to knee|heel touch/i))
      return ["rectus_abdominis", "iliopsoas"];
    if (has(name, /crunch|sit.?up|situp|ab /i)) return ["rectus_abdominis"];
    if (role === "secondary") return ["rectus_abdominis", "transversus_abdominis"];
    return null;
  },
  quadriceps: (name, role) => {
    if (has(name, /hip flexion/i)) return ["rectus_femoris"];
    if (has(name, /leg extension|sissy|reverse nordic/i)) return ["rectus_femoris", ...VASTI];
    if (role === "secondary") return [...VASTI];
    if (
      has(
        name,
        /squat|lunge|split|step.?up|leg press|hack|pistol|wall sit|thruster|clean|deadlift|jerk/i,
      )
    )
      return [...VASTI];
    if (
      has(
        name,
        /jump|hop|bound|sprint|sled|skip|leap|drag|shuffle|climber|butt kick|push.?off|snatch|tire|yoke|load|wheel/i,
      )
    )
      return ["rectus_femoris", ...VASTI];
    return null;
  },
  hamstrings: (name) => {
    if (has(name, /leg curl|hamstring curl|nordic|glute.?ham|ball.*curl/i))
      return ["biceps_femoris_long", "biceps_femoris_short", ...SEMIS];
    if (
      has(
        name,
        /rdl|stiff.?leg|rack pull|leg press|hamstring slide|manual hamstring|deadlift|good.?morning|hip thrust|bridge|swing|hyperextension|back extension|pull.?through|clean|snatch/i,
      )
    )
      return ["biceps_femoris_long", ...SEMIS];
    if (
      has(
        name,
        /squat|lunge|split|step.?up|jump|hop|bound|sprint|sled|skip|leap|drag|butt kick|kickback|hip (extension|lift)|stone|keg|tire|windmill/i,
      )
    )
      return ["biceps_femoris_long", ...SEMIS];
    return null;
  },
  glutes: (name) => {
    if (
      has(
        name,
        /abduct|clam|side.?lying leg|lateral walk|band walk|monster walk|fire hydrant|hip circle/i,
      )
    )
      return ["gluteus_medius", "gluteus_minimus"];
    return ["gluteus_maximus"];
  },
  abductors: () => ["gluteus_medius", "gluteus_minimus"],
  adductors: (name) => {
    if (has(name, /adduct|copenhagen|sumo|groin/i))
      return ["adductor_magnus", "adductor_longus", "adductor_brevis", "pectineus", "gracilis"];
    return ["adductor_magnus"];
  },
  calves: (name) => {
    if (has(name, /seated|bent.?knee|donkey/i) && has(name, /calf/i))
      return has(name, /seated|bent.?knee/i) ? ["soleus"] : ["gastrocnemius", "soleus"];
    if (has(name, /tibialis|toe raise|dorsiflex|shin/i)) return ["tibialis_anterior"];
    return ["gastrocnemius", "soleus"];
  },
  neck: (name) => {
    if (has(name, /extension|rear|back|behind|face down|harness/i)) return ["neck_extensors"];
    if (has(name, /flexion|front|forward|face up/i))
      return ["sternocleidomastoid", "deep_neck_flexors"];
    if (has(name, /side|lateral/i)) return ["scalenes", "sternocleidomastoid"];
    return null;
  },
};

/**
 * Muscles upstream leaves out of whole families of lifts. free-exercise-db
 * tags most rows "middle back" alone, but a row is a lats, middle traps and
 * rhomboids lift; vertical pulls also work teres major and the lower traps.
 */
const AUGMENTS: readonly (Tags & { match: RegExp; skip?: RegExp })[] = [
  {
    match: /\brows?\b/i,
    skip: /upright|rear/i,
    p: ["latissimus_dorsi", "middle_traps", "rhomboids"],
    s: ["rear_delt", "biceps_brachii"],
  },
  {
    match: /pull.?up|chin.?up|pulldown/i,
    p: ["latissimus_dorsi"],
    s: ["teres_major", "lower_traps"],
  },
];

export interface TargetInput {
  slug: string;
  name: string;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
}

export interface TargetResult {
  primaryTargets: string[];
  secondaryTargets: string[];
  /** How the tags were set: hand-tagged, by name rules, or left at group level. */
  source: "staple" | "rules" | "groups";
}

/** Drops a node tagged both ways (primary wins) and duplicates. */
function tidy(primary: readonly string[], secondary: readonly string[]): MuscleTargets {
  const p = [...new Set(primary)];
  return {
    primaryTargets: p,
    secondaryTargets: [...new Set(secondary)].filter((id) => !p.includes(id)),
  };
}

/** The muscle tree tags for one catalog exercise. */
export function targetsFor(input: TargetInput): TargetResult {
  const staple = STAPLE_TARGETS[input.slug];
  if (staple) {
    const tags = tidy(staple.p, staple.s ?? []);
    return {
      ...tags,
      primaryTargets: [...tags.primaryTargets],
      secondaryTargets: [...tags.secondaryTargets],
      source: "staple",
    };
  }
  let resolvedAll = true;
  const resolve = (group: string, role: "primary" | "secondary") => {
    const nodes = RESOLVERS[group]?.(input.name, role) ?? null;
    if (!nodes) resolvedAll = false;
    return nodes ?? [group];
  };
  const extra = AUGMENTS.filter(
    (augment) => augment.match.test(input.name) && !augment.skip?.test(input.name),
  );
  const tags = tidy(
    [
      ...input.primaryMuscles.flatMap((group) => resolve(group, "primary")),
      ...extra.flatMap((augment) => augment.p),
    ],
    [
      ...input.secondaryMuscles.flatMap((group) => resolve(group, "secondary")),
      ...extra.flatMap((augment) => augment.s ?? []),
    ],
  );
  return {
    primaryTargets: [...tags.primaryTargets],
    secondaryTargets: [...tags.secondaryTargets],
    source: resolvedAll ? "rules" : "groups",
  };
}

/**
 * Re-tags a seed row: node tags from `targetsFor`, group tags derived from
 * them. Throws on a tag the tree rejects, so a typo fails the seed loudly.
 */
export function withTargets(row: SeedExercise): SeedExercise {
  const input = {
    slug: row.slug,
    name: row.name,
    primaryMuscles: row.primaryMuscles ?? [],
    secondaryMuscles: row.secondaryMuscles ?? [],
  };
  const { primaryTargets, secondaryTargets } = targetsFor(input);
  const error = muscleTargetsError({ primaryTargets, secondaryTargets });
  if (error) throw new Error(`${row.slug}: ${error}`);
  const groups = groupTagsFromTargets({ primaryTargets, secondaryTargets });
  return { ...row, ...groups, primaryTargets, secondaryTargets };
}
