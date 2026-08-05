import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DYNAMIC_SEMANTIC_KEYS = Object.freeze([
  "health",
  "happiness",
  "money",
  "runner",
  "choice",
  "callback",
  "settlement",
  "recovery",
  "system",
  "healthPositive",
  "healthNegative",
  "happinessPositive",
  "happinessNegative",
  "moneyPositive",
  "moneyNegative",
]);
const SEMANTIC_ATTRIBUTE_KEYS = Object.freeze([
  "for",
  "id",
  "max",
  "min",
  "role",
  "tabindex",
]);
const QUARANTINE_WIRE_KEYS = Object.freeze([
  "version",
  "code",
  "schemaVersion",
  "contentVersion",
  "originalUtf8Length",
  "digest",
  "rawExcerpt",
]);

function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const absolute = path.resolve(path.dirname(fromFile), specifier);
  const extension = path.extname(absolute).toLowerCase();
  if (extension !== "" && !/^[cm]?[jt]sx?$/.test(extension.slice(1))) {
    return null;
  }
  const candidates = extension !== ""
    ? [
        absolute,
        absolute.replace(/\.m?js$/i, ".ts"),
        absolute.replace(/\.cjs$/i, ".cts"),
      ]
    : [
        `${absolute}.ts`,
        `${absolute}.tsx`,
        path.join(absolute, "index.ts"),
        path.join(absolute, "index.tsx"),
      ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function browserSourceGraph(repoRoot) {
  const entry = path.resolve(repoRoot, "src/main.ts");
  const pending = [entry];
  const sources = new Map();
  while (pending.length > 0) {
    const filename = pending.pop();
    if (filename === undefined || sources.has(filename)) continue;
    const sourceText = fs.readFileSync(filename, "utf8");
    const source = ts.createSourceFile(
      filename,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    sources.set(filename, source);
    const importHasRuntime = (node) => {
      const clause = node.importClause;
      if (clause === undefined) return true;
      if (clause.isTypeOnly) return false;
      if (clause.name !== undefined) return true;
      if (
        clause.namedBindings !== undefined &&
        ts.isNamespaceImport(clause.namedBindings)
      ) return true;
      return clause.namedBindings?.elements.some((element) =>
        !element.isTypeOnly) ?? false;
    };
    const exportHasRuntime = (node) => {
      if (node.isTypeOnly) return false;
      if (
        node.exportClause !== undefined &&
        ts.isNamedExports(node.exportClause)
      ) {
        return node.exportClause.elements.some((element) =>
          !element.isTypeOnly);
      }
      return true;
    };
    const collectModuleEdges = (node) => {
      let specifier = null;
      if (
        ts.isImportDeclaration(node) &&
        importHasRuntime(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        specifier = node.moduleSpecifier.text;
      } else if (
        ts.isExportDeclaration(node) &&
        exportHasRuntime(node) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        specifier = node.moduleSpecifier.text;
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        specifier = node.arguments[0].text;
      }
      if (specifier !== null) {
        const resolved = resolveModule(filename, specifier);
        if (resolved !== null) pending.push(resolved);
      }
      ts.forEachChild(node, collectModuleEdges);
    };
    collectModuleEdges(source);
  }
  return [...sources.values()].sort((left, right) =>
    left.fileName.localeCompare(right.fileName));
}

function runStateWireNames(sources) {
  const wireSource = sources.find((source) =>
    path.basename(source.fileName) === "run-state-wire.ts");
  if (wireSource === undefined) {
    throw new TypeError("Production graph does not contain run-state-wire.ts");
  }
  for (const statement of wireSource.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "RUN_STATE_WIRE_KEYS_V1"
      ) continue;
      let initializer = declaration.initializer;
      while (initializer !== undefined) {
        if (ts.isAsExpression(initializer)) {
          initializer = initializer.expression;
          continue;
        }
        if (
          ts.isCallExpression(initializer) &&
          initializer.arguments.length === 1
        ) {
          initializer = initializer.arguments[0];
          continue;
        }
        break;
      }
      if (
        initializer === undefined ||
        !ts.isArrayLiteralExpression(initializer) ||
        !initializer.elements.every(ts.isStringLiteralLike)
      ) {
        throw new TypeError("RUN_STATE_WIRE_KEYS_V1 must be a literal string array");
      }
      const names = initializer.elements.map((element) => element.text);
      if (names.length === 0 || new Set(names).size !== names.length) {
        throw new TypeError("RUN_STATE_WIRE_KEYS_V1 must be non-empty and unique");
      }
      return Object.freeze(names);
    }
  }
  throw new TypeError("Production graph does not declare RUN_STATE_WIRE_KEYS_V1");
}

function isInsideType(node) {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isStatement(current) || ts.isExpression(current)) return false;
  }
  return false;
}

