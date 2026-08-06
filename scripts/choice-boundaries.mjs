import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SCRIPT_OR_STYLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const APPROVED_STORYBOOK_ASSET_ADAPTERS = new Set([
  "src/career-outfit-characters.ts",
  "src/occupation-characters.ts",
  "src/sprites.ts",
  "src/storybook-characters.ts",
  "src/storybook-pets.ts",
  "src/types.ts",
]);
const PROTECTED_MECHANICS_KEYS = new Set([
  "appearance",
  "accessibility",
  "identity",
  "gender",
  "hairStyleId",
  "hairColorId",
  "clothingPaletteId",
  "heritageStyleId",
  "highContrast",
  "reducedMotion",
  "textScale",
  "screenReaderAnnouncements",
]);
export const PROTECTED_MECHANICS_READ_ALLOWLIST = Object.freeze([
  "src/choice-of-life/app.ts",
  "src/choice-of-life/core/run-factory.ts",
  "src/choice-of-life/core/run-state-codec.ts",
  "src/choice-of-life/core/run-state-fixtures.ts",
  "src/choice-of-life/core/run-state-hash.ts",
  "src/choice-of-life/core/player-preferences.ts",
  "src/choice-of-life/core/adult/content.ts",
  "src/choice-of-life/core/adult/runtime.ts",
  "src/choice-of-life/core/childhood/runtime.ts",
  "src/choice-of-life/platform/adult-session.ts",
  "src/choice-of-life/platform/browser-shell.ts",
  "src/choice-of-life/presentation/adult-view.ts",
  "src/choice-of-life/presentation/character-gallery.ts",
  "src/choice-of-life/presentation/character-system.ts",
  "src/choice-of-life/presentation/childhood-view.ts",
  "src/choice-of-life/presentation/model.ts",
  "src/choice-of-life/presentation/preferences-panel.ts",
]);
const PROTECTED_MECHANICS_READ_ALLOWED = new Set(PROTECTED_MECHANICS_READ_ALLOWLIST);
const FORBIDDEN_PURE_IDENTIFIERS = new Set([
  "window",
  "self",
  "globalThis",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "Date",
  "performance",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "crypto",
  "Math.random",
  "crypto.randomUUID",
  "crypto.getRandomValues",
  "Math",
  "Audio",
  "AudioContext",
  "webkitAudioContext",
  "OffscreenCanvas",
  "Image",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "MutationObserver",
  "ResizeObserver",
  "matchMedia",
  "eval",
  "Function",
  "constructor",
]);
const FORBIDDEN_PRESENTATION_IDENTIFIERS = new Set([
  "window",
  "self",
  "globalThis",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "Date",
  "performance",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "crypto",
  "Math.random",
  "crypto.randomUUID",
  "crypto.getRandomValues",
  "Math",
  "Audio",
  "AudioContext",
  "webkitAudioContext",
  "OffscreenCanvas",
  "Image",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "MutationObserver",
  "ResizeObserver",
  "matchMedia",
  "eval",
  "Function",
  "constructor",
]);

function normalize(file) {
  return file.replaceAll("\\", "/");
}

function filesystemKind(stats) {
  if (stats.isSymbolicLink()) return "symbolic link";
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "regular file";
  return "non-regular entry";
}

function collectFilesRecursive(directory, onUnsupported = () => {}) {
  let rootStats;
  try {
    rootStats = fs.lstatSync(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    onUnsupported(directory, `unreadable entry (${error?.code ?? "unknown"})`);
    return [];
  }
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    onUnsupported(directory, filesystemKind(rootStats));
    return [];
  }
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    onUnsupported(directory, `unreadable directory (${error?.code ?? "unknown"})`);
    return [];
  }
  return entries.flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    let stats;
    try {
      stats = fs.lstatSync(absolute);
    } catch (error) {
      onUnsupported(absolute, `unreadable entry (${error?.code ?? "unknown"})`);
      return [];
    }
    if (stats.isSymbolicLink()) {
      onUnsupported(absolute, "symbolic link");
      return [];
    }
    if (stats.isDirectory()) return collectFilesRecursive(absolute, onUnsupported);
    if (stats.isFile()) return [absolute];
    onUnsupported(absolute, filesystemKind(stats));
    return [];
  });
}

