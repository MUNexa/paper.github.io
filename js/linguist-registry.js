const LINGUIST_REGISTRY = {
  "ABAP": { aliases: ["abap"], extensions: [".abap"], type: "programming" },
  "ActionScript": { aliases: ["as", "actionscript"], extensions: [".as", ".mxml"], type: "programming" },
  "Ada": { aliases: ["ada"], extensions: [".adb", ".ads", ".ada"], type: "programming" },
  "Agda": { aliases: ["agda"], extensions: [".agda"], type: "programming" },
  "Assembly": { aliases: ["asm", "nasm", "gas"], extensions: [".asm", ".s", ".S"], type: "programming" },
  "Bash": { aliases: ["bash", "sh", "zsh"], extensions: [".sh", ".bash", ".zsh"], type: "programming" },
  "C": { aliases: ["c"], extensions: [".c", ".h"], type: "programming" },
  "C#": { aliases: ["csharp", "cs"], extensions: [".cs"], type: "programming" },
  "C++": { aliases: ["cpp", "c++"], extensions: [".cc", ".cpp", ".cxx", ".h", ".hpp"], type: "programming" },
  "Clojure": { aliases: ["clj", "cljc", "cljs"], extensions: [".clj", ".cljc", ".cljs"], type: "programming" },
  "CSS": { aliases: ["css"], extensions: [".css"], type: "markup" },
  "Dart": { aliases: ["dart"], extensions: [".dart"], type: "programming" },
  "Dockerfile": { aliases: ["dockerfile", "docker"], extensions: [".dockerfile"], filenames: ["Dockerfile"], type: "config" },
  "Elixir": { aliases: ["ex", "elixir"], extensions: [".ex", ".exs"], type: "programming" },
  "Elm": { aliases: ["elm"], extensions: [".elm"], type: "programming" },
  "Erlang": { aliases: ["erlang", "erl"], extensions: [".erl", ".hrl"], type: "programming" },
  "F#": { aliases: ["fsharp", "fs"], extensions: [".fs", ".fsx", ".fsi"], type: "programming" },
  "Fortran": { aliases: ["fortran", "f90"], extensions: [".f90", ".f95", ".for", ".f"], type: "programming" },
  "Go": { aliases: ["go"], extensions: [".go"], type: "programming" },
  "GraphQL": { aliases: ["graphql", "gql"], extensions: [".graphql", ".gql"], type: "markup" },
  "Groovy": { aliases: ["groovy"], extensions: [".groovy", ".gvy"], type: "programming" },
  "Haml": { aliases: ["haml"], extensions: [".haml"], type: "markup" },
  "Handlebars": { aliases: ["hbs", "handlebars"], extensions: [".hbs", ".handlebars"], type: "markup" },
  "Haskell": { aliases: ["haskell", "hs"], extensions: [".hs", ".lhs"], type: "programming" },
  "HTML": { aliases: ["html", "htm"], extensions: [".html", ".htm"], type: "markup" },
  "Java": { aliases: ["java"], extensions: [".java"], type: "programming" },
  "JavaScript": { aliases: ["js", "javascript"], extensions: [".js", ".mjs", ".cjs"], type: "programming" },
  "JSON": { aliases: ["json"], extensions: [".json"], type: "data" },
  "Julia": { aliases: ["julia"], extensions: [".jl"], type: "programming" },
  "Kotlin": { aliases: ["kotlin", "kt"], extensions: [".kt", ".kts"], type: "programming" },
  "LaTeX": { aliases: ["latex"], extensions: [".tex", ".sty"], type: "markup" },
  "Lua": { aliases: ["lua"], extensions: [".lua"], type: "programming" },
  "Markdown": { aliases: ["md", "markdown"], extensions: [".md", ".markdown"], type: "markup" },
  "MATLAB": { aliases: ["matlab", "m"], extensions: [".m"], type: "programming" },
  "Nim": { aliases: ["nim"], extensions: [".nim"], type: "programming" },
  "OCaml": { aliases: ["ocaml", "ml"], extensions: [".ml", ".mli"], type: "programming" },
  "Pascal": { aliases: ["pascal", "pas"], extensions: [".pas", ".pp"], type: "programming" },
  "Perl": { aliases: ["perl", "pl"], extensions: [".pl", ".pm"], type: "programming" },
  "PHP": { aliases: ["php"], extensions: [".php", ".phtml"], type: "programming" },
  "PowerShell": { aliases: ["powershell", "ps"], extensions: [".ps1", ".psm1"], type: "programming" },
  "Python": { aliases: ["python", "py"], extensions: [".py"], type: "programming" },
  "R": { aliases: ["r"], extensions: [".r", ".rdata"], type: "programming" },
  "Ruby": { aliases: ["ruby", "rb"], extensions: [".rb"], type: "programming" },
  "Rust": { aliases: ["rust", "rs"], extensions: [".rs"], type: "programming" },
  "Scala": { aliases: ["scala"], extensions: [".scala", ".sc"], type: "programming" },
  "Shell": { aliases: ["shell"], extensions: [".sh", ".bash"], type: "programming" },
  "SQL": { aliases: ["sql"], extensions: [".sql"], type: "data" },
  "Svelte": { aliases: ["svelte"], extensions: [".svelte"], type: "markup" },
  "Swift": { aliases: ["swift"], extensions: [".swift"], type: "programming" },
  "TypeScript": { aliases: ["ts", "typescript"], extensions: [".ts", ".tsx"], type: "programming" },
  "Vue": { aliases: ["vue"], extensions: [".vue"], type: "markup" },
  "XML": { aliases: ["xml"], extensions: [".xml"], type: "markup" },
  "YAML": { aliases: ["yaml", "yml"], extensions: [".yaml", ".yml"], type: "data" },
  "Zig": { aliases: ["zig"], extensions: [".zig"], type: "programming" },
  "Toml": { aliases: ["toml"], extensions: [".toml"], type: "data" },
  "INI": { aliases: ["ini"], extensions: [".ini"], type: "config" },
  "Gitignore": { aliases: ["gitignore"], extensions: [".gitignore"], type: "config" },
  "Plain text": { aliases: ["txt", "text"], extensions: [".txt"], type: "text" },
  "CSV": { aliases: ["csv"], extensions: [".csv"], type: "data" },
  "TSV": { aliases: ["tsv"], extensions: [".tsv"], type: "data" }
};

