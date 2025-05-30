const { readdirSync, readFileSync, writeFileSync } = require("fs");
const { minify } = require("html-minifier-terser");
const { extname, join } = require("path");
const { execSync } = require("child_process");

const OUT_PATH = "out";

const HTML_MINIFIER_CONFIG = {
  collapseBooleanAttributes: true,
  collapseInlineTagWhitespace: true,
  collapseWhitespace: true,
  decodeEntities: true,
  includeAutoGeneratedTags: false,
  minifyJS: true,
  minifyURLs: true,
  processConditionalComments: true,
  processScripts: ["text/html"],
  removeAttributeQuotes: true,
  removeComments: true,
  removeEmptyAttributes: true,
  removeOptionalTags: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  sortAttributes: true,
  sortClassName: true,
  trimCustomFragments: true,
  useShortDoctype: true,
};

const getCommitHash = () => {
  const COMMIT_HASH_LENGTH = 7;
  let commit = "";

  try {
    commit = execSync(`git rev-parse --short=${COMMIT_HASH_LENGTH} HEAD`, {
      cwd: __dirname,
    })
      .toString()
      .trim();
  } catch {
    // Ignore failure to get commit hash from git
  }

  if (!commit) {
    commit =
      process.env.npm_package_gitHead?.slice(0, COMMIT_HASH_LENGTH - 1) ||
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
  }

  return commit;
};

const getRepoUrl = () => {
  let url = "";

  try {
    url = execSync("git config --get remote.origin.url", {
      cwd: __dirname,
    })
      .toString()
      .trim();

    if (url.endsWith(".git")) {
      url = url.slice(0, -4);
    }
  } catch {
    // Ignore failure to get commit hash from git
  }

  return url;
};

const CODE_REPLACE_FUNCTIONS = [
  (html) => html.replace(/<noscript (.*)><\/noscript>/, ""),
  (html) => {
    const [style] = html.match(/<style[\s\S]+>[\s\S]+<\/style>/);

    return html.replace(
      style,
      style.replace(/(?:-ms-[^:;{}]+|[^:;{}]+:-ms-)[^;{}]+;/g, "")
    );
  },
  (html) =>
    html.replace(
      /<script defer src=\/_next\/static\/chunks\/polyfills-[a-zA-Z0-9-_]+.js nomodule=""><\/script>/,
      ""
    ),
  (html) =>
    html.replace(
      /<script id=__NEXT_DATA__ type=application\/json>(.*)<\/script>/,
      `<script id=__NEXT_DATA__ type=application/json>{"buildId":"${getCommitHash() || Date.now()}","page":"/","props":{}}</script>`
    ),
];

readdirSync(OUT_PATH).forEach(async (entry) => {
  if (extname(entry).toLowerCase() === ".html") {
    const fullPath = join(OUT_PATH, entry);
    const html = readFileSync(fullPath);
    let minifiedHtml = await minify(html.toString(), HTML_MINIFIER_CONFIG);

    CODE_REPLACE_FUNCTIONS.forEach((codeFunction) => {
      const changedCode = codeFunction(minifiedHtml);

      if (minifiedHtml === changedCode) {
        throw new Error("Code replacement failed!");
      }

      minifiedHtml = changedCode;
    });

    const repoUrl = getRepoUrl();

    if (repoUrl) {
      minifiedHtml = `<!-- ${repoUrl} -->\n${minifiedHtml}`;
    }

    writeFileSync(fullPath, minifiedHtml);
  }
});
