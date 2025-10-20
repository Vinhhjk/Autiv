# Autiv API Functions

This is a separate Netlify project dedicated to hosting Autiv API functions. This separation allows for:

- **Cost Management**: Redeploy to new Netlify projects when hitting function usage limits
- **Isolation**: API functions are separate from the main frontend
- **Scalability**: Can deploy multiple API instances if needed

## Setup

1. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Deploy to Netlify:
   ```bash
   netlify deploy --prod
   ```

## Environment Variables

- `WORKER_URL`: Your Cloudflare Worker URL
- `WORKER_SHARED_SECRET`: Shared secret for HMAC authentication

## API Endpoint

Once deployed, your API will be available at:
```
https://your-api-site.netlify.app/.netlify/functions/handle_req
```

## Cost Management Strategy

When you approach Netlify's function usage limits:

1. Create a new Netlify site
2. Deploy this project to the new site
3. Update your frontend's `API_BASE_URL` to point to the new site
4. Delete the old site if needed

This allows you to effectively reset your function usage limits by using fresh Netlify projects.
