import { produce } from 'immer';
import { buildSeed } from '../seed';
import { finishAttachmentScans } from './scheduler';

describe('scheduled tasks', () => {
  it('finishes attachment scans once the scan time has passed (idempotent)', () => {
    const seed = buildSeed();
    seed.attachments[0]!.scanStatus = 'pending';
    seed.attachments[0]!.uploadedAt = '2027-04-06T09:00';
    const before = produce(seed, (d) => finishAttachmentScans(d, '2027-04-06T09:00'));
    expect(before.attachments[0]!.scanStatus).toBe('pending');
    const after = produce(seed, (d) => finishAttachmentScans(d, '2027-04-06T09:01'));
    expect(after.attachments[0]!.scanStatus).toBe('clean');
    expect(produce(after, (d) => finishAttachmentScans(d, '2027-04-06T09:02'))).toBe(after);
  });
});
