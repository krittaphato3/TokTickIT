import { HttpError } from './ticket.service.js';

// Lab 4 (L4-3, D-04/BR-07) — optimistic locking shared by every workflow write
// and by the Actions Taken PATCHes introduced in L4-2. One module owns the
// status codes, the envelope and the message wording so a stale write from any
// endpoint is indistinguishable to a client.
//
// Contract (api-spec §1.6):
//   missing/invalid expectedVersion -> 400 VALIDATION with a field detail
//   mismatch                        -> 409 CONFLICT with `currentVersion`
//   success                         -> the caller increments the version by 1

export const STALE_VERSION_MESSAGE = 'This record was changed by someone else';

export function validationFailure(field: string, message: string): never {
  throw new HttpError(400, 'Validation failed', [{ field, message }], 'VALIDATION');
}

// An absent version is a client bug, not a conflict: it is reported as
// validation so the caller fixes the request instead of retrying blindly.
export function parseExpectedVersion(raw: unknown): number {
  if (raw === undefined || raw === null) {
    validationFailure('expectedVersion', 'expectedVersion is required');
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    validationFailure('expectedVersion', 'expectedVersion must be an integer');
  }
  return raw as number;
}

// Throws the documented 409 with the persisted version, and writes nothing.
export function assertExpectedVersion(currentVersion: number, expectedVersion: number): void {
  if (currentVersion !== expectedVersion) {
    throw new HttpError(
      409,
      STALE_VERSION_MESSAGE,
      [
        {
          field: 'expectedVersion',
          message: `Expected version ${expectedVersion}, stored version is ${currentVersion}`,
        },
      ],
      'CONFLICT',
      { currentVersion },
    );
  }
}
