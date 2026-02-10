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

```bash
curl -X POST http://localhost:3000/api/setup \
  -H 'Content-Type: application/json' \
  -H 'x-setup-token: token-unico-para-bootstrap' \
  -d '{"name":"Admin Inicial","username":"admin","password":"SenhaForte123"}'
```

## Login

```bash
curl -i -c cookie-cer.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"SenhaForte123"}'
```

Resposta de sucesso:

```json
{
  "ok": true,
  "token": "<jwt>"
}
```

Exemplo de login com persistência de cookie:

```bash
curl -i -c cookie.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"SenhaForte123"}'
```

Resposta de sucesso (resumo):

```json
{
  "ok": true,
  "token": "<jwt>"
}
```

## Endpoints RBAC

### Criar missa (CERIMONIARIO)

```bash
curl -i -b cookie.txt http://localhost:3000/api/health/protected
```

### Listar missas

```bash
curl -i -b cookie-cer.txt 'http://localhost:3000/api/masses?status=SCHEDULED'
```

### Detalhar missa

```bash
curl -i -b cookie.txt http://localhost:3000/api/health/admin
```

## Ações da máquina de estados (etapa 3)

### Admin actions (CERIMONIARIO + ser `createdBy` ou `chiefBy`; delegação só `createdBy`)

```bash
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -b cookie.txt \
  -d '{"name":"Novo Acólito","username":"acolito1","password":"Senha123","role":"ACOLITO"}'
```

# PREPARATION: OPEN -> PREPARATION
curl -i -X POST -b cookie-cer.txt http://localhost:3000/api/masses/<MASS_ID>/preparation

## API de Missas (etapa 2)

### Criar missa (somente CERIMONIARIO)

```bash
curl -i -X POST http://localhost:3000/api/masses \
  -H 'Content-Type: application/json' \
  -b cookie.txt \
  -d '{
    "scheduledAt":"2026-02-14T19:00:00.000Z",
    "assignments":[
      {"roleKey":"CRUZ", "userId": null},
      {"roleKey":"VELA_1", "userId": null}
    ]
  }'
```

Resposta de sucesso:

```json
{
  "massId": "67aa53c8f93f5fa8d8f64cd2"
}
```

### Listar missas (autenticado)

```bash
curl -i -b cookie.txt 'http://localhost:3000/api/masses?status=SCHEDULED&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z'
```

Resposta de sucesso:

```json
{
  "items": [
    {
      "id": "67aa53c8f93f5fa8d8f64cd2",
      "status": "SCHEDULED",
      "scheduledAt": "2026-02-14T19:00:00.000Z",
      "chiefBy": "67aa5000f93f5fa8d8f64ca1",
      "createdBy": "67aa5000f93f5fa8d8f64ca1"
    }
  ]
}
```

### Detalhar missa por id (autenticado)

```bash
curl -i -b cookie.txt http://localhost:3000/api/masses/67aa53c8f93f5fa8d8f64cd2
```

Resposta de sucesso (resumo):

```json
{
  "id": "67aa53c8f93f5fa8d8f64cd2",
  "status": "SCHEDULED",
  "scheduledAt": "2026-02-14T19:00:00.000Z",
  "createdBy": "67aa5000f93f5fa8d8f64ca1",
  "chiefBy": "67aa5000f93f5fa8d8f64ca1",
  "attendance": {
    "joined": [],
    "confirmed": []
  },
  "assignments": [
    { "roleKey": "CRUZ", "userId": null }
  ],
  "events": []
}
```

## Seed opcional de missa

```bash
npm run seed:mass
```

O comando busca o primeiro `CERIMONIARIO` ativo e cria uma missa para `+2 dias` (arredondada para a hora cheia). É idempotente com tolerância de ±5 minutos no `scheduledAt`.

## Teste manual ponta a ponta (com cookies)

1. Bootstrap do admin em `/api/setup`.
2. Login do admin em `/api/login` salvando cookie em `cookie.txt`.
3. Criar uma missa em `/api/masses`.
4. Listar missas em `/api/masses`.
5. Ver detalhe em `/api/masses/:id`.

## Decisão sobre signup público

A rota pública de signup (`/api/signup`) foi mantida apenas para compatibilidade e agora retorna `403` com mensagem explícita informando que o cadastro público está desabilitado.
