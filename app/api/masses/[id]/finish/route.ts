import { handleMassAction } from "@/app/api/masses/[id]/_action-helpers";
import { finishMassAction } from "@/src/domain/mass/actions";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return handleMassAction(req, context, ({ massId, actor }) => finishMassAction({ massId, actor }));
}
