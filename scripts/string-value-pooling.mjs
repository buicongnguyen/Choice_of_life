import ts from "typescript";

const DEFAULT_MINIMUM_OCCURRENCES = 2;
const DEFAULT_MINIMUM_STRING_LENGTH = 1;
const DEFAULT_MINIMUM_ESTIMATED_SAVINGS = 4;
const DEFAULT_IDENTIFIER_PREFIX = "__choiceOfLifeString";
// Terser uses an ASCII base-54/base-64 identifier sequence. Even after a
// substantial keyword/reservation margin, two bytes provide more than 3,000
// distinct spellings. If our deliberately over-counted symbol population can
// exceed that floor, the estimator automatically moves to three bytes.
const TWO_BYTE_IDENTIFIER_CAPACITY_FLOOR = 3_000;
const RESERVED_IDENTIFIER_MARGIN = 128;
const OPTION_KEYS = Object.freeze(new Set([
  "identifierPrefix",
  "minimumEstimatedSavings",
  "minimumOccurrences",
  "minimumStringLength",
]));

/**
 * Calls whose string arguments cross an execution, module, worker, browsing,
 * or network boundary. Moving those literals is unnecessary for the bundle
 * budget and can hide a compatibility-sensitive token from later tooling, so
 * this transform deliberately leaves them byte-for-byte untouched.
 */
const DYNAMIC_BOUNDARY_CALL_NAMES = Object.freeze(new Set([
  "eval",
  "Function",
  "AsyncFunction",
  "GeneratorFunction",
  "AsyncGeneratorFunction",
  "setTimeout",
  "setInterval",
  "fetch",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "Request",
  "sendBeacon",
  "importScripts",
  "postMessage",
  "open",
]));

function fail(message) {
  throw new TypeError(`string-value pooling: ${message}`);
}

function assertIntegerOption(value, name, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
}

function normalizeOptions(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    fail("options must be an object");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== "string" || !OPTION_KEYS.has(key)) {
      fail(`unknown option ${String(key)}`);
    }
  }
  const minimumOccurrences =
    options.minimumOccurrences ?? DEFAULT_MINIMUM_OCCURRENCES;
  const minimumStringLength =
    options.minimumStringLength ?? DEFAULT_MINIMUM_STRING_LENGTH;
  const minimumEstimatedSavings =
    options.minimumEstimatedSavings ?? DEFAULT_MINIMUM_ESTIMATED_SAVINGS;
  const identifierPrefix = options.identifierPrefix ?? DEFAULT_IDENTIFIER_PREFIX;
  assertIntegerOption(minimumOccurrences, "minimumOccurrences", 2);
  assertIntegerOption(minimumStringLength, "minimumStringLength", 1);
  assertIntegerOption(
    minimumEstimatedSavings,
    "minimumEstimatedSavings",
    0,
  );
  if (
    typeof identifierPrefix !== "string" ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifierPrefix)
  ) {
    fail("identifierPrefix must be a JavaScript identifier");
  }
  return Object.freeze({
    identifierPrefix,
    minimumEstimatedSavings,
    minimumOccurrences,
    minimumStringLength,
  });
}

function isDirectiveLiteral(node) {
  return ts.isExpressionStatement(node.parent) && node.parent.expression === node;
}

function isImportExportOrJsxSyntax(node) {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (
      ts.isImportDeclaration(current) ||
      ts.isExportDeclaration(current) ||
      ts.isImportEqualsDeclaration(current) ||
      ts.isExternalModuleReference(current) ||
      ts.isImportTypeNode(current) ||
      ts.isJsxAttribute(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isJsxFragment(current)
    ) {
      return true;
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) break;
  }
  return false;
}

function isNoncomputedPropertyName(node) {
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isBindingElement(parent)) return parent.propertyName === node;
  if (parent.name !== node) return false;
  return (
    ts.isPropertyAssignment(parent) ||
    ts.isShorthandPropertyAssignment(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isEnumMember(parent)
  );
}

function terminalCalleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isPropertyAccessChain(expression)
  ) {
    return expression.name.text;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteral(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }
  return null;
}

function isLocationReceiver(expression) {
  const receiver = unwrapParenthesizedExpression(expression);
  if (ts.isIdentifier(receiver)) return receiver.text === "location";
  if (
    ts.isPropertyAccessExpression(receiver) ||
    ts.isPropertyAccessChain(receiver)
  ) {
    return receiver.name.text === "location";
  }
  if (
    ts.isElementAccessExpression(receiver) &&
    ts.isStringLiteral(receiver.argumentExpression)
  ) {
    return receiver.argumentExpression.text === "location";
  }
  return false;
}

function isLocationNavigationCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = unwrapParenthesizedExpression(node.expression);
  if (
    !ts.isPropertyAccessExpression(expression) &&
    !ts.isPropertyAccessChain(expression) &&
    !ts.isElementAccessExpression(expression)
  ) {
    return false;
  }
  const method = ts.isElementAccessExpression(expression)
    ? (ts.isStringLiteral(expression.argumentExpression)
        ? expression.argumentExpression.text
        : null)
    : expression.name.text;
  return (method === "assign" || method === "replace") &&
    isLocationReceiver(expression.expression);
}

