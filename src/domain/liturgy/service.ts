import { getLiturgyMassTypeModel } from "@/models/LiturgyMassType";
import { getLiturgyRoleModel } from "@/models/LiturgyRole";
import { getMassModel } from "@/models/Mass";
import { DEFAULT_LITURGY_MASS_TYPES, DEFAULT_LITURGY_ROLES } from "@/src/domain/liturgy/defaults";

const normalizeKey = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

const dedupeRoleKeys = (roleKeys: string[]): string[] => Array.from(new Set(roleKeys.map((key) => normalizeLiturgyRoleKey(key))));

const isNumericRoleKey = (value: string): boolean => /^[0-9]+$/.test(value);
const normalizeTextToken = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, " ");

const dedupeByKey = <T extends { key: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = normalizeKey(item.key);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
};

async function normalizeExistingRoleKeys(): Promise<Map<string, string>> {
  const roles = await getLiturgyRoleModel()
    .find({})
    .sort({ updatedAt: -1, createdAt: -1, _id: 1 })
    .select("_id key")
    .lean();

  const groups = new Map<string, typeof roles>();
  for (const role of roles) {
    const normalized = normalizeKey(role.key);
    const currentGroup = groups.get(normalized) ?? [];
    currentGroup.push(role);
    groups.set(normalized, currentGroup);
  }

  const idsToDelete: Array<{ toString(): string }> = [];
  const mapping = new Map<string, string>();

  for (const [normalizedKey, groupedRoles] of groups) {
    const keeper = groupedRoles[0]!;
    if (keeper.key !== normalizedKey) {
      await getLiturgyRoleModel().updateOne({ _id: keeper._id }, { $set: { key: normalizedKey } });
    }
    mapping.set(normalizeKey(keeper.key), normalizedKey);

    for (const role of groupedRoles.slice(1)) {
      mapping.set(normalizeKey(role.key), normalizedKey);
      idsToDelete.push(role._id);
    }
  }

  if (idsToDelete.length > 0) {
    await getLiturgyRoleModel().deleteMany({ _id: { $in: idsToDelete } });
  }

  return mapping;
}

async function remapRoleKeysToNumeric(): Promise<void> {
  const roles = await getLiturgyRoleModel()
    .find({})
    .sort({ score: -1, label: 1, createdAt: 1, _id: 1 })
    .select("_id key")
    .lean();

  if (roles.length === 0) return;

  const alreadyNumericUnique =
    roles.every((role) => isNumericRoleKey(role.key)) &&
    new Set(roles.map((role) => role.key)).size === roles.length;
  if (alreadyNumericUnique) return;

  const remap = new Map<string, string>();
  roles.forEach((role, index) => {
    const nextKey = String(index + 1);
    remap.set(role.key, nextKey);
    remap.set(normalizeKey(role.key), nextKey);
  });

  for (const role of roles) {
    await getLiturgyRoleModel().updateOne({ _id: role._id }, { $set: { key: `TMP_${role._id.toString()}` } });
  }
  for (const role of roles) {
    await getLiturgyRoleModel().updateOne({ _id: role._id }, { $set: { key: remap.get(role.key)! } });
  }

  const massTypes = await getLiturgyMassTypeModel().find({}).select("_id roleKeys fallbackRoleKey").lean();
  for (const massType of massTypes) {
    const nextRoleKeys = dedupeRoleKeys(
      (Array.isArray(massType.roleKeys) ? massType.roleKeys : []).map((roleKey) => remap.get(normalizeKey(roleKey)) ?? roleKey)
    );
    const fallbackRaw = typeof massType.fallbackRoleKey === "string" ? normalizeKey(massType.fallbackRoleKey) : null;
    const nextFallback = fallbackRaw ? remap.get(fallbackRaw) ?? null : null;
    await getLiturgyMassTypeModel().updateOne(
      { _id: massType._id },
      {
        $set: {
          roleKeys: nextRoleKeys,
          fallbackRoleKey: nextFallback,
        },
      }
    );
  }

  const masses = await getMassModel().find({ "assignments.0": { $exists: true } }).select("_id assignments").lean();
  for (const mass of masses) {
    const nextAssignments = (mass.assignments ?? []).map((assignment) => ({
      ...assignment,
      roleKey: remap.get(normalizeKey(assignment.roleKey)) ?? assignment.roleKey,
    }));
    await getMassModel().updateOne({ _id: mass._id }, { $set: { assignments: nextAssignments } });
  }
}

