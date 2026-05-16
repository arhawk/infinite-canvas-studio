function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

export function getPageNavigationDirectionVector(direction) {
  switch (direction) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    default:
      return null;
  }
}

export function scoreDirectionalNavigationCandidate({
  origin,
  target,
  direction,
} = {}) {
  const axis = getPageNavigationDirectionVector(direction);
  if (!axis || !isFinitePoint(origin) || !isFinitePoint(target)) {
    return null;
  }

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) {
    return null;
  }

  const alongAxisDistance = dx * axis.x + dy * axis.y;
  if (!(alongAxisDistance > 0)) {
    return null;
  }

  const perpendicularDistance = Math.abs(dx * axis.y - dy * axis.x);
  return {
    angle: Math.atan2(perpendicularDistance, alongAxisDistance),
    distance,
    alongAxisDistance,
    perpendicularDistance,
  };
}

function compareDirectionalScores(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  if (left.angle !== right.angle) {
    return left.angle - right.angle;
  }

  if (left.distance !== right.distance) {
    return left.distance - right.distance;
  }

  if (left.alongAxisDistance !== right.alongAxisDistance) {
    return right.alongAxisDistance - left.alongAxisDistance;
  }

  return left.perpendicularDistance - right.perpendicularDistance;
}

export function chooseDirectionalNavigationCandidate({
  origin,
  direction,
  candidates = [],
} = {}) {
  let best = null;

  for (const candidate of candidates) {
    const target = candidate?.target ?? candidate?.point ?? candidate?.center ?? null;
    const score = scoreDirectionalNavigationCandidate({
      origin,
      target,
      direction,
    });
    if (!score) continue;

    const enrichedCandidate = {
      ...candidate,
      target,
      score,
    };

    if (!best || compareDirectionalScores(enrichedCandidate.score, best.score) < 0) {
      best = enrichedCandidate;
    }
  }

  return best;
}
