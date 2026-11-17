# Achadinhos+ — Cloudflare Pages + D1

Site de afiliados com vitrine pública, categorias (incluindo Emagrecimento), busca, favoritos, páginas individuais compartilháveis e administração protegida.

## 1. Preparar no computador

Instale Node.js e use um terminal na pasta deste projeto. Faça login:

```bash
npx wrangler login
```

## 2. Criar o banco de dados D1

```bash
npx wrangler d1 create achadinhos-db
```

Copie o `database_id` retornado. Copie `wrangler.toml.example` para `wrangler.toml` e substitua `COLE_AQUI_O_DATABASE_ID_D1` pelo ID gerado. Não publique a chave `SETUP_KEY` em arquivos do GitHub.

Crie as tabelas no banco remoto:

```bash
npx wrangler d1 execute achadinhos-db --remote --file=./schema.sql
```

Se quiser testar localmente, execute também:

```bash
npx wrangler d1 execute achadinhos-db --local --file=./schema.sql
```

## 3. Criar projeto Pages e conectar GitHub

1. Suba **a pasta do projeto inteira** para um repositório GitHub (incluindo `functions/`, `public/`, `schema.sql`, `wrangler.toml.example`). **Não envie `wrangler.toml` se não for usar configuração por arquivo; leia a nota abaixo.**
2. No Cloudflare: Workers & Pages → Create → Pages → Connect to Git → selecione seu repositório.
3. Configurações do build: Framework `None`; comando de build vazio; diretório de saída `public`; diretório raiz `/`.
4. Pages → Settings → Functions → D1 database bindings: adicione binding chamado **DB**, escolhendo `achadinhos-db` (configure também nos ambientes Preview se for usar). O Pages precisa desse nome exato.
5. Em Settings → Variables and Secrets, crie uma **variável do tipo Secret** com nome `SETUP_KEY` e uma chave difícil de adivinhar com pelo menos 16 caracteres. Configure em produção (e preview, se necessário). **Não cole essa chave nos arquivos públicos.**
6. Implante/reimplante o Pages. Abra `https://seu-projeto.pages.dev/admin.html`.
7. Na primeira visita, informe sua `SETUP_KEY` e crie uma senha de administrador com **no mínimo 12 caracteres**. Em seguida, faça login e cadastre produtos.

### Nota sobre Wrangler

A configuração pelo painel do Cloudflare descrita acima funciona sem `wrangler.toml` no repositório. O arquivo `wrangler.toml.example` é apenas uma referência para desenvolvimento e deploy via CLI. Se quiser usá-lo como configuração efetiva, renomeie para `wrangler.toml`, preencha o database_id e confira que a configuração do D1 e build corresponde à produção. Alterar entre gestão por painel e arquivo pode fazer o Cloudflare passar a ler bindings do arquivo. Mantenha uma única fonte de configuração consistente.

### Publicação usando CLI (alternativa)

Depois de criar e configurar o projeto Pages e definir segredo/binding no Cloudflare:

```bash
npx wrangler pages deploy public --project-name achadinhos-plus
```

Se usar CLI, certifique-se de que as Functions foram incluídas, que existe binding D1 no projeto e que `SETUP_KEY` está configurada no ambiente de destino. Para projetos vinculados ao Git, o fluxo recomendado é fazer push para acionar a implantação.

## 4. Como usar

- Vitrine pública: `/`
- Administrador: `/admin.html`
- Página individual: `/produto/slug-do-produto`
- No painel, **Gerar página** copia um link público exclusivo; não precisa baixar HTML.
- Em produtos ocultos, o link individual não abre para visitantes.
- Você pode usar imagens hospedadas por URL pública (`https://...`). Atenção a bloqueio de hotlink de marketplaces; prefira imagens hospedadas com autorização apropriada.
- Emagrecimento é uma categoria, sem alegações automáticas de resultados médicos. Evite promessas de perda de peso garantida e confira as regras de anúncios/afiliados de cada loja.

## 5. Segurança e limitações

- Login administrativo com senha PBKDF2, cookie `HttpOnly`, `Secure`, `SameSite=Strict`, sessão de 8 horas e rotas mutáveis protegidas.
- A primeira instalação requer `SETUP_KEY`. Depois de criado o administrador, não é possível recriá-lo pela tela de instalação.
- O login não inclui limitação de tentativas por IP nesta versão. **Antes de ampla divulgação, ative uma regra Cloudflare WAF/rate limiting para `/api/login` e `/api/setup`**.
- A página individual é renderizada no navegador por JavaScript: funciona para visita e compartilhamento, mas para SEO/social cards automáticos seria necessário renderizar `og:title` e `og:image` no servidor.
- Não há upload de imagens, painel de estatísticas ou rastreamento de comissão: os links levam à loja parceira e os relatórios de comissão são da plataforma de afiliados.
- Preços são cadastrados manualmente e podem mudar na loja parceira.
- Faça exportação/backup periódico do banco D1 e configure um domínio próprio se desejar.