async function collapseDuplicateRolesByDefinition(): Promise<void> {
  const roles = await getLiturgyRoleModel()
    .find({})
    .sort({ updatedAt: -1, createdAt: -1, _id: 1 })
    .select("_id key label description score active")
    .lean();

  const bySignature = new Map<string, typeof roles>();
  for (const role of roles) {
    const signature = `${normalizeTextToken(role.label)}|${normalizeTextToken(role.description ?? "")}|${
      typeof role.score === "number" ? role.score : 0
    }|${Boolean(role.active)}`;
    const current = bySignature.get(signature) ?? [];
    current.push(role);
    bySignature.set(signature, current);
  }

  const keyRemap = new Map<string, string>();
  const idsToDelete: Array<{ toString(): string }> = [];

  for (const group of bySignature.values()) {
    if (group.length <= 1) continue;
    const keeper = group[0]!;
    for (const duplicate of group.slice(1)) {
      keyRemap.set(duplicate.key, keeper.key);
      idsToDelete.push(duplicate._id);
    }
  }

  if (keyRemap.size === 0 || idsToDelete.length === 0) return;

  const massTypes = await getLiturgyMassTypeModel().find({}).select("_id roleKeys fallbackRoleKey").lean();
  for (const massType of massTypes) {
    const nextRoleKeys = dedupeRoleKeys(
      (Array.isArray(massType.roleKeys) ? massType.roleKeys : []).map((roleKey) => keyRemap.get(roleKey) ?? roleKey)
    );
    const fallbackRaw =
      typeof massType.fallbackRoleKey === "string" && massType.fallbackRoleKey.trim()
        ? normalizeLiturgyRoleKey(massType.fallbackRoleKey)
        : null;
    const nextFallback = fallbackRaw ? keyRemap.get(fallbackRaw) ?? fallbackRaw : null;

    await getLiturgyMassTypeModel().updateOne(
      { _id: massType._id },
      {
        $set: {
          roleKeys: nextRoleKeys,
          fallbackRoleKey: nextFallback && nextRoleKeys.includes(nextFallback) ? nextFallback : null,
        },
      }
    );
  }

  const masses = await getMassModel().find({ "assignments.0": { $exists: true } }).select("_id assignments").lean();
  for (const mass of masses) {
    const nextAssignments = (mass.assignments ?? []).map((assignment) => ({
      ...assignment,
      roleKey: keyRemap.get(assignment.roleKey) ?? assignment.roleKey,
    }));
    await getMassModel().updateOne({ _id: mass._id }, { $set: { assignments: nextAssignments } });
  }

  await getLiturgyRoleModel().deleteMany({ _id: { $in: idsToDelete } });
}

async function normalizeMassTypesRoleKeys(): Promise<void> {
  const massTypes = await getLiturgyMassTypeModel().find({}).select("_id roleKeys fallbackRoleKey").lean();
  for (const massType of massTypes) {
    const roleKeys = dedupeRoleKeys(Array.isArray(massType.roleKeys) ? massType.roleKeys : []);
    const fallback =
      typeof massType.fallbackRoleKey === "string" && massType.fallbackRoleKey.trim()
        ? normalizeLiturgyRoleKey(massType.fallbackRoleKey)
        : null;
    await getLiturgyMassTypeModel().updateOne(
      { _id: massType._id },
      {
        $set: {
          roleKeys,
          fallbackRoleKey: fallback && roleKeys.includes(fallback) ? fallback : null,
        },
      }
    );
  }
}

export async function ensureLiturgyDefaults(): Promise<void> {
  await normalizeExistingRoleKeys();

  const rolesCount = await getLiturgyRoleModel().countDocuments();
  if (rolesCount === 0) {
    await getLiturgyRoleModel().insertMany(
      DEFAULT_LITURGY_ROLES.map((role) => ({
        key: normalizeKey(role.key),
        label: role.label,
        description: role.description,
        score: role.score,
        active: true,
      }))
    );
  }

  const massTypesCount = await getLiturgyMassTypeModel().countDocuments();
  if (massTypesCount === 0) {
    await getLiturgyMassTypeModel().insertMany(
      DEFAULT_LITURGY_MASS_TYPES.map((massType) => ({
        key: normalizeKey(massType.key),
        label: massType.label,
        roleKeys: massType.roleKeys.map((roleKey) => normalizeKey(roleKey)),
        fallbackRoleKey: "NONE",
        active: true,
      }))
    );
  } else {
    for (const massType of DEFAULT_LITURGY_MASS_TYPES) {
      await getLiturgyMassTypeModel().updateOne(
        { key: normalizeKey(massType.key) },
        {
          $setOnInsert: {
            key: normalizeKey(massType.key),
            label: massType.label,
            roleKeys: massType.roleKeys.map((roleKey) => normalizeKey(roleKey)),
            fallbackRoleKey: "NONE",
            active: true,
          },
        },
        { upsert: true }
      );
    }
  }

  await remapRoleKeysToNumeric();
  await collapseDuplicateRolesByDefinition();
  await normalizeMassTypesRoleKeys();
}

