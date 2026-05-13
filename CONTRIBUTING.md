# Contributing to clima-registro

Obrigado por querer colaborar com o clima-registro.

Este projeto busca ser simples, leve e útil para registro meteorológico pessoal e comunitário. O foco é manter uma aplicação rápida, sem dependências pesadas e sem integrações de marketing, comércio, anúncios ou rastreamento.

## Como contribuir

1. Abra uma issue descrevendo o problema, ideia ou melhoria.
2. Comente que pretende trabalhar nela, se quiser evitar trabalho duplicado.
3. Faça um fork do repositório.
4. Crie uma branch curta e clara.
5. Rode os comandos locais antes de abrir o pull request.
6. Abra um pull request explicando o que mudou e como foi testado.

## Ambiente local

```bash
npm install
npm run dev
npm run build
```

Para testar recursos com Supabase, copie `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` em código frontend, logs, screenshots, issues ou pull requests.

## Padrões do projeto

- TypeScript estrito.
- CSS simples, sem Tailwind, Bootstrap ou Material UI.
- Preferir tabelas, formulários compactos e gráficos objetivos.
- Evitar animações e frameworks pesados.
- Não adicionar analytics, ads, pixels, e-commerce ou integrações comerciais.
- Manter textos e opções principais em português.
- Preservar o fluxo de GitHub Pages e GitHub Actions.

## Antes de abrir PR

Rode:

```bash
npm run build
```

Se alterar a coleta automática, teste também:

```bash
npm run collect:weather
```

Esse comando precisa de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` configurados no ambiente.

## Boas primeiras contribuições

- Melhorias em filtros do histórico.
- Ajustes de acessibilidade.
- Novos formatos de exportação.
- Melhor validação de CSV.
- Documentação com exemplos de configuração Supabase.
- Pequenas melhorias nos gráficos.

## Segurança

Não publique chaves privadas, service role keys, tokens pessoais ou dados sensíveis. Se encontrar uma falha de segurança, siga `SECURITY.md`.
