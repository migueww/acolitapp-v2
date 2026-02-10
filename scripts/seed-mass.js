/* eslint-disable no-console */
const mongoose = require("mongoose");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("Defina MONGODB_URI no .env.local");
}

const userSchema = new mongoose.Schema(
  {
    role: { type: String, required: true },
    active: { type: Boolean, required: true },
  },
  { collection: "users" }
);

const massSchema = new mongoose.Schema(
  {
    status: String,
    scheduledAt: Date,
    createdBy: mongoose.Types.ObjectId,
    chiefBy: mongoose.Types.ObjectId,
  },
  { collection: "masses", timestamps: true }
);

const User = mongoose.models.SeedUser || mongoose.model("SeedUser", userSchema);
const Mass = mongoose.models.SeedMass || mongoose.model("SeedMass", massSchema);

const buildTargetDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  date.setMinutes(0, 0, 0);
  return date;
};

async function run() {
  await mongoose.connect(uri);

  const cerimoniario = await User.findOne({ role: "CERIMONIARIO", active: true }).select("_id").lean();
  if (!cerimoniario) {
    console.log("Nenhum CERIMONIARIO ativo encontrado. Nada para seed.");
    return;
  }

  const target = buildTargetDate();
  const toleranceMs = 5 * 60 * 1000;
  const from = new Date(target.getTime() - toleranceMs);
  const to = new Date(target.getTime() + toleranceMs);

  const existing = await Mass.findOne({ scheduledAt: { $gte: from, $lte: to } }).select("_id scheduledAt").lean();
  if (existing) {
    console.log(`Missa já existe próximo desse horário: ${existing._id} (${existing.scheduledAt.toISOString()})`);
    return;
  }

  const created = await Mass.create({
    status: "SCHEDULED",
    scheduledAt: target,
    createdBy: cerimoniario._id,
    chiefBy: cerimoniario._id,
  });

  console.log(`Missa criada: ${created._id.toString()} em ${target.toISOString()}`);
}

run()
  .catch((error) => {
    console.error("Falha no seed de missa:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
