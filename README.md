This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Requisitos

- Node.js 18+
- MongoDB em execução localmente ou via Atlas

### Variáveis de ambiente

Crie um arquivo `.env.local` com valores de exemplo (não coloque segredos reais em repositórios públicos):

```bash
MONGODB_URI="mongodb://localhost:27017/acolitapp-db"
JWT_SECRET="troque-este-segredo"
```

### Rodando o projeto

First, run the development server:

```bash
npm install
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```


Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

### Endpoints úteis

Login (retorna JWT):

```bash
curl -X POST http://localhost:3000/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{\"username\":\"usuario@exemplo.com\",\"password\":\"senha\"}'
```

Endpoint protegido (envie o token no Authorization Bearer):

```bash
curl http://localhost:3000/api/health/protected \\
  -H 'Authorization: Bearer <SEU_TOKEN>'
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