function getLanguageFromFileName(name) {
  const lower = String(name || "").toLowerCase();
  const fileExt = lower.includes(".") ? lower.substring(lower.lastIndexOf(".")) : "";
  const fileName = lower.split(/[\\/]/).pop() || "";

  const byName = Object.entries(LINGUIST_REGISTRY).find(([lang, info]) => {
    const names = (info.filenames || []).map((f) => String(f).toLowerCase());
    return names.includes(fileName);
  });
  if (byName) return byName[0];

  const byExt = Object.entries(LINGUIST_REGISTRY).find(([lang, info]) => {
    const exts = (info.extensions || []).map((e) => String(e).toLowerCase());
    return exts.includes(fileExt);
  });
  if (byExt) return byExt[0];

  return "Plain text";
}

function getLanguageChoices() {
  return Object.keys(LINGUIST_REGISTRY).sort();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightCode(code, languageName) {
  let html = escapeHtml(code || "");
  const patterns = [
    { regex: /(\/\/.*$|#.*$|--.*$|\/\*[\s\S]*?\*\/)/gm, cls: "comment" },
    { regex: /("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`)/g, cls: "string" },
    { regex: /(\b\d+(\.\d+)?\b)/g, cls: "number" },
    { regex: /(\b(?:function|const|let|var|return|if|else|for|while|switch|case|class|new|import|from|export|async|await|try|catch|throw|break|continue|true|false|null|undefined|package|public|private|protected|extends|implements|interface)\b)/g, cls: "keyword" },
    { regex: /(\b[a-zA-Z_][\w]*\s*(?=\())/g, cls: "function" }
  ];

  for (const p of patterns) {
    html = html.replace(p.regex, (match) => `<span class="${p.cls}">${match}</span>`);
  }

  if (/(html|xml|vue|svelte)/i.test(languageName || "")) {
    html = html.replace(/(&lt;\/?)(([A-Za-z0-9:-]+))/g, "$1<span class='tag'>$2</span>");
    html = html.replace(/([A-Za-z-]+)=(&quot;[^&]*&quot;)/g, '<span class="attribute">$1</span>=$2');
  }

  return html;
}
