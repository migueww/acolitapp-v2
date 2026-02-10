# Acolitapp v2

Projeto Next.js (App Router) com MongoDB + Mongoose e autenticação baseada em JWT com cookie httpOnly.

## Requisitos

- Node.js 18+
- MongoDB local ou Atlas

## Variáveis de ambiente

Crie `.env.local`:

```bash
MONGODB_URI="mongodb://localhost:27017/acolitapp-db"
JWT_SECRET="troque-este-segredo-forte"
SETUP_TOKEN="token-unico-para-bootstrap"
```

## Rodando o projeto

```bash
npm install
npm run dev
```

Aplicação em `http://localhost:3000`.

## Fluxo de bootstrap (primeiro CERIMONIARIO)

O sistema não permite self-signup público. O primeiro CERIMONIARIO deve ser criado uma única vez via `POST /api/setup` com header `x-setup-token`.

```bash
curl -X POST http://localhost:3000/api/setup \
  -H 'Content-Type: application/json' \
  -H 'x-setup-token: token-unico-para-bootstrap' \
  -d '{"name":"Admin Inicial","username":"admin","password":"SenhaForte123"}'
```

Se já existir CERIMONIARIO, a rota retorna `409`.

## Login e persistência de sessão

`POST /api/login` valida credenciais e grava cookie `session` com:

- `httpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure` em produção

Ao logar com sucesso, a UI redireciona para `/masses`. Ao acessar `/login` já autenticado, há redirecionamento automático para `/masses`.

## Endpoints RBAC

### Health protegido (qualquer autenticado)

```bash
curl -i http://localhost:3000/api/health/protected
```

Com cookie de sessão válido, retorna `200` com `user.id` e `user.role`.

### Health admin-only (somente CERIMONIARIO)

```bash
curl -i http://localhost:3000/api/health/admin
```

- `200` para CERIMONIARIO
- `403` para ACOLITO
- `401` sem sessão

### Criar usuário (somente CERIMONIARIO)

```bash
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Novo Acólito","username":"acolito1","password":"Senha123","role":"ACOLITO"}'
```

Essa rota exige sessão válida de CERIMONIARIO.

## Teste manual ponta a ponta (com cookies)

1. Bootstrap do admin em `/api/setup`.
2. Login do admin em `/api/login` salvando cookie:

```bash
curl -i -c cookie.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"SenhaForte123"}'
```

3. Criar usuário com sessão do admin:

```bash
curl -i -b cookie.txt -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Acolito","username":"acolito","password":"Senha123","role":"ACOLITO"}'
```

4. Validar endpoints protegidos:

```bash
curl -i -b cookie.txt http://localhost:3000/api/health/protected
curl -i -b cookie.txt http://localhost:3000/api/health/admin
```

## Decisão sobre signup público

A rota pública de signup (`/api/signup`) foi mantida apenas para compatibilidade e agora retorna `403` com mensagem explícita informando que o cadastro público está desabilitado.
