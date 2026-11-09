/** Dados fixos do site (contato, navegação). */
export const site = {
  name: "LumenzIA",
  whatsappNumber: "5513997379065",
  whatsappLabel: "(13) 99737-9065",
  /** Recebe pedidos de privacidade e de exclusão de dados (encaminhado para o Gmail pelo ImprovMX). */
  privacyEmail: "privacidade@lumenzia.com.br",
  /**
   * Dados da empresa na política de privacidade. Vazio aparece [ENTRE COLCHETES] no site e
   * deixa pendente o item da política na tela Lançamento do /admin.
   */
  company: {
    legalName: "70.045.248 RUDNEI DE SOUZA SILVA",
    cnpj: "70.045.248/0001-54",
    address:
      "Rua Jefferson Damião do Amaral, 169, Casa 1, Vila Nova, Cubatão/SP, CEP 11525-050",
  },
};

/** A política de privacidade já tem razão social, CNPJ e endereço? */
export const companyInfoComplete = Object.values(site.company).every((v) =>
  v.trim(),
);

export function whatsappLink(
  message = "Olá! Quero saber mais sobre a LumenzIA.",
) {
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export const navLinks = [
  { href: "/#o-que-faz", label: "O que faz" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/planos", label: "Planos" },
  { href: "/#perguntas", label: "Perguntas" },
];
