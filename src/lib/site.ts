/** Dados fixos do site (contato, navegação). */
export const site = {
  name: "LumenzIA",
  whatsappNumber: "5513997379065",
  whatsappLabel: "(13) 99737-9065",
  /** Recebe pedidos de privacidade e de exclusão de dados (encaminhado para o Gmail pelo ImprovMX). */
  privacyEmail: "privacidade@lumenzia.com.br",
};

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
