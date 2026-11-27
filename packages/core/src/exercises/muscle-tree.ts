import { MUSCLES, type Muscle } from "./muscles";

/**
 * The muscle tree (issue #874): group → muscle → head. Groups are the flat
 * `MUSCLES` list Simple mode shows; muscles are the anatomical muscles inside
 * each group; heads only exist where training can bias one part of a muscle
 * over another (delt heads, trap regions, rotator cuff, upper vs lower pec,
 * triceps heads, biceps femoris heads). Detail no exercise can isolate
 * (rhomboid major vs minor, the erector columns) is named in a label, never
 * tagged. Full reasoning and sources: reports/muscle-tree-granularity.
 *
 * An exercise is tagged with nodes at any depth (`primaryTargets`,
 * `secondaryTargets`). Its group tags are derived from them
 * (`groupTagsFromTargets`), so every reader of the group tags keeps working.
 */
export interface MuscleTreeNode {
  /** The group's own name for a group; a snake_case id below that. */
  id: string;
  label: string;
  /** Null for a group. */
  parent: string | null;
}

type Child = readonly [id: string, label: string, heads?: readonly (readonly [string, string])[]];

/** Each group's muscles, and each muscle's heads, in display order. */
const TREE: Readonly<Record<Muscle, readonly Child[]>> = {
  neck: [
    ["sternocleidomastoid", "Sternocleidomastoid"],
    ["scalenes", "Scalenes"],
    ["deep_neck_flexors", "Deep neck flexors"],
    ["neck_extensors", "Neck extensors"],
  ],
  traps: [
    [
      "trapezius",
      "Trapezius",
      [
        ["upper_traps", "Upper traps"],
        ["middle_traps", "Middle traps"],
        ["lower_traps", "Lower traps"],
      ],
    ],
    ["levator_scapulae", "Levator scapulae"],
  ],
  "middle back": [["rhomboids", "Rhomboids"]],
  lats: [
    ["latissimus_dorsi", "Latissimus dorsi"],
    ["teres_major", "Teres major"],
  ],
  "lower back": [
    ["erector_spinae", "Erector spinae"],
    ["multifidus", "Multifidus"],
    ["quadratus_lumborum", "Quadratus lumborum"],
  ],
  shoulders: [
    [
      "deltoid",
      "Deltoid",
      [
        ["front_delt", "Front delt"],
        ["side_delt", "Side delt"],
        ["rear_delt", "Rear delt"],
      ],
    ],
    [
      "rotator_cuff",
      "Rotator cuff",
      [
        ["supraspinatus", "Supraspinatus"],
        ["infraspinatus_teres_minor", "Infraspinatus & teres minor"],
        ["subscapularis", "Subscapularis"],
      ],
    ],
  ],
  chest: [
    [
      "pectoralis_major",
      "Pectoralis major",
      [
        ["upper_chest", "Upper chest"],
        ["lower_chest", "Mid & lower chest"],
      ],
    ],
    ["pectoralis_minor", "Pectoralis minor"],
    ["serratus_anterior", "Serratus anterior"],
  ],
  biceps: [
    ["biceps_brachii", "Biceps brachii"],
    ["brachialis", "Brachialis"],
    ["coracobrachialis", "Coracobrachialis"],
  ],
  triceps: [
    [
      "triceps_brachii",
      "Triceps brachii",
      [
        ["triceps_long", "Long head"],
        ["triceps_lateral", "Lateral head"],
        ["triceps_medial", "Medial head"],
      ],
    ],
  ],
  forearms: [
    ["brachioradialis", "Brachioradialis"],
    ["wrist_flexors", "Wrist flexors"],
    ["finger_flexors", "Grip"],
    ["wrist_extensors", "Wrist extensors"],
    ["pronators_supinator", "Pronators & supinator"],
  ],
  abdominals: [
    ["rectus_abdominis", "Rectus abdominis"],
    ["external_obliques", "External obliques"],
    ["internal_obliques", "Internal obliques"],
    ["transversus_abdominis", "Transversus abdominis"],
  ],
  "hip flexors": [
    ["iliopsoas", "Iliopsoas"],
    ["sartorius", "Sartorius"],
  ],
  glutes: [
    ["gluteus_maximus", "Gluteus maximus"],
    ["gluteus_medius", "Gluteus medius"],
    ["gluteus_minimus", "Gluteus minimus"],
  ],
  // Retired as a tag target: the hip abductors are gluteus medius and
  // minimus, which live under glutes. Kept as a group so old rows and
  // injuries still read.
  abductors: [],
  adductors: [
    ["adductor_magnus", "Adductor magnus"],
    ["adductor_longus", "Adductor longus"],
    ["adductor_brevis", "Adductor brevis"],
    ["pectineus", "Pectineus"],
    ["gracilis", "Gracilis"],
  ],
  quadriceps: [
    ["rectus_femoris", "Rectus femoris"],
    ["vastus_lateralis", "Vastus lateralis"],
    ["vastus_medialis", "Vastus medialis"],
    ["vastus_intermedius", "Vastus intermedius"],
  ],
  hamstrings: [
    [
      "biceps_femoris",
      "Biceps femoris",
      [
        ["biceps_femoris_long", "Long head"],
        ["biceps_femoris_short", "Short head"],
      ],
    ],
    ["semitendinosus", "Semitendinosus"],
    ["semimembranosus", "Semimembranosus"],
  ],
  calves: [
    ["gastrocnemius", "Gastrocnemius"],
    ["soleus", "Soleus"],
    ["tibialis_anterior", "Tibialis anterior"],
  ],
};

