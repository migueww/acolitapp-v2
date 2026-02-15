import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { getMassModel } from "@/models/Mass";
import { getUserModel } from "@/models/User";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { logError } from "@/src/server/http/logging";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { getUserNameMapByIds } from "@/src/server/users/lookup";

export const runtime = "nodejs";

type MassCardShape = {
  id: string;
  name: string;
  status: string;
  massType: string;
  scheduledAt: Date;
  createdBy: string;
  chiefBy: string;
  createdByName: string | null;
  chiefByName: string | null;
};

type RankingItem = {
  userId: string;
  userName: string | null;
  participations: number;
};

const serializeMasses = async (
  masses: Array<{
    _id: { toString(): string };
    name?: string;
    status: string;
    massType: string;
    scheduledAt: Date;
    createdBy: { toString(): string };
    chiefBy: { toString(): string };
  }>
): Promise<MassCardShape[]> => {
  const userIds = masses.flatMap((mass) => [mass.createdBy.toString(), mass.chiefBy.toString()]);
  const nameMap = await getUserNameMapByIds(userIds);

  return masses.map((mass) => ({
    id: mass._id.toString(),
    name: mass.name ?? "",
    status: mass.status,
    massType: mass.massType,
    scheduledAt: mass.scheduledAt,
    createdBy: mass.createdBy.toString(),
    chiefBy: mass.chiefBy.toString(),
    createdByName: nameMap.get(mass.createdBy.toString()) ?? null,
    chiefByName: nameMap.get(mass.chiefBy.toString()) ?? null,
  }));
};

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAuth(req);
    await dbConnect();

    const now = new Date();

    const upcomingFilter =
      auth.role === "CERIMONIARIO"
        ? {
            status: { $in: ["SCHEDULED", "OPEN", "PREPARATION"] },
            scheduledAt: { $gte: now },
          }
        : {
            status: { $in: ["SCHEDULED", "OPEN"] },
            scheduledAt: { $gte: now },
          };

    const [upcomingMassesRaw, lastServedRaw, activeUsers, activeAcolitos, activeCerimoniarios, rankingRaw] = await Promise.all([
      getMassModel()
        .find(upcomingFilter)
        .sort({ scheduledAt: 1 })
        .limit(3)
        .select("_id name status massType scheduledAt createdBy chiefBy")
        .lean(),
      auth.role === "CERIMONIARIO"
        ? getMassModel()
            .findOne({
              status: { $in: ["FINISHED", "PREPARATION", "OPEN"] },
              $or: [{ createdBy: auth.userId }, { chiefBy: auth.userId }],
            })
            .sort({ scheduledAt: -1 })
            .select("_id name status massType scheduledAt createdBy chiefBy")
            .lean()
        : getMassModel()
            .findOne({
              status: "FINISHED",
              "attendance.confirmed.userId": auth.userId,
            })
            .sort({ scheduledAt: -1 })
            .select("_id name status massType scheduledAt createdBy chiefBy")
            .lean(),
      getUserModel().countDocuments({ active: true }),
      getUserModel().countDocuments({ active: true, role: "ACOLITO" }),
      getUserModel().countDocuments({ active: true, role: "CERIMONIARIO" }),
      getMassModel()
        .aggregate<{ _id: { toString(): string }; participations: number }>([
          { $match: { status: "FINISHED" } },
          { $unwind: "$attendance.confirmed" },
          {
            $group: {
              _id: "$attendance.confirmed.userId",
              participations: { $sum: 1 },
            },
          },
          { $sort: { participations: -1, _id: 1 } },
          { $limit: 10 },
        ])
        .exec(),
    ]);

    const upcomingMasses = await serializeMasses(upcomingMassesRaw);
    const lastServed = lastServedRaw ? (await serializeMasses([lastServedRaw]))[0] : null;
    const rankingNameMap = await getUserNameMapByIds(rankingRaw.map((item) => item._id.toString()));
    const ranking: RankingItem[] = rankingRaw.map((item) => ({
      userId: item._id.toString(),
      userName: rankingNameMap.get(item._id.toString()) ?? null,
      participations: item.participations,
    }));

    return jsonOk(
      {
        upcomingMasses,
        lastServed,
        ranking,
        stats: {
          activeUsers,
          activeAcolitos,
          activeCerimoniarios,
        },
      },
      requestId
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return toHttpResponse(error, requestId);
    }
    logError(requestId, "Erro ao montar dashboard", error);
    return toHttpResponse(error, requestId);
  }
}
