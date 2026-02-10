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

## API Missas

### Criar missa (CERIMONIARIO)

```bash
curl -i -X POST http://localhost:3000/api/masses \
  -H 'Content-Type: application/json' \
  -b cookie-cer.txt \
  -d '{"scheduledAt":"2026-02-14T19:00:00.000Z"}'
```

### Listar missas

```bash
curl -i -b cookie-cer.txt 'http://localhost:3000/api/masses?status=SCHEDULED'
```

### Detalhar missa

```bash
curl -i -b cookie-cer.txt http://localhost:3000/api/masses/<MASS_ID>
```

## Ações da máquina de estados (etapa 3)

### Admin actions (CERIMONIARIO + ser `createdBy` ou `chiefBy`; delegação só `createdBy`)

```bash
# OPEN: SCHEDULED -> OPEN
curl -i -X POST -b cookie-cer.txt http://localhost:3000/api/masses/<MASS_ID>/open

# PREPARATION: OPEN -> PREPARATION
curl -i -X POST -b cookie-cer.txt http://localhost:3000/api/masses/<MASS_ID>/preparation

# FINISH: PREPARATION -> FINISHED
curl -i -X POST -b cookie-cer.txt http://localhost:3000/api/masses/<MASS_ID>/finish

# CANCEL: permitido só em SCHEDULED ou OPEN
curl -i -X POST -b cookie-cer.txt http://localhost:3000/api/masses/<MASS_ID>/cancel

# DELEGATE: somente createdBy
curl -i -X POST -b cookie-cer.txt http://localhost:3000/api/masses/<MASS_ID>/delegate \
  -H 'Content-Type: application/json' \
  -d '{"newChiefBy":"<USER_ID_CERIMONIARIO>"}'

# ASSIGN-ROLES: permitido somente em PREPARATION
curl -i -X POST -b cookie-cer.txt http://localhost:3000/api/masses/<MASS_ID>/assign-roles \
  -H 'Content-Type: application/json' \
  -d '{
    "assignments": [
      {"roleKey":"cruciferario", "userId":"<USER_ID_ACOLITO>"},
      {"roleKey":"microfone", "userId":null}
    ]
  }'
```

### Acolito actions (somente ACOLITO)

```bash
# login do acólito
curl -i -c cookie-aco.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"acolito","password":"Senha123"}'

# JOIN: permitido somente em OPEN (idempotente)
curl -i -X POST -b cookie-aco.txt http://localhost:3000/api/masses/<MASS_ID>/join

# CONFIRM: permitido somente em OPEN (idempotente); auto-join se necessário
curl -i -X POST -b cookie-aco.txt http://localhost:3000/api/masses/<MASS_ID>/confirm
```

### Exemplo de resposta de ação bem-sucedida

```json
{
  "ok": true,
  "mass": {
    "id": "67aa53c8f93f5fa8d8f64cd2",
    "status": "OPEN",
    "attendance": {
      "joined": [],
      "confirmed": []
    },
    "assignments": [],
    "events": [
      {
        "type": "MASS_OPENED",
        "actorId": "67aa5000f93f5fa8d8f64ca1",
        "at": "2026-02-12T20:15:00.000Z",
        "payload": null
      }
    ]
  }
}
```

## Fluxo manual completo (etapa 3)

1. Login cerimoniário.
2. Criar missa.
3. `POST /open`.
4. Login acólito.
5. `POST /join` + `POST /confirm`.
6. `POST /preparation` (joined não confirmados são removidos).
7. `POST /assign-roles`.
8. `POST /finish`.

## Política de erros

- `401` não autenticado.
- `403` autenticado com role incompatível para a ação.
- `404` missa inexistente **ou** sem vínculo administrativo para aquela missa (política anti-enumeração para ações administrativas).
- `409` transição de estado inválida.
- `400` body inválido.

## Seed opcional

```bash
npm run seed:mass
```

Cria uma missa futura (+2 dias), idempotente por janela de ±5 minutos.