export async function listLiturgyRoles(options?: { activeOnly?: boolean }) {
  await ensureLiturgyDefaults();
  return getLiturgyRoleModel()
    .find(options?.activeOnly ? { active: true } : {})
    .lean()
    .then((roles) =>
      dedupeByKey(roles).sort((a, b) => {
        const aNumber = Number(a.key);
        const bNumber = Number(b.key);
        const aIsNumber = Number.isFinite(aNumber);
        const bIsNumber = Number.isFinite(bNumber);
        if (aIsNumber && bIsNumber) return aNumber - bNumber;
        if (aIsNumber) return -1;
        if (bIsNumber) return 1;
        return a.key.localeCompare(b.key);
      })
    );
}

export async function listLiturgyMassTypes(options?: { activeOnly?: boolean }) {
  await ensureLiturgyDefaults();
  return getLiturgyMassTypeModel()
    .find(options?.activeOnly ? { active: true } : {})
    .sort({ label: 1 })
    .lean()
    .then((massTypes) =>
      dedupeByKey(
        massTypes.map((massType) => ({
          ...massType,
          key: normalizeKey(massType.key),
          roleKeys: dedupeRoleKeys(Array.isArray(massType.roleKeys) ? massType.roleKeys : []),
          fallbackRoleKey:
            typeof massType.fallbackRoleKey === "string" && massType.fallbackRoleKey.trim()
              ? normalizeLiturgyRoleKey(massType.fallbackRoleKey)
              : null,
        }))
      )
    );
}

export async function getMassTypeTemplateMap(options?: { activeOnly?: boolean }): Promise<Record<string, string[]>> {
  const massTypes = await listLiturgyMassTypes(options);
  return Object.fromEntries(
    massTypes.map((massType) => [
      normalizeKey(massType.key),
      dedupeRoleKeys(Array.isArray(massType.roleKeys) ? massType.roleKeys : []),
    ])
  );
}

export async function getMassTypeConfig(
  massTypeKey: string
): Promise<{
  roleKeys: string[];
  fallbackRoleKey: string | null;
}> {
  await ensureLiturgyDefaults();
  const normalizedKey = normalizeKey(massTypeKey);
  const massType = await getLiturgyMassTypeModel()
    .findOne({ key: normalizedKey, active: true })
    .select("roleKeys fallbackRoleKey")
    .lean();
  if (!massType) return { roleKeys: [], fallbackRoleKey: null };
  const roleKeys = dedupeRoleKeys(Array.isArray(massType.roleKeys) ? massType.roleKeys : []);
  const fallbackRoleKey =
    typeof massType.fallbackRoleKey === "string" && roleKeys.includes(normalizeLiturgyRoleKey(massType.fallbackRoleKey))
      ? normalizeLiturgyRoleKey(massType.fallbackRoleKey)
      : null;
  return { roleKeys, fallbackRoleKey };
}

export async function getMassTypeTemplateRoleKeys(massTypeKey: string): Promise<string[]> {
  const config = await getMassTypeConfig(massTypeKey);
  return config.roleKeys;
}

export async function isValidActiveMassType(massTypeKey: string): Promise<boolean> {
  await ensureLiturgyDefaults();
  const normalizedKey = normalizeKey(massTypeKey);
  const exists = await getLiturgyMassTypeModel().exists({ key: normalizedKey, active: true });
  return Boolean(exists);
}

export async function getRoleWeightMap(roleKeys: string[]): Promise<Map<string, number>> {
  await ensureLiturgyDefaults();
  const normalizedRoleKeys = dedupeRoleKeys(roleKeys);
  if (normalizedRoleKeys.length === 0) return new Map();

  const roles = await getLiturgyRoleModel()
    .find({ key: { $in: normalizedRoleKeys } })
    .select("key score")
    .lean();

  return new Map(roles.map((role) => [normalizeLiturgyRoleKey(role.key), typeof role.score === "number" ? role.score : 0]));
}

export async function getNextLiturgyRoleKey(): Promise<string> {
  await ensureLiturgyDefaults();
  const roles = await getLiturgyRoleModel().find({}).select("key").lean();
  let maxKey = 0;
  for (const role of roles) {
    const asNumber = Number(role.key);
    if (Number.isFinite(asNumber) && asNumber > maxKey) {
      maxKey = asNumber;
    }
  }
  return String(maxKey + 1);
}

export async function getNextLiturgyMassTypeKey(): Promise<string> {
  await ensureLiturgyDefaults();
  const massTypes = await getLiturgyMassTypeModel().find({}).select("key").lean();
  let maxKey = 0;
  for (const massType of massTypes) {
    const asNumber = Number(massType.key);
    if (Number.isFinite(asNumber) && asNumber > maxKey) {
      maxKey = asNumber;
    }
  }
  return String(maxKey + 1);
}

export function normalizeRoleKeyList(roleKeys: string[]): string[] {
  return dedupeRoleKeys(roleKeys);
}

export function normalizeLiturgyRoleKey(value: string): string {
  return normalizeKey(value);
}

export function normalizeLiturgyKey(value: string): string {
  return normalizeKey(value);
}
