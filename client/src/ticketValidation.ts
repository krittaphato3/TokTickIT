import type { CreateTicketInput } from './api';

// Mirrors BR-11 exactly as the server enforces it: title required, trimmed,
// 1–120 chars; description optional, ≤ 4000 chars; category, related system
// and priority must be present/valid. The server re-validates authoritatively;
// these client rules only prevent requests that cannot succeed.
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 4000;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export interface FieldIssue {
  field: 'title' | 'description' | 'categoryId' | 'priority' | 'relatedSystemId';
  message: string;
}

export function validateCreateTicketInput(
  input: Omit<CreateTicketInput, 'priority'> & { priority?: string },
): FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (input.title.trim().length === 0) {
    issues.push({ field: 'title', message: 'Title is required' });
  } else if (input.title.trim().length > MAX_TITLE_LENGTH) {
    issues.push({
      field: 'title',
      message: 'Title must be 120 characters or fewer',
    });
  }

  if (
    input.description !== undefined &&
    input.description.length > MAX_DESCRIPTION_LENGTH
  ) {
    issues.push({
      field: 'description',
      message: 'Description must be 4000 characters or fewer',
    });
  }

  if (!input.categoryId) {
    issues.push({ field: 'categoryId', message: 'Category is required' });
  }

  if (!input.relatedSystemId) {
    issues.push({
      field: 'relatedSystemId',
      message: 'Related system is required',
    });
  }

  if (!PRIORITIES.includes(input.priority as (typeof PRIORITIES)[number])) {
    issues.push({
      field: 'priority',
      message: 'Priority must be one of LOW, MEDIUM, HIGH, CRITICAL',
    });
  }

  return issues;
}

// Field order defines where focus lands first on invalid submit (AC-20).
export const FIELD_ORDER: FieldIssue['field'][] = [
  'title',
  'description',
  'categoryId',
  'relatedSystemId',
  'priority',
];
