import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  computeSha256,
  REMOVE_REASON_CODES,
  toAttachmentDto,
  validateRemoveBody,
} from '../../../src/services/attachment.service.js';

// DB-free unit coverage for the audit ledger's pure logic (runs without PostgreSQL).

describe('attachment audit pure logic', () => {
  it('computeSha256 matches node:crypto hex digest', () => {
    const buf = Buffer.from('audit-bytes-123');
    expect(computeSha256(buf)).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
    expect(computeSha256(Buffer.alloc(0))).toHaveLength(64);
  });

  it('validateRemoveBody accepts missing/empty bodies', () => {
    expect(validateRemoveBody(undefined)).toEqual({ reasonCode: null, note: null });
    expect(validateRemoveBody(null)).toEqual({ reasonCode: null, note: null });
    expect(validateRemoveBody({})).toEqual({ reasonCode: null, note: null });
  });

  it('validateRemoveBody accepts every reason code + 200-char note', () => {
    for (const reasonCode of REMOVE_REASON_CODES) {
      expect(validateRemoveBody({ reasonCode, note: 'x'.repeat(200) })).toEqual({
        reasonCode,
        note: 'x'.repeat(200),
      });
    }
  });

  it('validateRemoveBody rejects unknown code, overlong/non-string note', () => {
    for (const body of [
      { reasonCode: 'Nope' },
      { reasonCode: 'Other', note: 'x'.repeat(201) },
      { note: 42 },
    ]) {
      try {
        validateRemoveBody(body);
        expect.unreachable();
      } catch (err) {
        const http = err as { status: number; details: { field: string }[] };
        expect(http.status).toBe(400);
        expect(http.details.length).toBeGreaterThan(0);
      }
    }
    expect(() => validateRemoveBody('reasonCode')).toThrowError(/Invalid JSON body/);
  });

  it('toAttachmentDto keeps old fields and exposes sha256/removeReason/removeNote', () => {
    const uploadedAt = new Date('2026-09-14T00:00:00Z');
    const dto = toAttachmentDto({
      id: 1,
      fileName: 'a.png',
      mimeType: 'image/png',
      sizeBytes: 10,
      sha256: 'abc',
      uploadedAt,
      removedAt: null,
      removeReason: null,
      removeNote: null,
    });
    expect(dto).toEqual({
      id: 1,
      fileName: 'a.png',
      mimeType: 'image/png',
      sizeBytes: 10,
      sha256: 'abc',
      uploadedAt,
      removedAt: null,
      removeReason: null,
      removeNote: null,
    });
  });
});
