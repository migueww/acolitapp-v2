export type LiturgyRoleDefault = {
  key: string;
  label: string;
  description: string;
  score: number;
};

export type LiturgyMassTypeDefault = {
  key: string;
  label: string;
  roleKeys: string[];
};

export const DEFAULT_LITURGY_ROLES: LiturgyRoleDefault[] = [
  { key: "TURIFERARIO", label: "Turiferario", description: "Conduz o turibulo/incenso.", score: 100 },
  { key: "MISSAL", label: "Missal", description: "Auxilia o celebrante com o missal.", score: 90 },
  { key: "CREDENCIA", label: "Credencia", description: "Responsavel pela preparacao da credencia.", score: 80 },
  { key: "AMBAO", label: "Ambao", description: "Assistencia no ambao e leitura.", score: 70 },
  { key: "SINO_1", label: "Sino 1", description: "Toque de sino na consagracao.", score: 60 },
  { key: "ACOMPANHANTE_DO_LEITOR", label: "Acompanhante do leitor", description: "Apoio direto ao leitor.", score: 50 },
  { key: "SINO_2", label: "Sino 2", description: "Apoio adicional no sino.", score: 40 },
  { key: "TOCHA_1", label: "Tocha 1", description: "Conducao da tocha 1.", score: 30 },
  { key: "TOCHA_2", label: "Tocha 2", description: "Conducao da tocha 2.", score: 20 },
  { key: "NONE", label: "Funcao livre", description: "Espaco para funcao adicional na missa.", score: 0 },
];

export const DEFAULT_LITURGY_MASS_TYPES: LiturgyMassTypeDefault[] = [
  {
    key: "SIMPLES",
    label: "Simples",
    roleKeys: ["MISSAL", "CREDENCIA", "AMBAO", "SINO_1", "ACOMPANHANTE_DO_LEITOR", "TOCHA_1", "TOCHA_2", "NONE"],
  },
  {
    key: "SOLENE",
    label: "Solene",
    roleKeys: ["TURIFERARIO", "MISSAL", "CREDENCIA", "AMBAO", "SINO_1", "ACOMPANHANTE_DO_LEITOR", "SINO_2", "TOCHA_1", "TOCHA_2", "NONE"],
  },
  {
    key: "PALAVRA",
    label: "Palavra",
    roleKeys: ["CREDENCIA", "AMBAO", "ACOMPANHANTE_DO_LEITOR", "NONE"],
  },
];
