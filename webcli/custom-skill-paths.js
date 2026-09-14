import { homedir } from "os";
import { join } from "path";

export const DEFAULT_SKILLS_DIR = join(homedir(), ".weworker", ".claude", "skills");

export function sanitizeSkillPathSegment(value) {
  return (value || "custom")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/^\.+$/, "_")
    .trim() || "custom";
}

/** Skill folder name — sibling to webcli-{siteId}, e.g. webcli-custom.send.email */
export function getCustomSkillDirName(skillName) {
  return `webcli-${sanitizeSkillPathSegment(skillName)}`;
}

export function getAdapterSkillDir(skillsDir, siteId) {
  return join(skillsDir || DEFAULT_SKILLS_DIR, `webcli-${siteId}`);
}

/** Installed directory for one custom skill (same level as webcli-mail.qq.com). */
export function getCustomSkillInstallDir(skillsDir, skillName) {
  return join(skillsDir || DEFAULT_SKILLS_DIR, getCustomSkillDirName(skillName));
}

export function formatSkillPathForDisplay(absolutePath) {
  const normalized = String(absolutePath || "").replace(/\\/g, "/");
  if (!normalized) return "";
  const home = homedir().replace(/\\/g, "/");
  const withSlash = normalized.endsWith("/") ? normalized : `${normalized}/`;
  if (withSlash.startsWith(`${home}/`)) {
    return `~${withSlash.slice(home.length)}`;
  }
  return withSlash;
}
