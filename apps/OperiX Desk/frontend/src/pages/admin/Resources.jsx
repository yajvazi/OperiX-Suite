import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  createResource,
  deleteResource,
  getFloorPlans,
  getResources,
  updateResource,
} from '../../api/client';
import PageHeader from '../../components/ui/PageHeader';
import { SkeletonCard, SkeletonTable } from '../../components/ui/Skeleton';
import { ZONE_OPTIONS } from '../../lib/constants';
import { compareNatural, sortByNaturalFloor, sortByNaturalName } from '../../lib/sort';
import { showConfirmToast } from '../../lib/toast';

const DESK_FEATURE_OPTIONS = [
  'Near window',
  'Charging station',
  'Dual monitors',
  'Standing desk',
  'Ergonomic chair',
  'Quiet zone',
  'Near team',
  'Near coffee bar',
  'Docking station',
  'Phone booth nearby',
];

const DESK_TYPE_OPTIONS = [
  'Hot Desk',
  'Window Desk',
  'Focus Desk',
  'Standing Desk',
  'Team Pod',
  'Executive Desk',
  'Meeting Room',
  'Kitchen',
  'Library',
  'Break Area',
  'Printer Area',
  'Reception',
];
const CAPACITY_OPTIONS = [1, 2, 4, 6, 8, 10, 12];
const CUSTOM_VALUE = '__custom__';

const emptyForm = {
  name: '',
  type: 'desk',
  building: 'HQ - Prishtina',
  floor: '',
  zone: 'Open Area',
  capacity: 1,
  desk_type: 'Hot Desk',
  amenities: '',
  restricted_to_team_leaders: false,
};