function isDynamicImportCall(node) {
  return ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function unwrapParenthesizedExpression(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function isDirectEvalCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = unwrapParenthesizedExpression(node.expression);
  return ts.isIdentifier(expression) && expression.text === "eval";
}

function crossesDynamicBoundary(node) {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (isDynamicImportCall(current)) return true;
    if (isLocationNavigationCall(current)) return true;
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      const name = terminalCalleeName(current.expression);
      if (name !== null && DYNAMIC_BOUNDARY_CALL_NAMES.has(name)) return true;
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) break;
  }
  return false;
}

function isTypeOnlySyntax(node) {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isExpression(current) || ts.isStatement(current)) return false;
  }
  return false;
}

function isPoolableStringValue(node) {
  if (!ts.isStringLiteral(node)) return false;
  if (isDirectiveLiteral(node)) return false;
  if (isImportExportOrJsxSyntax(node)) return false;
  if (isNoncomputedPropertyName(node)) return false;
  if (isTypeOnlySyntax(node)) return false;
  if (crossesDynamicBoundary(node)) return false;
  return true;
}

function encodedString(value) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("could not encode a string primitive");
  return encoded
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function bindingNameCount(name) {
  if (ts.isIdentifier(name)) return 1;
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.reduce((total, element) =>
      total + (ts.isOmittedExpression(element) ? 0 : bindingNameCount(element.name)), 0);
  }
  return 0;
}

function declaredBindingCount(node) {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    return bindingNameCount(node.name);
  }
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node)) &&
    node.name !== undefined
  ) {
    return 1;
  }
  if (ts.isImportClause(node)) return node.name === undefined ? 0 : 1;
  if (ts.isNamespaceImport(node) || ts.isImportSpecifier(node)) return 1;
  return 0;
}

function conservativeIdentifierByteAllowance(
  declaredBindings,
  occupiedIdentifierSpellings,
  potentialPoolBindings,
) {
  const deliberatelyOverCountedPopulation =
    declaredBindings +
    occupiedIdentifierSpellings +
    potentialPoolBindings +
    RESERVED_IDENTIFIER_MARGIN;
  return deliberatelyOverCountedPopulation <= TWO_BYTE_IDENTIFIER_CAPACITY_FLOOR
    ? 2
    : 3;
}

function estimatedMinifiedSavings(value, occurrenceCount, identifierBytes) {
  // The original side uses a theoretical lower bound (UTF-8 value bytes plus
  // two delimiters), never an optimistic source spelling. The pooled side uses
  // the actual canonical literal bytes, a deterministic multi-byte identifier
  // allowance for both its binding and every reference, `=`, and its shared
  // comma-or-semicolon byte.
  const originalLiteralLowerBound = utf8ByteLength(value) + 2;
  const pooledLiteralBytes = utf8ByteLength(encodedString(value));
  return occurrenceCount * originalLiteralLowerBound -
    (
      pooledLiteralBytes +
      (occurrenceCount + 1) * identifierBytes +
      2
    );
}

function insertionOffset(source, sourceFile) {
  let offset = source.startsWith("#!")
    ? (source.indexOf("\n") === -1 ? source.length : source.indexOf("\n") + 1)
    : 0;
  for (const statement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      offset = statement.end;
      continue;
    }
    break;
  }
  return offset;
}

function insertionSeparator(source, offset) {
  if (offset === 0 || source[offset - 1] === ";") return "";
  // In particular, a directive terminated by ASI must not become
  // `"use strict"const ...`. A hashbang-only prefix also safely receives an
  // empty statement on the following line.
  return ";";
}

function nextIdentifier(prefix, occupied, ordinal) {
  let nextOrdinal = ordinal;
  while (occupied.has(`${prefix}${nextOrdinal}`)) nextOrdinal += 1;
  const identifier = `${prefix}${nextOrdinal}`;
  occupied.add(identifier);
  return Object.freeze({ identifier, nextOrdinal: nextOrdinal + 1 });
}

/**
 * Pools only repeated, ordinary expression string primitives. It does not
 * rewrite templates, directives, module specifiers, noncomputed property
 * names, JSX, or execution/network boundary arguments. The operation is a
 * deterministic source-to-source pass intended to run immediately before
 * Terser in an ES-module Rollup build.
 */
