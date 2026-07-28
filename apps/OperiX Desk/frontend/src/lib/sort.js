const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function compareNatural(a = '', b = '') {
  return naturalCollator.compare(a, b);
}

export function sortByNaturalName(items) {
  return items
    .slice()
    .sort((a, b) => compareNatural(a.name ?? '', b.name ?? ''));
}

export function sortByNaturalFloor(items) {
  return items
    .slice()
    .sort((a, b) => compareNatural(a.floor ?? '', b.floor ?? ''));
}
