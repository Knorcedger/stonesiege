import { describe, expect, it } from 'vitest';
import { buildingRemovalPresentation } from './buildingRemoval';

describe('building removal presentation', () => {
  it('describes completed buildings as destroyed and warns about every consequence', () => {
    const presentation = buildingRemovalPresentation(1000);

    expect(presentation.actionLabel).toBe('Destroy building');
    expect(presentation.confirmationLabel).toBe('Tap again to destroy');
    expect(presentation.feedback).toBe('Building destroyed');
    expect(presentation.tooltip).toContain('construction cost is not refunded');
    expect(presentation.tooltip).toContain('Garrisoned units die');
    expect(presentation.tooltip).toContain('Queued units and research are cancelled and refunded');
    expect(Object.values(presentation).join(' ')).not.toContain('Delete building');
  });

  it('keeps unfinished foundations as cancellation with an unbuilt-cost refund', () => {
    const presentation = buildingRemovalPresentation(999);

    expect(presentation).toEqual({
      actionLabel: 'Cancel construction',
      confirmationLabel: 'Tap again to cancel',
      tooltip: 'Cancel construction\nRemoves this unfinished foundation and refunds its unbuilt cost.',
      feedback: 'Construction cancelled — cost refunded',
    });
  });
});
