import { existsSync, readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";

/** Marker file written beside SKILL.md for user-defined skills only. */
export const CUSTOM_SKILL_MARKER_FILENAME = ".weworker-custom-skill.json";
export const CUSTOM_SKILL_KIND = "custom";

export function buildCustomSkillMarker({ siteId, skillId, skillName }) {
  return {
    kind: CUSTOM_SKILL_KIND,
    version: 1,
    siteId: siteId || "",
    skillId: skillId || "",
    skillName: skillName || "",
  };
}

export async function writeCustomSkillMarker(skillDir, payload) {
  const markerPath = join(skillDir, CUSTOM_SKILL_MARKER_FILENAME);
  await writeFile(
    markerPath,
    `${JSON.stringify(buildCustomSkillMarker(payload), null, 2)}\n`,
    "utf-8",
  );
}

export function readCustomSkillMarker(skillDir) {
  const markerPath = join(skillDir, CUSTOM_SKILL_MARKER_FILENAME);
  if (!existsSync(markerPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf-8"));
    if (parsed?.kind !== CUSTOM_SKILL_KIND) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isCustomSkillDirectory(skillDir) {
  return readCustomSkillMarker(skillDir) !== null;
}