export function poolRepeatedStringValues(source, options = {}) {
  if (typeof source !== "string") fail("source must be a string");
  const normalized = normalizeOptions(options);
  const sourceFile = ts.createSourceFile(
    "choice-of-life-production-chunk.jsx",
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JSX,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    const first = sourceFile.parseDiagnostics[0];
    fail(`source must parse without diagnostics (code ${first.code})`);
  }

  const occupiedIdentifiers = new Set();
  const occurrencesByValue = new Map();
  let containsDirectEval = false;
  let declaredBindings = 0;
  const visit = (node) => {
    if (ts.isIdentifier(node)) occupiedIdentifiers.add(node.text);
    declaredBindings += declaredBindingCount(node);
    if (
      isDirectEvalCall(node)
    ) {
      // A direct eval can observe every top-level lexical binding introduced
      // by this pass, even when its own source string is excluded. Therefore
      // one direct eval disables pooling for the complete chunk.
      containsDirectEval = true;
    }
    if (
      isPoolableStringValue(node) &&
      node.text.length >= normalized.minimumStringLength
    ) {
      const occurrence = Object.freeze({
        end: node.end,
        start: node.getStart(sourceFile),
      });
      const existing = occurrencesByValue.get(node.text);
      if (existing === undefined) occurrencesByValue.set(node.text, [occurrence]);
      else existing.push(occurrence);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (containsDirectEval) {
    return Object.freeze({
      changed: false,
      code: source,
      estimatedIdentifierBytes: null,
      estimatedSavings: 0,
      pooledOccurrenceCount: 0,
      pooledValueCount: 0,
      skipReason: "direct-eval",
    });
  }


  const potentialPoolBindingCount = [...occurrencesByValue.values()]
    .filter((occurrences) =>
      occurrences.length >= normalized.minimumOccurrences)
    .length;
  const estimatedIdentifierBytes = conservativeIdentifierByteAllowance(
    declaredBindings,
    occupiedIdentifiers.size,
    potentialPoolBindingCount,
  );

  const groups = [...occurrencesByValue.entries()]
    .map(([value, occurrences]) => Object.freeze({
      estimatedSavings: estimatedMinifiedSavings(
        value,
        occurrences.length,
        estimatedIdentifierBytes,
      ),
      firstStart: occurrences[0].start,
      occurrences: Object.freeze([...occurrences]),
      value,
    }))
    .filter((group) =>
      group.occurrences.length >= normalized.minimumOccurrences &&
      group.estimatedSavings >= normalized.minimumEstimatedSavings)
    .sort((left, right) =>
      left.firstStart - right.firstStart || left.value.localeCompare(right.value));

  const offset = insertionOffset(source, sourceFile);
  const separator = insertionSeparator(source, offset);
  // `const ` is six bytes. Each binding's comma-or-semicolon is already in its
  // group contribution; an ASI/hashbang separator is paid exactly when needed.
  const fixedDeclarationBytes = 6 + separator.length;
  const aggregateEstimatedSavings = groups.reduce(
    (total, group) => total + group.estimatedSavings,
    -fixedDeclarationBytes,
  );

  if (
    groups.length === 0 ||
    aggregateEstimatedSavings < normalized.minimumEstimatedSavings
  ) {
    return Object.freeze({
      changed: false,
      code: source,
      estimatedSavings: 0,
      pooledOccurrenceCount: 0,
      pooledValueCount: 0,
      estimatedIdentifierBytes,
      skipReason: null,
    });
  }

  const declarations = [];
  const replacements = [];
  let ordinal = 0;
  let totalEstimatedSavings = -fixedDeclarationBytes;
  for (const group of groups) {
    const allocation = nextIdentifier(
      normalized.identifierPrefix,
      occupiedIdentifiers,
      ordinal,
    );
    ordinal = allocation.nextOrdinal;
    declarations.push(
      `${allocation.identifier}=${encodedString(group.value)}`,
    );
    totalEstimatedSavings += group.estimatedSavings;
    for (const occurrence of group.occurrences) {
      replacements.push(Object.freeze({
        end: occurrence.end,
        replacement: allocation.identifier,
        start: occurrence.start,
      }));
    }
  }

  replacements.sort((left, right) => right.start - left.start);
  let code = source;
  for (const replacement of replacements) {
    code = code.slice(0, replacement.start) +
      replacement.replacement +
      code.slice(replacement.end);
  }
  const declaration = `const ${declarations.join(",")};`;
  code = code.slice(0, offset) + separator + declaration + code.slice(offset);

  return Object.freeze({
    changed: true,
    code,
    estimatedSavings: totalEstimatedSavings,
    pooledOccurrenceCount: replacements.length,
    pooledValueCount: groups.length,
    estimatedIdentifierBytes,
    skipReason: null,
  });
}

export function createRepeatedStringValuePoolingPlugin(options = {}) {
  const normalized = normalizeOptions(options);
  return {
    name: "choice-of-life-repeated-string-value-pooling",
    apply: "build",
    enforce: "pre",
    renderChunk: {
      order: "pre",
      handler(code, _chunk, outputOptions) {
        if (outputOptions.format !== "es") {
          fail("the production pooling plugin requires Rollup ES-module output");
        }
        if (outputOptions.sourcemap) {
          fail("the production pooling plugin requires source maps to be disabled");
        }
        const result = poolRepeatedStringValues(code, normalized);
        return result.changed ? { code: result.code, map: null } : null;
      },
    },
  };
}
