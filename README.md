# orican-printify

Backend for the ORICAN tee customizer. Printify's API rejects browser requests, so every
Printify call goes through these Vercel functions and the token stays in Vercel.

## Endpoints

| Endpoint | Who calls it | What it does |
| --- | --- | --- |
| `GET /api/catalog` | you (`x-admin-key`) | Read-only: Printify shops + EU providers for candidate blanks. |
| `POST /api/setup` | you (`x-admin-key`) | Creates/reuses one unpublished draft per blank in Printify shop 7881083; returns variant mapping, costs, mockups. `GET` = report only. |
| `POST /api/upload` | storefront | Issues a Vercel Blob client-upload token for the design PNG (PNG only, max 40 MB, `designs/`). |
| `POST /api/shopify-order` | Shopify webhook | On "Order payment", sends ORICAN line items (SKU `PFY-…` + `_design_url` property) to Printify. Orders wait for your approval in Printify unless `AUTO_PRODUCTION=true`. |

## Environment variables

| Name | Value |
| --- | --- |
| `PRINTIFY_TOKEN` | Printify personal access token |
| `ADMIN_KEY` | Your own random string (admin endpoints) |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when you connect a Blob store (Storage tab → Create → Blob → connect to this project) |
| `ALLOWED_ORIGINS` | `https://orican-41i0abev.myshopify.com` (+ your custom domain later, comma-separated) |
| `SHOPIFY_WEBHOOK_SECRET` | Signing secret from Shopify admin → Settings → Notifications → Webhooks |
| `AUTO_PRODUCTION` | Optional. `true` to send orders straight to production |

## Commands (PowerShell)

```powershell
npm install
vercel env add ALLOWED_ORIGINS production
vercel deploy --prod

# run setup (creates the Printify drafts) and save the report
$h = @{ "x-admin-key" = "<ADMIN_KEY>" }
Invoke-RestMethod -Method Post -Uri "https://orican-printify.vercel.app/api/setup" -Headers $h -TimeoutSec 180 |
  ConvertTo-Json -Depth 10 | Out-File setup.json -Encoding utf8
```

## Shopify webhook

Shopify admin → Settings → Notifications → Webhooks → Create webhook:
event **Order payment**, format **JSON**, URL `https://orican-printify.vercel.app/api/shopify-order`.
Copy the signing secret shown on that page into `SHOPIFY_WEBHOOK_SECRET`, then redeploy.
