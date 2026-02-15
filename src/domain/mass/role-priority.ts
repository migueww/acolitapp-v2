export const ROLE_WEIGHTS: Record<string, number> = {
  TURIFERARIO: 100,
  MISSAL: 90,
  CREDENCIA: 80,
  AMBAO: 70,
  SINO_1: 60,
  ACOMPANHANTE_DO_LEITOR: 50,
  SINO_2: 40,
  TOCHA_1: 30,
  TOCHA_2: 20,
  NONE: 0,
};

export const getRoleWeight = (roleKey: string): number => ROLE_WEIGHTS[roleKey] ?? 0;
