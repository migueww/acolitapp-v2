# Acolitapp v2

Projeto Next.js (**App Router**) com MongoDB + Mongoose e autenticação JWT (cookie httpOnly ou Authorization header).

## Etapa 4 — robustez operacional

- **Abertura da missa é 100% manual** via `POST /api/masses/:id/open`.
- **Não existe cron/worker/interval** para auto-abertura.
- Regra de regressão: qualquer proposta futura de automação temporal deve ser rejeitada nesta etapa.

## Requisitos

- Node.js 18+
- MongoDB local ou Atlas

## Variáveis de ambiente

```bash
MONGODB_URI="mongodb://localhost:27017/acolitapp-db"
JWT_SECRET="troque-este-segredo-forte"
SETUP_TOKEN="token-unico-para-bootstrap"
```

## Rodando local

```bash
npm install
npm run dev
```

Aplicação: `http://localhost:3000`.

## Error shape padrão

Todos os erros de API seguem o formato:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Mass is not OPEN",
    "requestId": "8f65c818-0e3f-4eac-a774-d31defd18e01"
  }
}
```

Além disso, o header `x-request-id` também é retornado.

## Endpoints operacionais novos

### GET `/api/masses/mine` (auth obrigatório)

Suporta query params: `status`, `from`, `to`, `page`, `limit`.

- CERIMONIARIO: missas onde ele é `createdBy` **ou** `chiefBy`.
- ACOLITO: missas onde ele está em `attendance.joined` ou `attendance.confirmed`.

Exemplo:

```bash
curl -i -b cookie.txt 'http://localhost:3000/api/masses/mine?status=OPEN&page=1&limit=20'
```

### GET `/api/masses/next` (auth obrigatório)

Retorna a próxima missa relevante com payload enxuto:

```json
{
  "item": {
    "id": "67aa53c8f93f5fa8d8f64cd2",
    "status": "OPEN",
    "scheduledAt": "2026-02-14T19:00:00.000Z",
    "chiefBy": "67aa5000f93f5fa8d8f64ca1",
    "createdBy": "67aa5000f93f5fa8d8f64ca1"
  }
}
```

Exemplo:

```bash
curl -i -b cookie.txt http://localhost:3000/api/masses/next
```

## Rate limit de login

`POST /api/login` e `POST /api/auth/login` possuem limite leve:

- **10 tentativas por IP a cada 5 minutos**.
- Implementação em memória (`Map`) para simplicidade no dev.

Exemplo de resposta 429:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Muitas tentativas de login. Tente novamente em alguns minutos.",
    "requestId": "2ed8e8d1-9ce1-4124-a85b-54888f2f7ae2",
    "details": {
      "resetAt": "2026-03-01T10:15:00.000Z"
    }
  }
}
```

### Limitação conhecida em produção

Como o limiter é in-memory, ele não é compartilhado entre múltiplas instâncias/processos e pode resetar em restart. Evolução recomendada: usar Redis com janela deslizante/token bucket.

## Segurança (headers)

As respostas passam a incluir:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self';`

## Fluxo mínimo

### 1) Bootstrap do primeiro CERIMONIARIO

```bash
curl -X POST http://localhost:3000/api/setup \
  -H 'Content-Type: application/json' \
  -H 'x-setup-token: token-unico-para-bootstrap' \
  -d '{"name":"Admin Inicial","username":"admin","password":"SenhaForte123"}'
```

### 2) Login

```bash
curl -i -c cookie.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"SenhaForte123"}'
```

## Testes manuais recomendados (curl)

1. **Login OK**
   ```bash
   curl -i -c cookie.txt -X POST http://localhost:3000/api/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"admin","password":"SenhaForte123"}'
   ```
2. **Erro de transição + requestId** (ex.: preparação em `SCHEDULED`)
   ```bash
   curl -i -b cookie.txt -X POST http://localhost:3000/api/masses/<MASS_ID>/preparation
   ```
   Verificar `error.code=CONFLICT`, `error.requestId` e header `x-request-id`.
3. **Rate limit 429 no login**
   ```bash
   for i in {1..12}; do
     curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/login \
       -H 'Content-Type: application/json' \
       -d '{"username":"admin","password":"senha-errada"}'
   done
   ```
4. **Operação diária** (`mine` e `next`)
   ```bash
   curl -i -b cookie.txt 'http://localhost:3000/api/masses/mine?page=1&limit=10'
   curl -i -b cookie.txt http://localhost:3000/api/masses/next
   ```

## Compatibilidade

A rota pública de signup (`/api/signup`) foi mantida por compatibilidade e retorna `403`.