function buildNodes(): MuscleTreeNode[] {
  const nodes: MuscleTreeNode[] = [];
  for (const group of MUSCLES) {
    nodes.push({ id: group, label: group.charAt(0).toUpperCase() + group.slice(1), parent: null });
    for (const [id, label, heads] of TREE[group]) {
      nodes.push({ id, label, parent: group });
      for (const [headId, headLabel] of heads ?? []) {
        nodes.push({ id: headId, label: headLabel, parent: id });
      }
    }
  }
  return nodes;
}

/** Every node, groups first in `MUSCLES` order, each followed by its subtree. */
export const MUSCLE_TREE: readonly MuscleTreeNode[] = buildNodes();

/** Every taggable id: groups, muscles and heads. The `muscle_target` enum's values. */
export const MUSCLE_TARGETS: readonly string[] = MUSCLE_TREE.map((node) => node.id);

const BY_ID = new Map(MUSCLE_TREE.map((node) => [node.id, node]));

export function isMuscleTarget(id: string): boolean {
  return BY_ID.has(id);
}

export function muscleTreeNode(id: string): MuscleTreeNode | undefined {
  return BY_ID.get(id);
}

/** The node and its ancestors, nearest first, ending at its group. */
export function muscleTargetPath(id: string): string[] {
  const path: string[] = [];
  let node = BY_ID.get(id);
  while (node) {
    path.push(node.id);
    node = node.parent ? BY_ID.get(node.parent) : undefined;
  }
  return path;
}

/** The group a node sits in (a group is its own). */
export function groupOfTarget(id: string): Muscle | undefined {
  const path = muscleTargetPath(id);
  return path[path.length - 1] as Muscle | undefined;
}

/** A node's direct children, in display order. */
export function muscleTargetChildren(id: string): MuscleTreeNode[] {
  return MUSCLE_TREE.filter((node) => node.parent === id);
}

export interface MuscleTargets {
  primaryTargets: readonly string[];
  secondaryTargets: readonly string[];
}

/**
 * How much one set counts toward every node it reaches: each node takes the
 * highest weight tagged anywhere beneath it (itself included), 1 for a
 * primary tag and `secondaryWeight` for a secondary one. A set hitting two
 * heads of one muscle still counts once for that muscle, so no node ever
 * counts more than its parent, and a parent is not the sum of its children.
 */
export function targetWeights(
  targets: MuscleTargets,
  primaryWeight: number,
  secondaryWeight: number,
): Map<string, number> {
  const weights = new Map<string, number>();
  const add = (id: string, weight: number) => {
    for (const node of muscleTargetPath(id)) {
      if ((weights.get(node) ?? 0) < weight) weights.set(node, weight);
    }
  };
  for (const id of targets.secondaryTargets) add(id, secondaryWeight);
  for (const id of targets.primaryTargets) add(id, primaryWeight);
  return weights;
}

/**
 * The group tags an exercise's node tags stand for: a group is primary when
 * anything under it is primary, secondary when only secondary tags reach it.
 */
export function groupTagsFromTargets(targets: MuscleTargets): {
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
} {
  const weights = targetWeights(targets, 1, 0.5);
  const primaryMuscles: Muscle[] = [];
  const secondaryMuscles: Muscle[] = [];
  for (const group of MUSCLES) {
    const weight = weights.get(group);
    if (weight === 1) primaryMuscles.push(group);
    else if (weight !== undefined) secondaryMuscles.push(group);
  }
  return { primaryMuscles, secondaryMuscles };
}

