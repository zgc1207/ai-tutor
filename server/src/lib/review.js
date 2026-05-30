const REVIEW_OFFSETS = {
  D1: 1,
  D3: 3,
  D7: 7,
  D15: 15,
};

export function buildReviewSchedule(baseDate = new Date()) {
  return Object.entries(REVIEW_OFFSETS).map(([cycle, days]) => {
    const dueAt = new Date(baseDate);
    dueAt.setDate(dueAt.getDate() + days);
    return { cycle, dueAt };
  });
}
