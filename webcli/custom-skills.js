import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CUSTOM_SKILLS_FILE = join(homedir(), ".weworker", "custom-skills.json");
export const CUSTOM_SKILLS_ASSETS_DIR = join(homedir(), ".weworker", "custom-skills-assets");

function sanitizePathSegment(value) {
  return (value || "custom")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/^\.+$/, "_")
    .trim() || "custom";
}

export function getCustomSkillAssetDir(siteId, skillId) {
  return join(CUSTOM_SKILLS_ASSETS_DIR, sanitizePathSegment(siteId), sanitizePathSegment(skillId));
}

function normalizeParam(param) {
  if (!param || typeof param !== "object") return null;
  const name = typeof param.name === "string" ? param.name.trim() : "";
  if (!name) return null;
  return {
    name,
    type: typeof param.type === "string" && param.type.trim() ? param.type.trim() : "string",
    description: typeof param.description === "string" ? param.description : "",
    required: param.required === true,
  };
}

function normalizeResource(resource) {
  if (!resource || typeof resource !== "object") return null;
  const relativePath = typeof resource.relativePath === "string"
    ? resource.relativePath.replace(/\\/g, "/").split("/").filter(Boolean).join("/")
    : "";
  if (!relativePath || relativePath.split("/").some((part) => part === "." || part === "..")) return null;
  return {
    name: typeof resource.name === "string" && resource.name.trim()
      ? resource.name.trim()
      : relativePath.split("/").pop(),
    relativePath,
    is_directory: resource.is_directory === true,
    size: typeof resource.size === "number" ? resource.size : 0,
    modified_at: typeof resource.modified_at === "string" ? resource.modified_at : "",
  };
}

export function buildResourceHint(resource, skillName) {
  const relativePath = resource.relativePath || resource.name || "";
  const normalized = relativePath.replace(/\\/g, "/");
  const fileName = normalized.split("/").filter(Boolean).pop() || resource.name || normalized;
  const skillPath = skillName ? `{{skill.path}}` : "当前 skill 目录";
  if (!normalized.includes("/")) {
    return `本技能所需文件 \`${fileName}\` 位于 ${skillPath} 下。`;
  }
  return `本技能所需文件 \`${fileName}\` 位于 ${skillPath}${normalized} 同级目录结构中。`;
}

function normalizeSkill(skill) {
  if (!skill || typeof skill !== "object") return null;
  const name = typeof skill.name === "string" ? skill.name.trim() : "";
  if (!name) return null;
  const resources = Array.isArray(skill.resources)
    ? skill.resources.map(normalizeResource).filter(Boolean)
    : [];
  return {
    id: typeof skill.id === "string" && skill.id.trim() ? skill.id.trim() : name,
    name,
    description: typeof skill.description === "string" ? skill.description : "",
    params: Array.isArray(skill.parameters)
      ? skill.parameters.map(normalizeParam).filter(Boolean)
      : [],
    markdown: typeof skill.markdown === "string" ? skill.markdown : "",
    resources,
    resourceHints: resources.filter((resource) => resource.is_directory !== true).map((resource) => buildResourceHint(resource, name)),
    promptOnly: true,
  };
}

export function readCustomSkills(siteId) {
  if (!existsSync(CUSTOM_SKILLS_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(CUSTOM_SKILLS_FILE, "utf-8"));
    const list = parsed?.sites?.[siteId];
    return Array.isArray(list)
      ? list.map(normalizeSkill).filter(Boolean).map((skill) => ({
        ...skill,
        assetDir: getCustomSkillAssetDir(siteId, skill.id),
      }))
      : [];
  } catch {
    return [];
  }
}
