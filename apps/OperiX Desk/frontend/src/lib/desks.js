export function isResourceAvailable(resource) {
  return resource?.is_available !== false;
}

export function isResourceReservedByOther(resource) {
  return resource?.is_available === false && !resource?.is_mine;
}

export function getAlternativeDesks(resources, desk, limit = 3) {
  if (!desk || desk.type !== 'desk') return [];

  const score = (resource) => {
    let value = 0;
    if (resource.floor === desk.floor) value += 2;
    if (resource.zone === desk.zone) value += 1;
    return value;
  };

  return resources
    .filter(
      (resource) =>
        resource.type === 'desk' &&
        isResourceAvailable(resource) &&
        !resource.is_mine &&
        resource.id !== desk.id,
    )
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