function isModuleSpecifier(node) {
  return (
    (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) &&
    node.parent.moduleSpecifier === node
  );
}

function isWireKeyLiteral(node, source) {
  if (path.basename(source.fileName) !== "run-state-wire.ts") return false;
  let current = node.parent;
  while (current !== undefined && !ts.isVariableDeclaration(current)) {
    current = current.parent;
  }
  return current !== undefined &&
    ts.isIdentifier(current.name) &&
    current.name.text === "RUN_STATE_WIRE_KEYS_V1";
}

function unquotedPropertyName(node) {
  if (node === undefined || !ts.isIdentifier(node)) return null;
  return node.text;
}

function isAttributeMapProperty(node) {
  const property = node.parent;
  if (
    !ts.isPropertyAssignment(property) &&
    !ts.isShorthandPropertyAssignment(property)
  ) return false;
  const object = property.parent;
  if (!ts.isObjectLiteralExpression(object)) return false;
  const container = object.parent;
  return ts.isPropertyAssignment(container) &&
    ((ts.isIdentifier(container.name) && container.name.text === "attributes") ||
      (ts.isStringLiteralLike(container.name) && container.name.text === "attributes"));
}

function escapedAlternation(names) {
  return names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

export function createPropertyManglePolicy(repoRoot = process.cwd()) {
  const sources = browserSourceGraph(repoRoot);
  const wireNames = runStateWireNames(sources);
  const candidates = new Set();
  const reflected = new Set([
    ...DYNAMIC_SEMANTIC_KEYS,
    ...SEMANTIC_ATTRIBUTE_KEYS,
    ...QUARANTINE_WIRE_KEYS,
  ]);
  const dataset = new Set();

  for (const source of sources) {
    const visit = (node) => {
      if (ts.isPropertyAccessExpression(node)) {
        candidates.add(node.name.text);
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "dataset"
        ) {
          dataset.add(node.name.text);
        }
      } else if (
        ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)
      ) {
        const name = unquotedPropertyName(node.name);
        if (name !== null) {
          candidates.add(name);
          if (isAttributeMapProperty(node.name)) reflected.add(name);
        }
      } else if (ts.isBindingElement(node)) {
        const name = unquotedPropertyName(node.propertyName ?? node.name);
        if (name !== null) candidates.add(name);
      }

      if (
        ts.isStringLiteralLike(node) &&
        IDENTIFIER.test(node.text) &&
        !isInsideType(node) &&
        !isModuleSpecifier(node) &&
        !isWireKeyLiteral(node, source)
      ) {
        reflected.add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  for (const name of dataset) reflected.add(name);
  const safeNames = [...candidates]
    .filter((name) => IDENTIFIER.test(name) && !reflected.has(name))
    .sort();
  const candidateNames = [...candidates]
    .filter((name) => IDENTIFIER.test(name))
    .sort();
  const pattern = safeNames.length === 0
    ? /$a/
    : new RegExp(`^(?:${escapedAlternation(safeNames).join("|")})$`);
  return Object.freeze({
    pattern,
    candidateNames: Object.freeze(candidateNames),
    dynamicSemanticNames: DYNAMIC_SEMANTIC_KEYS,
    quarantineWireNames: QUARANTINE_WIRE_KEYS,
    runStateWireNames: wireNames,
    semanticAttributeNames: SEMANTIC_ATTRIBUTE_KEYS,
    safeNames: Object.freeze(safeNames),
    reflectedNames: Object.freeze([...reflected].sort()),
    datasetNames: Object.freeze([...dataset].sort()),
    sourceFiles: Object.freeze(
      sources.map((source) => path.relative(repoRoot, source.fileName).replaceAll("\\", "/")),
    ),
  });
}

/** Exact compatibility-sensitive options required when the generated policy is activated. */
export function createAuditedPropertyMangleOptions(repoRoot = process.cwd()) {
  const policy = createPropertyManglePolicy(repoRoot);
  // Terser normalizes this object in place (including adding `reserved`), so
  // each caller receives a fresh object rather than an immutable singleton.
  return {
    regex: policy.pattern,
    keep_quoted: "strict",
    builtins: false,
  };
}

function normalizedFirstPartyModule(repoRoot, moduleId) {
  if (typeof moduleId !== "string" || moduleId.startsWith("\0")) return null;
  const withoutQuery = moduleId.split("?", 1)[0];
  if (withoutQuery === undefined || withoutQuery.length === 0) return null;
  let absolute = withoutQuery;
  if (absolute.startsWith("file://")) {
    try {
      absolute = fileURLToPath(absolute);
    } catch {
      return null;
    }
  }
  absolute = path.resolve(absolute);
  const relative = path.relative(path.resolve(repoRoot), absolute)
    .replaceAll("\\", "/");
  if (
    relative.startsWith("../") ||
    !relative.startsWith("src/") ||
    relative.endsWith(".d.ts") ||
    !/\.(?:[cm]?[jt]sx?)$/i.test(relative)
  ) return null;
  return relative;
}

/**
 * Compares the source-derived policy closure with Rollup's complete loaded
 * production graph, then independently proves that every first-party module
 * which contributes bytes to an emitted chunk is covered. The complete graph
 * comparison catches both omissions and unexplained extras without treating a
 * module whose exports Rollup tree-shook as an unreviewed source transition.
 */
export function comparePropertyMangleProductionGraph(
  repoRoot,
  rollupModuleIds,
  emittedModuleIds = rollupModuleIds,
) {
  const policy = createPropertyManglePolicy(repoRoot);
  const normalize = (moduleIds) => [...new Set(
    [...moduleIds]
      .map((moduleId) => normalizedFirstPartyModule(repoRoot, moduleId))
      .filter((moduleId) => moduleId !== null),
  )].sort();
  const rollup = normalize(rollupModuleIds);
  const emitted = normalize(emittedModuleIds);
  const source = [...policy.sourceFiles];
  const sourceSet = new Set(source);
  const rollupSet = new Set(rollup);
  const emittedSet = new Set(emitted);
  return Object.freeze({
    rollupSourceFiles: Object.freeze(rollup),
    emittedSourceFiles: Object.freeze(emitted),
    missingFromPolicy: Object.freeze(
      rollup.filter((file) => !sourceSet.has(file)),
    ),
    absentFromRollupGraph: Object.freeze(
      source.filter((file) => !rollupSet.has(file)),
    ),
    emittedMissingFromPolicy: Object.freeze(
      emitted.filter((file) => !sourceSet.has(file)),
    ),
    treeShakenSourceFiles: Object.freeze(
      rollup.filter((file) => !emittedSet.has(file)),
    ),
  });
}

export function assertPropertyMangleProductionGraph(
  repoRoot,
  rollupModuleIds,
  emittedModuleIds = rollupModuleIds,
) {
  const comparison = comparePropertyMangleProductionGraph(
    repoRoot,
    rollupModuleIds,
    emittedModuleIds,
  );
  if (
    comparison.missingFromPolicy.length > 0 ||
    comparison.absentFromRollupGraph.length > 0 ||
    comparison.emittedMissingFromPolicy.length > 0
  ) {
    throw new TypeError([
      "Property-mangle source policy does not match the Rollup production graph.",
      `Missing from policy: ${comparison.missingFromPolicy.join(", ") || "none"}`,
      `Absent from Rollup graph: ${comparison.absentFromRollupGraph.join(", ") || "none"}`,
      `Emitted but missing from policy: ${comparison.emittedMissingFromPolicy.join(", ") || "none"}`,
    ].join("\n"));
  }
  return comparison;
}
