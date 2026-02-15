const MASS_ROLE_LABELS: Record<string, string> = {
  MISSAL: "Missal",
  CREDENCIA: "Credência",
  AMBAO: "Ambão",
  SINO_1: "Sino 1",
  SINO_2: "Sino 2",
  TOCHA_1: "Tocha 1",
  TOCHA_2: "Tocha 2",
  ACOMPANHANTE_DO_LEITOR: "Acompanhante do leitor",
  TURIFERARIO: "Turiferário",
  TURIBULO: "Turiferário",
  NONE: "Função livre",
};

const MASS_ROLE_DESCRIPTIONS: Record<string, string> = {
  MISSAL: "Auxilia o celebrante com o missal.",
  CREDENCIA: "Responsável pela preparação da credência.",
  AMBAO: "Assistência no ambão e leitura.",
  SINO_1: "Toque de sino na consagração.",
  SINO_2: "Apoio adicional no sino.",
  TOCHA_1: "Condução da tocha 1.",
  TOCHA_2: "Condução da tocha 2.",
  ACOMPANHANTE_DO_LEITOR: "Apoio direto ao leitor.",
  TURIFERARIO: "Conduz o turíbulo/incenso.",
  TURIBULO: "Conduz o turíbulo/incenso.",
  NONE: "Espaço para função adicional na missa.",
};

const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .map((token) => (token ? `${token[0]?.toUpperCase() ?? ""}${token.slice(1)}` : token))
    .join(" ");

export const getMassRoleLabel = (roleKey: string): string => MASS_ROLE_LABELS[roleKey] ?? toTitleCase(roleKey);

export const getMassRoleDescription = (roleKey: string): string =>
  MASS_ROLE_DESCRIPTIONS[roleKey] ?? "Função de apoio litúrgico.";