/**
 * Why a set of node tags is invalid, or null when it's fine: every id is in
 * the tree, none is tagged both primary and secondary, and none is tagged
 * alongside its own ancestor (the ancestor says nothing the child doesn't).
 */
export function muscleTargetsError(targets: MuscleTargets): string | null {
  const all = [...targets.primaryTargets, ...targets.secondaryTargets];
  const unknown = all.filter((id) => !isMuscleTarget(id));
  if (unknown.length > 0) return `Unknown muscle: ${unknown.join(", ")}`;
  const both = targets.primaryTargets.filter((id) => targets.secondaryTargets.includes(id));
  if (both.length > 0) return `Tagged both primary and secondary: ${both.join(", ")}`;
  for (const id of targets.primaryTargets) {
    const ancestors = muscleTargetPath(id).slice(1);
    const redundant = ancestors.find((ancestor) => targets.primaryTargets.includes(ancestor));
    if (redundant) return `${id} is already inside ${redundant}`;
  }
  return null;
}

const sameGroups = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((group) => b.includes(group));

/**
 * Editing an exercise's group tags directly (the app's muscle picker, the
 * MCP's primaryMuscles) takes it back to group level: its node tags would
 * otherwise contradict the groups. Returns the node tags to save with the
 * edit, empty when the groups changed, or nothing when they didn't.
 */
export function targetsAfterGroupEdit(
  current: { primaryMuscles: readonly string[]; secondaryMuscles: readonly string[] },
  primaryMuscles: readonly string[],
  secondaryMuscles: readonly string[],
): { primaryTargets: string[]; secondaryTargets: string[] } | Record<string, never> {
  if (
    sameGroups(current.primaryMuscles, primaryMuscles) &&
    sameGroups(current.secondaryMuscles, secondaryMuscles)
  ) {
    return {};
  }
  return { primaryTargets: [], secondaryTargets: [] };
}

/** Whether `id` is `ancestor` or sits anywhere beneath it. */
export function isWithinTarget(id: string, ancestor: string): boolean {
  return muscleTargetPath(id).includes(ancestor);
}

/**
 * The tree muscle picker's tap (issue #879) on `id` in one list (`picked`),
 * with `other` the other list (primary vs secondary):
 * - a group already in use clears everything under it from this list;
 * - a picked muscle or head is dropped, and when nothing else in its group is
 *   left the group itself stays tagged, so the group doesn't vanish mid-edit;
 * - anything else is picked, replacing its own ancestors and descendants in
 *   this list, and leaves the other list (with what sits inside it there).
 */
export function pickTarget(
  picked: readonly string[],
  other: readonly string[],
  id: string,
): { picked: string[]; other: string[] } {
  const group = groupOfTarget(id);
  if (!group) return { picked: [...picked], other: [...other] };
  const isGroup = group === id;
  if (isGroup && picked.some((node) => isWithinTarget(node, id))) {
    return { picked: picked.filter((node) => !isWithinTarget(node, id)), other: [...other] };
  }
  if (!isGroup && picked.includes(id)) {
    const rest = picked.filter((node) => node !== id);
    const groupLeft = rest.some((node) => isWithinTarget(node, group));
    return { picked: groupLeft ? rest : [...rest, group], other: [...other] };
  }
  return {
    picked: [
      ...picked.filter((node) => !isWithinTarget(node, id) && !isWithinTarget(id, node)),
      id,
    ],
    other: other.filter((node) => !isWithinTarget(node, id)),
  };
}

/**
 * What the tree picker's two lists save as (issue #879): node tags with the
 * groups derived from them, or plain group tags with no node tags when
 * nothing deeper than a group was picked.
 */
export function targetsToSave(
  primary: readonly string[],
  secondary: readonly string[],
): {
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  primaryTargets: string[];
  secondaryTargets: string[];
} {
  const groupsOnly = [...primary, ...secondary].every((id) => groupOfTarget(id) === id);
  const groups = groupTagsFromTargets({ primaryTargets: primary, secondaryTargets: secondary });
  return groupsOnly
    ? { ...groups, primaryTargets: [], secondaryTargets: [] }
    : { ...groups, primaryTargets: [...primary], secondaryTargets: [...secondary] };
}
