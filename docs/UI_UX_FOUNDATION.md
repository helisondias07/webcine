# UI/UX Foundation - WebCinema

## Objetivo
Criar uma base visual consistente para evoluir o produto (incluindo checkout/pagamentos) sem retrabalho de estilo.

## Design Tokens
- Fonte base: `Manrope`
- Fonte de destaque: `Sora`
- Cores principais: `webgreen` e `webgold`
- Superficies: `bg-app`, `bg-surface`, `bg-elevated`, `bg-panel`
- Raio de borda padrao: `10-16px`
- Sombra padrao: `--shadow-soft`

Tokens centralizados em:
- `src/index.css`

## Componentes-base priorizados
- Header/TopBar com padrao de marca e seletor de tema
- Home com cards de recursos e herois consistentes
- Area principal da sala com contraste adequado em claro/escuro
- Botoes e badges seguindo a paleta verde + dourado

## Regras de consistencia
- Evitar cores hardcoded em componentes; preferir variaveis globais.
- Reduzir estilos inline em favor de classes CSS.
- Preservar legibilidade em modo claro e escuro.
- Manter a mesma linguagem visual entre Home, Sala e Fluxos de Assinatura.

## Proxima etapa (antes de pagamentos em producao)
1. Consolidar textos de interface em PT-BR (home, modais e erros restantes).
2. Padronizar estados de carregamento/erro/sucesso com componentes reutilizaveis.
3. Revisar responsividade mobile da sala (TopBar + colunas laterais + controles).
4. Aplicar a mesma base visual nas paginas de planos/checkout.
