export interface BuildingRemovalPresentation {
  actionLabel: string;
  confirmationLabel: string;
  tooltip: string;
  feedback: string;
}

/** Player-facing copy for the destructive building control; simulation still uses deleteEntity. */
export function buildingRemovalPresentation(buildProgress = 1000): BuildingRemovalPresentation {
  if (buildProgress < 1000) {
    return {
      actionLabel: 'Cancel construction',
      confirmationLabel: 'Tap again to cancel',
      tooltip: 'Cancel construction\nRemoves this unfinished foundation and refunds its unbuilt cost.',
      feedback: 'Construction cancelled — cost refunded',
    };
  }
  return {
    actionLabel: 'Destroy building',
    confirmationLabel: 'Tap again to destroy',
    tooltip: 'Destroy building\nPermanently removes this building; its construction cost is not refunded.\nGarrisoned units die. Queued units and research are cancelled and refunded.',
    feedback: 'Building destroyed',
  };
}
