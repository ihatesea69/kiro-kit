import yaml from 'js-yaml';
import { KKError, ErrorCodes } from './errors.js';

const FM_DELIMITER = '---';

export interface FrontMatter {
  [key: string]: unknown;
}

export interface ParsedFile {
  frontMatter: FrontMatter;
  body: string;
}

/**
 * Parse front-matter delimited by `---` from markdown content.
 */
export function parse(content: string): ParsedFile {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== FM_DELIMITER) {
    return { frontMatter: {}, body: content };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === FM_DELIMITER) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontMatter: {}, body: content };
  }

  const yamlBlock = lines.slice(1, endIndex).join('\n');
  let frontMatter: FrontMatter;

  try {
    const parsed = yaml.load(yamlBlock);
    frontMatter = (parsed && typeof parsed === 'object' ? parsed : {}) as FrontMatter;
  } catch {
    throw new KKError(
      ErrorCodes.FRONTMATTER_INVALID,
      'Front-matter YAML is malformed.',
      'Check for proper YAML syntax between --- delimiters.',
    );
  }

  const body = lines.slice(endIndex + 1).join('\n').replace(/^\n/, '');
  return { frontMatter, body };
}

/**
 * Serialize front-matter and body back to string.
 */
export function print(fm: FrontMatter, body: string): string {
  if (Object.keys(fm).length === 0) {
    return body;
  }
  const yamlStr = yaml.dump(fm, { lineWidth: -1, noRefs: true }).trimEnd();
  return `${FM_DELIMITER}\n${yamlStr}\n${FM_DELIMITER}\n${body}`;
}

type ArtifactKind = 'agent' | 'command' | 'skill' | 'steering';

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate front-matter fields based on artifact type.
 */
export function validateByType(
  fm: FrontMatter,
  kind: ArtifactKind,
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (kind) {
    case 'agent':
      if (!fm['name'] || typeof fm['name'] !== 'string') {
        errors.push({ field: 'name', message: 'Agent requires "name" field (string).' });
      }
      if (!fm['description'] || typeof fm['description'] !== 'string') {
        errors.push({ field: 'description', message: 'Agent requires "description" field (string).' });
      }
      break;

    case 'command':
      if (!fm['description'] || typeof fm['description'] !== 'string') {
        errors.push({ field: 'description', message: 'Command requires "description" field (string).' });
      }
      break;

    case 'skill':
      if (!fm['name'] || typeof fm['name'] !== 'string') {
        errors.push({ field: 'name', message: 'Skill requires "name" field (string).' });
      }
      if (!fm['description'] || typeof fm['description'] !== 'string') {
        errors.push({ field: 'description', message: 'Skill requires "description" field (string).' });
      }
      break;

    case 'steering':
      if (!fm['inclusion'] || typeof fm['inclusion'] !== 'string') {
        errors.push({ field: 'inclusion', message: 'Steering requires "inclusion" field (string).' });
      }
      if (!fm['description'] || typeof fm['description'] !== 'string') {
        errors.push({ field: 'description', message: 'Steering requires "description" field (string).' });
      }
      if (fm['inclusion'] === 'fileMatch' && !fm['fileMatchPattern']) {
        errors.push({
          field: 'fileMatchPattern',
          message: 'Steering with inclusion=fileMatch requires "fileMatchPattern".',
        });
      }
      break;
  }

  return errors;
}
