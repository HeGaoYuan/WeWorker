import { join } from "path";

import {

  DEFAULT_SKILLS_DIR,

  formatSkillPathForDisplay,

  getCustomSkillInstallDir,

} from "./custom-skill-paths.js";



const STATIC_VARIABLE_DEFS = [

  { key: "site.id", description: "当前站点 ID" },

  { key: "site.name", description: "当前站点名称" },

  { key: "site.description", description: "站点简介" },

  { key: "skill.name", description: "当前 skill 标识" },

  { key: "skill.description", description: "当前 skill 描述" },

  { key: "skill.path", description: "当前 skill 安装目录（资源文件所在目录）" },

];



function resourceBasename(relativePath) {

  const parts = String(relativePath || "").replace(/\\/g, "/").split("/").filter(Boolean);

  return parts[parts.length - 1] || relativePath || "file";

}



function buildPlaceholderMap({ manifest, skill, skillsDir = DEFAULT_SKILLS_DIR }) {

  const map = new Map();

  const site = {

    id: manifest?.id || "",

    name: manifest?.name || "",

    description: manifest?.description || "",

  };

  const skillInfo = {

    name: skill?.name || "",

    description: skill?.description || "",

  };

  const skillPath = skillInfo.name

    ? formatSkillPathForDisplay(getCustomSkillInstallDir(skillsDir, skillInfo.name))

    : "";



  for (const def of STATIC_VARIABLE_DEFS) {

    if (def.key === "skill.path") {

      map.set(def.key, skillPath);

      continue;

    }

    const [group, field] = def.key.split(".");

    const source = group === "site" ? site : skillInfo;

    map.set(def.key, String(source?.[field] || ""));

  }



  for (const resource of skill?.resources || []) {

    if (resource.is_directory) continue;

    const relativePath = String(resource.relativePath || "").replace(/\\/g, "/");

    if (!relativePath) continue;

    const key = `resource.${resourceBasename(relativePath)}`;

    map.set(key, skillPath ? `${skillPath}${relativePath}` : `./${relativePath}`);

  }



  return map;

}



export function resolveCustomSkillPlaceholders(markdown, context) {

  const map = buildPlaceholderMap(context);

  return String(markdown || "").replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {

    const key = String(rawKey || "").trim();

    if (!key || !map.has(key)) return match;

    const value = map.get(key);

    return value === undefined || value === null ? match : String(value);

  });

}



export { STATIC_VARIABLE_DEFS, buildPlaceholderMap };
