import type { MassType } from "@/models/Mass";

export const MASS_ROLE_TEMPLATES: Record<MassType, string[]> = {
  SIMPLES: ["MISSAL", "CREDENCIA", "AMBAO", "SINO_1", "ACOMPANHANTE_DO_LEITOR", "TOCHA_1", "TOCHA_2", "NONE"],
  SOLENE: [
    "TURIFERARIO",
    "MISSAL",
    "CREDENCIA",
    "AMBAO",
    "SINO_1",
    "ACOMPANHANTE_DO_LEITOR",
    "SINO_2",
    "TOCHA_1",
    "TOCHA_2",
    "NONE",
  ],
  PALAVRA: ["CREDENCIA", "AMBAO", "ACOMPANHANTE_DO_LEITOR", "NONE"],
};

export const getAssignmentsTemplateByMassType = (massType: MassType) =>
  MASS_ROLE_TEMPLATES[massType].map((roleKey) => ({ roleKey, userId: null }));
