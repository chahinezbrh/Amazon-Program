import * as ts from 'typescript';
import { hashSource } from '../../shared/hash';

export interface ExtractedFunction {
  name: string;
  startLine: number; // 1-indexed
  endLine: number;
  bodyText: string;
  hash: string;
}

export function extractFunctions(fileText: string, fileName: string): ExtractedFunction[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    fileText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') || fileName.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS
  );

  const results: ExtractedFunction[] = [];

  function getName(node: ts.Node): string | undefined {
    if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      return node.name.text;
    }
    return undefined;
  }

  function visit(node: ts.Node) {
    const name = getName(node);
    if (name) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const bodyText = node.getText(sourceFile);
      results.push({
        name,
        startLine: start,
        endLine: end,
        bodyText,
        hash: hashSource(bodyText), // <-- shared implementation, not a local one
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}