function OptionField({
  label,
  value,
  options,
  onChange,
  customPlaceholder,
  normalize = (nextValue) => nextValue,
  allowCustom = true,
}) {
  const isCustom = value && !options.includes(value);
  const selectValue = allowCustom && isCustom ? CUSTOM_VALUE : value;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <select
        value={selectValue}
        onChange={(e) => {
          if (allowCustom && e.target.value === CUSTOM_VALUE) {
            onChange('');
            return;
          }
          onChange(normalize(e.target.value));
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {allowCustom && <option value={CUSTOM_VALUE}>Custom</option>}
      </select>
      {allowCustom && (isCustom || value === '') && (
        <input
          placeholder={customPlaceholder}
          value={value}
          onChange={(e) => onChange(normalize(e.target.value))}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterFloor, setFilterFloor] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [floorPlans, setFloorPlans] = useState([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState([]);
  const [bulkCount, setBulkCount] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = () =>
    getResources()
      .then((data) => setResources(sortByNaturalName(data)))
      .finally(() => setLoading(false));

  const buildingOptions = useMemo(
    () => [...new Set(floorPlans.map((plan) => plan.building).filter(Boolean))].sort(),
    [floorPlans],
  );

  const floorOptions = useMemo(
    () =>
      [...new Set(floorPlans.map((plan) => plan.floor).filter(Boolean))].sort(
        compareNatural,
      ),
    [floorPlans],
  );

  const zoneChoices = useMemo(
    () => [...new Set([...ZONE_OPTIONS, ...resources.map((resource) => resource.zone).filter(Boolean)])].sort(),
    [resources],
  );

  const deskTypeChoices = useMemo(
    () =>
      [...new Set([...DESK_TYPE_OPTIONS, ...resources.map((resource) => resource.desk_type).filter(Boolean)])].sort(),
    [resources],
  );

  const selectedFloorPlan = useMemo(
    () => floorPlans.find((plan) => plan.floor === form.floor) ?? null,
    [floorPlans, form.floor],
  );

  useEffect(() => {
    load().catch(() => toast.error('Could not load resources.'));
    getFloorPlans().then((data) => setFloorPlans(sortByNaturalFloor(data))).catch(() => toast.error('Could not load floor plans.'));
  }, []);

  useEffect(() => {
    if (!showForm || form.floor || floorOptions.length === 0) return;
    const defaultFloor = floorOptions[0];
    const matchingPlan = floorPlans.find((plan) => plan.floor === defaultFloor);
    setForm((current) => ({
      ...current,
      floor: defaultFloor,
      building: matchingPlan?.building ?? current.building,
    }));
  }, [showForm, form.floor, floorOptions, floorPlans]);

  const visibleResources = sortByNaturalName(resources.filter((resource) => {
    if (filterBuilding && resource.building !== filterBuilding) return false;
    if (filterFloor && resource.floor !== filterFloor) return false;
    return true;
  }));

  const selectedAmenities = useMemo(
    () =>
      form.amenities
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    [form.amenities],
  );

  const toggleAmenity = (amenity) => {
    const nextAmenities = selectedAmenities.includes(amenity)
      ? selectedAmenities.filter((item) => item !== amenity)
      : [...selectedAmenities, amenity];
    setForm({ ...form, amenities: nextAmenities.join(', ') });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await updateResource(editing, form);
        setEditing(null);
        toast.success(`${form.name} updated.`);
      } else {
        const count = Math.max(1, Number(bulkCount) || 1);
        await Promise.all(
          Array.from({ length: count }, (_, index) =>
            createResource({
              ...form,
              name: count === 1 ? form.name : `${form.name} ${index + 1}`,
            }),
          ),
        );
        toast.success(count === 1 ? `${form.name} created.` : `${count} resources created.`);
      }
      setForm(emptyForm);
      setShowForm(false);
      setBulkCount(1);
      await load();
    } catch (error) {
      toast.error(String(error?.response?.data?.detail ?? 'Could not save this resource.'));
    }
  };

  const handleEdit = (resource) => {
    setForm({
      name: resource.name,
      type: resource.type,
      building: resource.building ?? 'HQ - Prishtina',
      floor: resource.floor,
      zone: resource.zone,
      capacity: resource.capacity,
      desk_type: resource.desk_type ?? '',
      amenities: resource.amenities ?? '',
      restricted_to_team_leaders: Boolean(resource.restricted_to_team_leaders),
    });
    setEditing(resource.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const resource = resources.find((item) => item.id === id);
    showConfirmToast({
      message: `Remove ${resource?.name ?? 'this resource'}? Active bookings will be flagged.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        try {
          await deleteResource(id);
          setSelectedResourceIds((current) => current.filter((resourceId) => resourceId !== id));
          toast.success(`${resource?.name ?? 'Resource'} removed.`);
          await load();
        } catch (error) {
          toast.error(String(error?.response?.data?.detail ?? 'Could not remove this resource.'));
        }
      },
    });
  };

  const toggleResourceSelection = (id) => {
    setSelectedResourceIds((current) =>
      current.includes(id) ? current.filter((resourceId) => resourceId !== id) : [...current, id],
    );
  };

  const toggleAllVisible = (checked) => {
    setSelectedResourceIds(checked ? visibleResources.map((resource) => resource.id) : []);
  };

  const handleBulkDelete = async () => {
    if (!selectedResourceIds.length) return;
    showConfirmToast({
      message: `Remove ${selectedResourceIds.length} selected resources? Active bookings will be flagged.`,
      confirmLabel: 'Remove selected',
      onConfirm: async () => {
        try {
          await Promise.all(selectedResourceIds.map((id) => deleteResource(id)));
          toast.success(`${selectedResourceIds.length} resources removed.`);
          setSelectedResourceIds([]);
          await load();
        } catch (error) {
          toast.error(String(error?.response?.data?.detail ?? 'Could not remove selected resources.'));
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Resource Inventory"
        subtitle="Manage desks, meeting rooms, HQ location, floors, and workspace zones"
        action={
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              setEditing(null);
              setForm({
                ...emptyForm,
                floor: floorOptions[0] ?? '',
                building: buildingOptions[0] ?? 'HQ - Prishtina',
              });
            }}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus size={16} />
            Add Resource
          </button>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:flex lg:flex-wrap">
        <select
          value={filterBuilding}
          onChange={(e) => setFilterBuilding(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm lg:w-auto"
        >
          <option value="">All HQ locations</option>
          {buildingOptions.map((building) => (
            <option key={building} value={building}>
              {building}
            </option>
          ))}
        </select>
        <select
          value={filterFloor}
          onChange={(e) => setFilterFloor(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm lg:w-auto"
        >
          <option value="">All floors</option>
          {floorOptions.map((floor) => (
            <option key={floor} value={floor}>
              Floor {floor}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
        >
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Resource Name
            </label>
            <input
              placeholder="Name (e.g. Desk A-15)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Resource Type
            </label>
            <select
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value,
                  desk_type:
                    e.target.value === 'room'
                      ? 'Meeting Room'
                      : e.target.value === 'amenity'
                        ? 'Kitchen'
                        : form.desk_type,
                  capacity: e.target.value === 'amenity' ? 0 : form.capacity || 1,
                })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="desk">Desk</option>
              <option value="room">Room</option>
              <option value="amenity">Amenity marker</option>
            </select>
          </div>

          <OptionField
            label="Floor"
            value={form.floor}
            options={floorOptions}
            onChange={(value) => {
              const matchingPlan = floorPlans.find((plan) => plan.floor === value);
              setForm({
                ...form,
                floor: value,
                building: matchingPlan?.building ?? '',
              });
            }}
            customPlaceholder="Enter floor"
            allowCustom={false}
          />

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              HQ Location
            </label>
            <input
              value={selectedFloorPlan?.building ?? form.building}
              readOnly
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              HQ location is tied to the selected floor plan.
            </p>
          </div>

          <OptionField
            label="Zone"
            value={form.zone}
            options={zoneChoices}
            onChange={(value) => setForm({ ...form, zone: value })}
            customPlaceholder="Enter zone"
          />

          <OptionField
            label={form.type === 'amenity' ? 'Amenity Type' : 'Desk Type'}
            value={form.desk_type}
            options={
              form.type === 'room'
                ? ['Meeting Room']
                : form.type === 'amenity'
                  ? ['Kitchen', 'Library', 'Break Area', 'Printer Area', 'Reception']
                  : deskTypeChoices.filter((item) => item !== 'Meeting Room')
            }
            onChange={(value) => setForm({ ...form, desk_type: value })}
            customPlaceholder={
              form.type === 'room'
                ? 'Enter room type'
                : form.type === 'amenity'
                  ? 'Enter amenity type'
                  : 'Enter desk type'
            }
          />

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Capacity
            </label>
            <select
              value={String(form.capacity)}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={form.type === 'amenity'}
            >
              {CAPACITY_OPTIONS.map((capacity) => (
                <option key={capacity} value={capacity}>
                  {capacity} {capacity === 1 ? 'person' : 'people'}
                </option>
              ))}
            </select>
            {form.type === 'amenity' && (
              <p className="mt-1 text-xs text-slate-500">
                Amenity markers are map labels only and cannot be booked.
              </p>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Amenities
            </label>
            <input
              placeholder="Amenities (comma-separated)"
              value={form.amenities}
              onChange={(e) => setForm({ ...form, amenities: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2 lg:col-span-3">
            <input
              type="checkbox"
              checked={form.restricted_to_team_leaders}
              onChange={(e) => setForm({ ...form, restricted_to_team_leaders: e.target.checked })}
              className="mt-1 rounded border-slate-300 text-brand-600"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">
                Team leaders only
              </span>
              <span className="mt-1 block text-sm text-slate-500">
                Only team leaders can reserve this desk or room. Team leaders can assign restricted desks to members of their own team.
              </span>
            </span>
          </label>

          <div className="sm:col-span-2 lg:col-span-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Desk Feature Options
            </p>
            <div className="flex flex-wrap gap-2">
              {DESK_FEATURE_OPTIONS.map((amenity) => {
                const active = selectedAmenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      active
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50'
                    }`}
                  >
                    {amenity}
                  </button>
                );
              })}
            </div>
          </div>

          {!editing && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bulk Quantity
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={bulkCount}
                onChange={(e) => setBulkCount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Names will be numbered when creating more than one.
              </p>
            </div>
          )}

          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
            >
              {editing ? 'Update' : bulkCount > 1 ? `Create ${bulkCount}` : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setForm({
                  ...emptyForm,
                  floor: floorOptions[0] ?? '',
                  building: buildingOptions[0] ?? 'HQ - Prishtina',
                });
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {selectedResourceIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <span>{selectedResourceIds.length} resources selected</span>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete selected
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-3">
            <div className="md:hidden">
              <SkeletonCard rows={6} />
            </div>
            <div className="hidden md:block">
              <SkeletonTable rows={7} columns={8} />
            </div>
          </div>
        ) : (
        <>
        <div className="divide-y divide-slate-100 p-3 md:hidden">
          {visibleResources.map((resource) => (
            <article key={resource.id} className="rounded-xl px-2 py-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedResourceIds.includes(resource.id)}
                  onChange={() => toggleResourceSelection(resource.id)}
                  className="mt-1 rounded border-slate-300 text-brand-600"
                  aria-label={`Select ${resource.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900">{resource.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {resource.building ?? 'HQ - Prishtina'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-700">
                      {resource.type}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <span className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <strong className="block text-slate-500">Floor</strong>
                      {resource.floor}
                    </span>
                    <span className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <strong className="block text-slate-500">Zone</strong>
                      {resource.zone}
                    </span>
                    <span className="col-span-2 rounded-lg bg-slate-50 px-2.5 py-2">
                      <strong className="block text-slate-500">Desk Type</strong>
                      {resource.desk_type ?? '-'}
                    </span>
                    <span className="col-span-2 rounded-lg bg-slate-50 px-2.5 py-2">
                      <strong className="block text-slate-500">Access</strong>
                      {resource.restricted_to_team_leaders ? 'Team leaders only' : 'Open'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(resource)}
                      className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(resource.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
          {visibleResources.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              No resources found for these filters.
            </p>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1040px] w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">
                <input
                  type="checkbox"
                  checked={visibleResources.length > 0 && selectedResourceIds.length === visibleResources.length}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600"
                  aria-label="Select all visible resources"
                />
              </th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">HQ Location</th>
              <th className="px-4 py-3 font-medium">Floor</th>
              <th className="px-4 py-3 font-medium">Zone</th>
              <th className="px-4 py-3 font-medium">Desk Type</th>
              <th className="px-4 py-3 font-medium">Access</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleResources.map((resource) => (
              <tr key={resource.id} className="border-b border-slate-100">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedResourceIds.includes(resource.id)}
                    onChange={() => toggleResourceSelection(resource.id)}
                    className="rounded border-slate-300 text-brand-600"
                    aria-label={`Select ${resource.name}`}
                  />
                </td>
                <td className="px-4 py-3 font-medium">{resource.name}</td>
                <td className="px-4 py-3 capitalize">{resource.type}</td>
                <td className="px-4 py-3">{resource.building ?? 'HQ - Prishtina'}</td>
                <td className="px-4 py-3">{resource.floor}</td>
                <td className="px-4 py-3">{resource.zone}</td>
                <td className="px-4 py-3">{resource.desk_type ?? '-'}</td>
                <td className="px-4 py-3">
                  {resource.restricted_to_team_leaders ? (
                    <span className="badge-amber">Team leaders only</span>
                  ) : (
                    <span className="text-slate-500">Open</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(resource)}
                      className="text-brand-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(resource.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
