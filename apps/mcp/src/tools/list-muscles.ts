import { MUSCLE_TREE, type MuscleTreeNode } from "@jim/core";

interface MuscleNodeOut {
  id: string;
  label: string;
  children?: MuscleNodeOut[];
}

function subtree(node: MuscleTreeNode): MuscleNodeOut {
  const children = MUSCLE_TREE.filter((child) => child.parent === node.id).map(subtree);
  return { id: node.id, label: node.label, ...(children.length > 0 && { children }) };
}

/** The muscle tree (group → muscle → head) whose ids exercises are tagged with. */
export function listMuscles() {
  return {
    groups: MUSCLE_TREE.filter((node) => node.parent === null).map(subtree),
  };
}