function isStringLiteralLike(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function importHasRuntime(node) {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings?.elements.some((element) => !element.isTypeOnly) ?? false;
}

function exportHasRuntime(node) {
  if (node.isTypeOnly) return false;
  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    return node.exportClause.elements.some((element) => !element.isTypeOnly);
  }
  return true;
}

function isFunctionScope(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function isLexicalScope(node) {
  return (
    ts.isSourceFile(node) ||
    isFunctionScope(node) ||
    ts.isBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node)
  );
}

function nearestScope(node, blockScoped = true) {
  let current = node;
  while (current) {
    if (
      (blockScoped && isLexicalScope(current)) ||
      (!blockScoped && (isFunctionScope(current) || ts.isSourceFile(current)))
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isImportMeta(node) {
  const current = unwrapExpression(node);
  return (
    ts.isMetaProperty(current) &&
    current.keywordToken === ts.SyntaxKind.ImportKeyword &&
    current.name.text === "meta"
  );
}

function memberProperty(node) {
  const current = unwrapExpression(node);
  if (ts.isPropertyAccessExpression(current)) return current.name.text;
  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    return propertyText(unwrapExpression(current.argumentExpression));
  }
  return null;
}

function isImportMetaMember(node, property) {
  const current = unwrapExpression(node);
  return (
    (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) &&
    memberProperty(current) === property &&
    isImportMeta(current.expression)
  );
}

function propertyText(node) {
  if (ts.isComputedPropertyName(node)) return propertyText(node.expression);
  if (ts.isIdentifier(node) || isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return "<computed>";
}

function isTypePosition(node) {
  let current = node.parent;
  while (current) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isExpression(current) || ts.isStatement(current) || ts.isSourceFile(current)) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function isPropertyOrDeclarationName(node, declarationIdentifiers) {
  if (declarationIdentifiers.has(node)) return true;
  const parent = node.parent;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isEnumMember(parent) && parent.name === node) ||
    (ts.isLabeledStatement(parent) && parent.label === node) ||
    ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isMetaProperty(parent)
  ) {
    return true;
  }
  return false;
}

function scriptKind(filename) {
  if (filename.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filename.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(?:js|jsx|mjs|cjs)$/.test(filename)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function collectModuleSpecifiers(source, filename = "fixture.ts") {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filename)
  );
  const references = [];
  const allReferences = [];
  const forbidden = [];
  const capabilities = [];
  const mechanicsReads = [];
  const declarationIdentifiers = new Set();
  const scopeBindings = new Map();
  const aliasNamespaces = new Map();
  const variableDeclarations = [];

  function scopeMap(scope) {
    let bindings = scopeBindings.get(scope);
    if (!bindings) {
      bindings = new Map();
      scopeBindings.set(scope, bindings);
    }
    return bindings;
  }

  function bindName(name, scope) {
    if (!scope) return;
    if (ts.isIdentifier(name)) {
      declarationIdentifiers.add(name);
      scopeMap(scope).set(name.text, name);
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) bindName(element.name, scope);
      }
    }
  }

  function collectBindings(node) {
    if (ts.isImportClause(node)) {
      if (node.name) bindName(node.name, file);
    } else if (ts.isImportEqualsDeclaration(node)) {
      bindName(node.name, nearestScope(node.parent, true));
    } else if (ts.isNamespaceImport(node) || ts.isImportSpecifier(node)) {
      bindName(node.name, file);
    } else if (ts.isVariableDeclaration(node)) {
      variableDeclarations.push(node);
      if (ts.isCatchClause(node.parent)) {
        bindName(node.name, node.parent);
      } else {
        const list = ts.isVariableDeclarationList(node.parent) ? node.parent : null;
        const blockScoped = Boolean(list && (list.flags & ts.NodeFlags.BlockScoped));
        bindName(node.name, nearestScope(node.parent, blockScoped));
      }
    } else if (ts.isParameter(node)) {
      bindName(node.name, nearestScope(node.parent, false));
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      bindName(node.name, nearestScope(node.parent, true));
    } else if (ts.isFunctionExpression(node) && node.name) {
      bindName(node.name, node);
    }
    ts.forEachChild(node, collectBindings);
  }

  collectBindings(file);

  function resolveBinding(identifier) {
    let current = identifier.parent;
    while (current) {
      if (isLexicalScope(current)) {
        const binding = scopeBindings.get(current)?.get(identifier.text);
        if (binding) return binding;
      }
      current = current.parent;
    }
    return null;
  }

  function resolveNamespace(expression) {
    const current = unwrapExpression(expression);
    if (ts.isIdentifier(current)) {
      const binding = resolveBinding(current);
      if (binding) return aliasNamespaces.get(binding) ?? null;
      if (["Math", "crypto", "globalThis", "window", "self"].includes(current.text)) {
        return current.text;
      }
      return null;
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const base = resolveNamespace(current.expression);
      const property = ts.isPropertyAccessExpression(current)
        ? current.name.text
        : current.argumentExpression
          ? propertyText(current.argumentExpression)
          : "<computed>";
      if (["globalThis", "window", "self"].includes(base) && ["Math", "crypto"].includes(property)) {
        return property;
      }
    }
    return null;
  }

  let aliasesChanged = true;
  while (aliasesChanged) {
    aliasesChanged = false;
    for (const declaration of variableDeclarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const namespace = resolveNamespace(declaration.initializer);
      if (namespace && aliasNamespaces.get(declaration.name) !== namespace) {
        aliasNamespaces.set(declaration.name, namespace);
        aliasesChanged = true;
      }
    }
  }

  function record(specifier, kind, runtime = true) {
    const reference = { specifier, kind };
    allReferences.push(reference);
    if (runtime) references.push(reference);
  }

  function recordMemberAccess(node) {
    const current = unwrapExpression(node);
    if (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current)) return;
    const base = resolveNamespace(current.expression);
    const property = ts.isPropertyAccessExpression(current)
      ? current.name.text
      : current.argumentExpression
        ? propertyText(current.argumentExpression)
        : "<computed>";
    if (base === "Math" && (property === "random" || property === "<computed>")) {
      forbidden.push("Math.random");
    }
    if (base === "crypto" && ["randomUUID", "getRandomValues", "<computed>"].includes(property)) {
      forbidden.push(property === "<computed>" ? "crypto" : `crypto.${property}`);
    }
    if (property === "constructor") forbidden.push("constructor");
  }

  function recordDestructuredAccess(node) {
    if (
      (!ts.isVariableDeclaration(node) && !ts.isParameter(node)) ||
      !ts.isObjectBindingPattern(node.name) ||
      !node.initializer
    ) {
      return;
    }
    const namespace = resolveNamespace(node.initializer);
    for (const element of node.name.elements) {
      const property = element.propertyName
        ? propertyText(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : "<computed>";
      if (namespace === "Math" && ["random", "<computed>"].includes(property)) {
        forbidden.push("Math.random");
      }
      if (namespace === "crypto" && ["randomUUID", "getRandomValues"].includes(property)) {
        forbidden.push(`crypto.${property}`);
      }
    }
  }

  function recordProtectedMechanicsRead(node) {
    let property = null;
    if (ts.isPropertyAccessExpression(node)) {
      property = node.name.text;
    } else if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      property = propertyText(unwrapExpression(node.argumentExpression));
    } else if (
      ts.isBindingElement(node) &&
      ts.isObjectBindingPattern(node.parent)
    ) {
      property = node.propertyName
        ? propertyText(node.propertyName)
        : ts.isIdentifier(node.name)
          ? node.name.text
          : "<computed>";
    }
    if (property && PROTECTED_MECHANICS_KEYS.has(property)) mechanicsReads.push(property);
  }

  function isDirectCallCallee(identifier) {
    let current = identifier;
    while (
      current.parent &&
      (ts.isParenthesizedExpression(current.parent) ||
        ts.isAsExpression(current.parent) ||
        ts.isTypeAssertionExpression(current.parent) ||
        ts.isNonNullExpression(current.parent) ||
        ts.isSatisfiesExpression(current.parent)) &&
      current.parent.expression === current
    ) {
      current = current.parent;
    }
    return ts.isCallExpression(current.parent) && current.parent.expression === current;
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && isStringLiteralLike(node.moduleSpecifier)) {
      const runtime = importHasRuntime(node);
      record(node.moduleSpecifier.text, runtime ? "import" : "type-import", runtime);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      isStringLiteralLike(node.moduleSpecifier)
    ) {
      const runtime = exportHasRuntime(node);
      record(node.moduleSpecifier.text, runtime ? "re-export" : "type-re-export", runtime);
    } else if (ts.isImportTypeNode(node)) {
      const literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null;
      record(
        literal && isStringLiteralLike(literal) ? literal.text : "<non-literal>",
        "import-type-expression",
        false
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression;
      const runtime = !node.isTypeOnly;
      record(
        expression && isStringLiteralLike(expression) ? expression.text : "<non-literal>",
        runtime ? "import-equals" : "type-import-equals",
        runtime
      );
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const requiredModule = node.arguments.length === 1
        ? unwrapExpression(node.arguments[0])
        : null;
      record(
        requiredModule && isStringLiteralLike(requiredModule)
          ? requiredModule.text
          : "<non-literal>",
        "dynamic-import"
      );
    } else if (
      ts.isCallExpression(node) &&
      (ts.isPropertyAccessExpression(unwrapExpression(node.expression)) ||
        ts.isElementAccessExpression(unwrapExpression(node.expression))) &&
      memberProperty(node.expression) === "glob" &&
      isImportMeta(unwrapExpression(node.expression).expression) &&
      node.arguments.length > 0
    ) {
      const patterns = node.arguments[0];
      const unwrappedPatterns = unwrapExpression(patterns);
      if (isStringLiteralLike(unwrappedPatterns)) {
        record(unwrappedPatterns.text, "import-meta-glob");
      } else if (ts.isArrayLiteralExpression(unwrappedPatterns)) {
        if (unwrappedPatterns.elements.length === 0) record("<non-literal>", "import-meta-glob");
        for (const element of unwrappedPatterns.elements) {
          const unwrappedElement = unwrapExpression(element);
          record(isStringLiteralLike(unwrappedElement) ? unwrappedElement.text : "<non-literal>", "import-meta-glob");
        }
      } else {
        record("<non-literal>", "import-meta-glob");
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(unwrapExpression(node.expression)) &&
      unwrapExpression(node.expression).text === "URL" &&
      node.arguments?.length === 2 &&
      isImportMetaMember(node.arguments[1], "url")
    ) {
      const firstArgument = unwrapExpression(node.arguments[0]);
      record(isStringLiteralLike(firstArgument) ? firstArgument.text : "<non-literal>", "new-url");
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(unwrapExpression(node.expression)) &&
      unwrapExpression(node.expression).text === "require" &&
      !resolveBinding(unwrapExpression(node.expression))
    ) {
      const requiredModule = node.arguments.length === 1
        ? unwrapExpression(node.arguments[0])
        : null;
      record(
        requiredModule && isStringLiteralLike(requiredModule)
          ? requiredModule.text
          : "<non-literal>",
        "require"
      );
    } else if (
      ts.isCallExpression(node) &&
      (ts.isPropertyAccessExpression(unwrapExpression(node.expression)) ||
        ts.isElementAccessExpression(unwrapExpression(node.expression))) &&
      memberProperty(unwrapExpression(node.expression)) === "require"
    ) {
      const requireMember = unwrapExpression(node.expression);
      const base = unwrapExpression(requireMember.expression);
      if (ts.isIdentifier(base) && base.text === "module" && !resolveBinding(base)) {
        const requiredModule = node.arguments.length === 1
          ? unwrapExpression(node.arguments[0])
          : null;
        record(
          requiredModule && isStringLiteralLike(requiredModule)
            ? requiredModule.text
            : "<non-literal>",
          "module-require"
        );
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      recordMemberAccess(node);
    }
    recordDestructuredAccess(node);
    recordProtectedMechanicsRead(node);

    if (ts.isIdentifier(node)) {
      if (
        !isPropertyOrDeclarationName(node, declarationIdentifiers) &&
        !isTypePosition(node) &&
        !resolveBinding(node)
      ) {
        if (node.text === "require" && !isDirectCallCallee(node)) {
          capabilities.push("require");
        }
        if (node.text === "Math") {
          const parent = node.parent;
          const isMemberBase =
            (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
            parent.expression === node;
          if (!isMemberBase) forbidden.push("Math");
        } else {
          forbidden.push(node.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  for (const reference of file.referencedFiles) {
    record(reference.fileName, "triple-slash-path", false);
  }
  for (const reference of file.libReferenceDirectives) {
    record(reference.fileName, "triple-slash-lib", false);
  }
  for (const reference of file.typeReferenceDirectives) {
    record(reference.fileName, "triple-slash-types", false);
  }
  for (const comment of source.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    let matchedImport = false;
    for (const imported of comment[0].matchAll(/\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g)) {
      matchedImport = true;
      record(imported[2], "jsdoc-import-type", false);
    }
    if (!matchedImport && /\bimport\s*\(/.test(comment[0])) {
      record("<non-literal>", "jsdoc-import-type", false);
    }
  }
  visit(file);
  return { references, allReferences, identifiers: forbidden, capabilities, mechanicsReads };
}

export function collectCssReferences(source) {
  const references = [];
  if (/\/\*[\s\S]*?\*\//.test(source) || /\\/.test(source)) {
    references.push({ specifier: "<non-literal>", kind: "css-obfuscated-token" });
  }
  for (const match of source.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)'"`]+))/gi)) {
    references.push({ specifier: match[1] ?? match[2] ?? match[3], kind: "css-import" });
  }
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const specifier = match[1].trim();
    references.push({ specifier, kind: "css-url" });
  }
  return references;
}

function parseHtmlAttributes(attributeSource) {
  const attributes = [];
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of attributeSource.matchAll(pattern)) {
    attributes.push({
      name: match[1].toLowerCase(),
      value: match[2] ?? match[3] ?? match[4] ?? "",
      hasValue: match[2] !== undefined || match[3] !== undefined || match[4] !== undefined,
      quoted: match[2] !== undefined || match[3] !== undefined,
    });
  }
  return attributes;
}

function decodedExecutableScheme(value) {
  const decoded = value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (match, hexadecimal, decimal) => {
      const codePoint = Number.parseInt(hexadecimal ?? decimal, hexadecimal ? 16 : 10);
      if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return match;
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    })
    .replace(/&(colon|tab|newline);/gi, (_, name) => ({
      colon: ":",
      tab: "\t",
      newline: "\n",
    })[name.toLowerCase()]);
  return /^(?:javascript|vbscript):/i.test(decoded.replace(/[\u0000-\u0020\u007f]+/g, ""));
}

function inspectHtml(source) {
  const references = [];
  const issues = [];
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, "");
  const scriptBodies = [];
  for (const match of withoutComments.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    scriptBodies.push({ start: match.index, body: match[2] });
  }

  for (const match of withoutComments.matchAll(/<([A-Za-z][\w:-]*)\b([^<>]*)>/g)) {
    const tagName = match[1].toLowerCase();
    const attributes = parseHtmlAttributes(match[2]);
    const byName = new Map();
    for (const attribute of attributes) {
      if (byName.has(attribute.name)) {
        issues.push(`Duplicate HTML attribute ${attribute.name} on <${tagName}>`);
      }
      byName.set(attribute.name, attribute);
      if (attribute.name === "style") {
        issues.push(`Inline style attribute is forbidden on <${tagName}>`);
      }
      if (attribute.name.startsWith("on")) {
        issues.push(`Inline event handler ${attribute.name} is forbidden on <${tagName}>`);
      }
      if (decodedExecutableScheme(attribute.value)) {
        issues.push(`Executable script URL is forbidden on <${tagName}>`);
      }
      if (attribute.name === "srcdoc") {
        issues.push("iframe srcdoc is forbidden in index.html");
      }
    }

    if (tagName === "style") issues.push("Inline <style> is forbidden in index.html");
    if (tagName === "base") issues.push("HTML <base> is forbidden in index.html");

    const dependency = (attributeName, kind) => {
      const attribute = byName.get(attributeName);
      if (!attribute) return;
      if (!attribute.hasValue || attribute.value.length === 0) {
        issues.push(`<${tagName}> ${attributeName} must have a value`);
        return;
      }
      if (!attribute.quoted) {
        issues.push(`<${tagName}> ${attributeName} must be quoted`);
      }
      references.push({ specifier: attribute.value, kind });
    };

    if (tagName === "script") {
      const type = byName.get("type");
      if (type && !type.quoted) issues.push("<script> type must be quoted");
      const isModule = type?.value.toLowerCase() === "module";
      if (!isModule) issues.push("Classic or untyped <script> is forbidden in index.html");
      const sourceAttribute = byName.get("src");
      if (!sourceAttribute) {
        issues.push("Inline <script> is forbidden in index.html");
      } else {
        dependency("src", isModule ? "html-module" : "html-script");
      }
      const body = scriptBodies.find((entry) => entry.start === match.index)?.body ?? "";
      if (body.trim().length > 0) issues.push("Inline script body is forbidden in index.html");
    } else if (tagName === "link") {
      const rel = byName.get("rel");
      const href = byName.get("href");
      const exactFavicon =
        rel?.quoted === true &&
        rel.value.toLowerCase() === "icon" &&
        href?.quoted === true &&
        href.value === "./favicon.svg";
      if (!exactFavicon) {
        issues.push("Only a quoted rel=icon href=./favicon.svg link is allowed");
      }
      if (!rel) issues.push("<link> rel is required");
      else if (!rel.quoted) issues.push("<link> rel must be quoted");
      if (!href) issues.push("<link> href is required");
      dependency("href", exactFavicon ? "html-favicon" : "html-link");
    } else if (["img", "source", "input", "image", "use"].includes(tagName)) {
      dependency("src", "html-image");
      if (["image", "use"].includes(tagName)) {
        dependency("href", "html-image");
        dependency("xlink:href", "html-image");
      }
    } else if (["audio", "video", "track", "iframe", "embed"].includes(tagName)) {
      dependency("src", "html-media");
      if (tagName === "video") dependency("poster", "html-poster");
    } else if (tagName === "object") {
      dependency("data", "html-object");
    } else if (tagName === "base") {
      dependency("href", "html-base");
    }

    for (const attributeName of ["srcset", "imagesrcset"]) {
      if (!byName.has(attributeName)) continue;
      const srcset = byName.get(attributeName);
      if (!srcset.quoted) issues.push(`<${tagName}> ${attributeName} must be quoted`);
      issues.push(`<${tagName}> ${attributeName} is forbidden in index.html`);
      references.push({ specifier: srcset.value, kind: `html-${attributeName}` });
    }
    if (
      tagName === "meta" &&
      byName.get("http-equiv")?.value.toLowerCase() === "refresh"
    ) {
      issues.push("Meta refresh is forbidden in index.html");
    }
  }
  return { references, issues };
}

export function collectHtmlReferences(source) {
  return inspectHtml(source).references;
}

function resolveLocalReference(fromFile, specifier, root) {
  if (/^(?:https?:|data:|#)/i.test(specifier)) return null;
  const withoutQuery = specifier.split(/[?#]/, 1)[0];
  const base = withoutQuery.startsWith("/")
    ? path.join(root, withoutQuery.slice(1))
    : path.resolve(path.dirname(fromFile), withoutQuery);
  const candidates = [base];
  if (!path.extname(base)) {
    for (const extension of SCRIPT_OR_STYLE_EXTENSIONS) {
      candidates.push(`${base}${extension}`);
    }
    for (const extension of SOURCE_EXTENSIONS) {
      candidates.push(path.join(base, `index${extension}`));
    }
  }
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? base;
}

function readAliases(root) {
  const tsconfigPath = path.join(root, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) return [];
  const config = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
  const compilerOptions = config.compilerOptions ?? {};
  const base = path.resolve(root, compilerOptions.baseUrl ?? ".");
  return Object.entries(compilerOptions.paths ?? {}).flatMap(([pattern, targets]) =>
    targets.map((target) => ({ pattern, target, base }))
  );
}

function resolveAliasedReference(fromFile, specifier, root, aliases) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return resolveLocalReference(fromFile, specifier, root);
  }
  for (const alias of aliases) {
    const star = alias.pattern.indexOf("*");
    let capture = "";
    if (star === -1) {
      if (specifier !== alias.pattern) continue;
    } else {
      const prefix = alias.pattern.slice(0, star);
      const suffix = alias.pattern.slice(star + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
      capture = specifier.slice(prefix.length, specifier.length - suffix.length);
    }
    const target = alias.target.replace("*", capture);
    const syntheticFrom = path.join(alias.base, "__alias__.ts");
    return resolveLocalReference(syntheticFrom, `./${target}`, root);
  }
  return null;
}

function layerOf(relative) {
  const match = relative.match(/^src\/choice-of-life\/(core|persistence|platform|presentation)\//);
  if (match) return match[1];
  if (relative === "src/choice-of-life/app.ts") return "app";
  return null;
}

function isTestSource(relative) {
  return /(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(relative);
}

function isSourceOrStyle(relative) {
  return SCRIPT_OR_STYLE_EXTENSIONS.some((extension) => relative.endsWith(extension));
}

function isSourceModule(relative) {
  return SOURCE_EXTENSIONS.some((extension) => relative.endsWith(extension));
}

function isAllowedProductionPath(relative) {
  return (
    relative === "src/main.ts" ||
    APPROVED_STORYBOOK_ASSET_ADAPTERS.has(relative) ||
    relative === "src/choice-of-life/style.css" ||
    relative.startsWith("src/choice-of-life/presentation/") && relative.endsWith(".css") ||
    (relative.startsWith("src/choice-of-life/") &&
      isSourceModule(relative) &&
      !isTestSource(relative))
  );
}

function isClassifiedChoicePath(relative) {
  return (
    relative === "src/choice-of-life/app.ts" ||
    relative === "src/choice-of-life/style.css" ||
    (layerOf(relative) !== null && (
      isSourceModule(relative)
      || (layerOf(relative) === "presentation" && relative.endsWith(".css"))
    ))
  );
}

function assertLayerImport(fromRelative, toRelative, errors) {
  if (
    fromRelative === "src/main.ts" &&
    !["src/choice-of-life/app.ts", "src/choice-of-life/style.css"].includes(toRelative)
  ) {
    errors.push(`Entry composition violation: ${fromRelative} -> ${toRelative}`);
  }
  const from = layerOf(fromRelative);
  const to = layerOf(toRelative);
  if (!from || !to) return;
  const allowed = {
    core: new Set(["core"]),
    persistence: new Set(["core", "persistence"]),
    presentation: new Set(["core", "presentation"]),
    platform: new Set(["core", "persistence", "platform"]),
    app: new Set(["core", "persistence", "platform", "presentation", "app"]),
  }[from];
  if (!allowed.has(to)) {
    errors.push(`Layer violation: ${fromRelative} -> ${toRelative}`);
  }
}

export function auditChoiceBoundaries(root = process.cwd()) {
  const errors = [];
  const indexPath = path.join(root, "index.html");
  const html = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  if (!fs.existsSync(indexPath)) errors.push("Missing production HTML input: index.html");
  const htmlInspection = inspectHtml(html);
  errors.push(...htmlInspection.issues);
  const htmlReferences = htmlInspection.references;
  const moduleScripts = htmlReferences.filter(({ kind }) => kind === "html-module");
  if (
    moduleScripts.length !== 1 ||
    !["/src/main.ts", "./src/main.ts", "src/main.ts"].includes(moduleScripts[0]?.specifier)
  ) {
    errors.push("index.html must contain exactly one module script for src/main.ts");
  }

  for (const reference of htmlReferences) {
    if (reference.kind === "html-favicon" && reference.specifier === "./favicon.svg") continue;
    if (reference.kind === "html-module") continue;
    errors.push(`Unexpected HTML dependency (${reference.kind}): ${reference.specifier}`);
  }

  const publicDirectory = path.join(root, "public");
  const publicFiles = collectFilesRecursive(publicDirectory, (entry, kind) => {
    const relative = normalize(path.relative(publicDirectory, entry)) || ".";
    errors.push(`Unsupported public filesystem entry: ${relative} (${kind})`);
  })
    .map((file) => normalize(path.relative(publicDirectory, file)))
    .sort();
  const unexpectedPublic = publicFiles.filter(
    (file) => ![
      "404.html",
      "assets/newborn-nursery-v1.png",
      "favicon.svg",
      "release.json",
    ].includes(file)
  );
  if (unexpectedPublic.length) {
    errors.push(`Unexpected public files: ${unexpectedPublic.join(", ")}`);
  }

  const aliases = readAliases(root);
  const choiceDirectory = path.join(root, "src", "choice-of-life");
  const mainPath = path.join(root, "src", "main.ts");
  const candidates = [mainPath, ...collectFilesRecursive(choiceDirectory, (entry, kind) => {
    const relative = normalize(path.relative(root, entry));
    errors.push(`Unsupported production filesystem entry: ${relative} (${kind})`);
  })]
    .filter((file) => isSourceOrStyle(normalize(path.relative(root, file))))
    .filter((file) => !isTestSource(normalize(path.relative(root, file))));
  const sourceFiles = [...new Set(candidates.map((file) => path.resolve(file)))].sort();
  const runtimeEdges = new Map();

  function recordDependency(fromFile, fromRelative, reference, runtime) {
    const { specifier, kind } = reference;
    if (specifier === "<non-literal>") {
      errors.push(`Non-literal production dependency (${kind}) in ${fromRelative}`);
      return null;
    }
    if (kind === "import-meta-glob" && /[*?{}[\]]/.test(specifier)) {
      errors.push(`Glob dependency is forbidden in production: ${fromRelative} -> ${specifier}`);
      return null;
    }
    const resolved = resolveAliasedReference(fromFile, specifier, root, aliases);
    if (!resolved) {
      errors.push(`Bare ${runtime ? "runtime" : "source"} dependency (${kind}) in ${fromRelative}: ${specifier}`);
      return null;
    }
    const target = path.resolve(resolved);
    const targetRelative = normalize(path.relative(root, target));
    if (!isAllowedProductionPath(targetRelative)) {
      errors.push(`Legacy/out-of-bound production dependency: ${targetRelative}`);
    }
    if (!fs.existsSync(target)) {
      errors.push(`Missing production dependency: ${targetRelative}`);
    }
    assertLayerImport(fromRelative, targetRelative, errors);
    return target;
  }

  for (const current of sourceFiles) {
    const relative = normalize(path.relative(root, current));
    if (relative.startsWith("src/choice-of-life/") && !isClassifiedChoicePath(relative)) {
      errors.push(`Unclassified production module: ${relative}`);
    }
    if (!fs.existsSync(current)) continue;
    const source = fs.readFileSync(current, "utf8");
    if (current.endsWith(".css")) {
      const edges = [];
      for (const reference of collectCssReferences(source)) {
        const target = recordDependency(current, relative, reference, true);
        if (target) edges.push(target);
      }
      runtimeEdges.set(current, edges);
      continue;
    }

    const analysis = collectModuleSpecifiers(source, current);
    const runtimeReferences = new Set(analysis.references);
    const edges = [];
    for (const reference of analysis.allReferences) {
      const runtime = runtimeReferences.has(reference);
      const target = recordDependency(current, relative, reference, runtime);
      if (runtime && target) edges.push(target);
    }
    runtimeEdges.set(current, edges);

    const layer = layerOf(relative);
    const banned = layer === "core" || layer === "persistence"
      ? FORBIDDEN_PURE_IDENTIFIERS
      : layer === "presentation"
        ? FORBIDDEN_PRESENTATION_IDENTIFIERS
        : new Set();
    for (const identifier of new Set(analysis.identifiers)) {
      if (banned.has(identifier)) {
        errors.push(`Forbidden ${identifier} in ${relative}`);
      }
    }
    for (const capability of new Set(analysis.capabilities)) {
      errors.push(`Forbidden bare ${capability} capability in ${relative}`);
    }
    if (!PROTECTED_MECHANICS_READ_ALLOWED.has(relative)) {
      for (const property of new Set(analysis.mechanicsReads)) {
        errors.push(`Forbidden protected/cosmetic mechanics read ${property} in ${relative}`);
      }
    }
  }

  const queue = [path.resolve(mainPath)];
  const visited = new Set();
  while (queue.length) {
    const current = path.resolve(queue.shift());
    if (visited.has(current)) continue;
    visited.add(current);
    if (!fs.existsSync(current)) {
      errors.push(`Missing production dependency: ${normalize(path.relative(root, current))}`);
      continue;
    }
    queue.push(...(runtimeEdges.get(current) ?? []));
  }

  return {
    errors: [...new Set(errors)].sort(),
    productionFiles: [...visited].map((file) => normalize(path.relative(root, file))).sort(),
  };
}
