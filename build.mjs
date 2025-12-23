import fs from "node:fs";
import path from "node:path";
import StyleDictionary from "style-dictionary";
import { register } from "@tokens-studio/sd-transforms";

const TOKENS_FILE = path.resolve("tokens", "solitude-tokens.json");
const OUT_DIR = path.resolve("build");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function mergeByOrder(raw, orderList) {
  const merged = {};
  for (const setName of orderList) {
    const setObj = raw[setName];
    if (!isPlainObject(setObj)) continue;
    deepMerge(merged, setObj);
  }
  return merged;
}

function buildForTheme(raw, theme) {
  const order = raw?.$metadata?.tokenSetOrder ?? [];

  // Regras usando o seu tokenSetOrder:
  // - Sempre inclui: global + primitive/default + semantic-brand/solitude + semantic-spacing/default
  // - Inclui somente a variação do tema para component-color e semantic-color
  // - Inclui breakpoints e typography (desktop + mobile) sempre (não dependem de theme)
  const themedOrder = order.filter((setName) => {
    if (setName === "component-color/light") return theme === "light";
    if (setName === "component-color/dark") return theme === "dark";
    if (setName === "semantic-color/light") return theme === "light";
    if (setName === "semantic-color/dark") return theme === "dark";
    return true; // mantém todos os outros
  });

  return mergeByOrder(raw, themedOrder);
}

async function runStyleDictionary({ mergedFile, theme }) {
  const cssDir = path.join(OUT_DIR, "css");
  const jsonDir = path.join(OUT_DIR, "json");
  ensureDir(cssDir);
  ensureDir(jsonDir);

  const selector = theme === "dark" ? '[data-theme="dark"]' : ":root";

  const sd = new StyleDictionary({
    source: [mergedFile],
    platforms: {
      css: {
        transformGroup: "tokens-studio",
        transforms: ["name/kebab"],
        buildPath: `${cssDir}${path.sep}`,
        files: [
          {
            destination: `variables.${theme}.css`,
            format: "css/variables",
            options: { selector },
          },
        ],
      },
      json: {
        transformGroup: "tokens-studio",
        buildPath: `${jsonDir}${path.sep}`,
        files: [
          {
            destination: `tokens.${theme}.json`,
            format: "json/nested",
          },
        ],
      },
    },
  });

  await sd.buildAllPlatforms();
}

async function main() {
  ensureDir(OUT_DIR);

  const raw = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));

  register(StyleDictionary);

  const themesDir = path.join(OUT_DIR, "themes");
  ensureDir(themesDir);

  // LIGHT
  const mergedLight = buildForTheme(raw, "light");
  const mergedLightFile = path.join(themesDir, "_merged.light.json");
  fs.writeFileSync(
    mergedLightFile,
    JSON.stringify(mergedLight, null, 2),
    "utf8"
  );
  await runStyleDictionary({ mergedFile: mergedLightFile, theme: "light" });

  // DARK
  const mergedDark = buildForTheme(raw, "dark");
  const mergedDarkFile = path.join(themesDir, "_merged.dark.json");
  fs.writeFileSync(mergedDarkFile, JSON.stringify(mergedDark, null, 2), "utf8");
  await runStyleDictionary({ mergedFile: mergedDarkFile, theme: "dark" });

  console.log("✅ Build finalizado:");
  console.log("- build/css/variables.light.css  (:root)");
  console.log('- build/css/variables.dark.css   ([data-theme="dark"])');
  console.log("- build/themes/_merged.light.json");
  console.log("- build/themes/_merged.dark.json");
  console.log("- build/json/tokens.light.json");
  console.log("- build/json/tokens.dark.json");
}

main().catch((err) => {
  console.error("❌ Build falhou:");
  console.error(err);
  process.exit(1);
});
