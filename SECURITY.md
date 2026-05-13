# Security Policy

## Relatando problemas

Se encontrar uma vulnerabilidade ou exposição de segredo, não abra uma issue pública com detalhes sensíveis.

Entre em contato com os mantenedores por um canal privado do repositório ou, se ainda não houver um canal definido, abra uma issue curta sem detalhes exploráveis pedindo contato privado.

## Dados sensíveis

Nunca publique:

- `SUPABASE_SERVICE_ROLE_KEY`
- Tokens pessoais do GitHub
- Dumps de banco com dados reais
- Arquivos `.env`
- Screenshots com chaves ou credenciais

## Escopo

O projeto usa Supabase Auth, Row Level Security e GitHub Actions. Pontos importantes para revisar:

- Políticas RLS em `src/sql/schema.sql`
- Uso exclusivo de `VITE_SUPABASE_ANON_KEY` no frontend
- Uso de `SUPABASE_SERVICE_ROLE_KEY` somente no workflow de coleta
- Importação/exportação CSV sem vazamento de dados de outros usuários
