# Recipe: add a BFF route

Add one Portal or Build BFF endpoint for a browser flow that must keep a
credential server-side. Follow the repository's thin route-file/factory
boundary and AGENTS.md's secret-handling rule.

Work in this order:

1. Implement the named route factory in
   `apps/<app>/src/server/bff/<domain>/routes.ts`. Validate write origins, then
   inputs, then session/ownership, before creating a backend client or making
   backend I/O. Preserve `BackendRequestError.status` and scrub backend paths.
2. Keep `apps/<app>/src/app/api/bff/<domain>/<name>/route.ts` declarative:
   `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and the exported method
   bound to the factory.
3. Add the path to `API_PATHS`; call it from the domain's shared browser
   client and typed contract rather than a string at the call site.
4. Test a 400 path and one backend failure through the production response
   helper. Route failures through the existing observability classifier.
5. Document the endpoint and add every new environment key to the owning
   example file with a fake value.

Do not add per-IP rate limiting to authenticated launch routes, infer an
origin from a required env var, leak upstream paths, advertise a provider
without a handler, expose a server credential through `NEXT_PUBLIC_`, or edit
outside the selected app/domain.

Required gates: `//:bffRouteContract`, both app test targets (the unaffected
one should cache), `//:envKeyParity`, and `//:typeCheckApps`.

Evidence: aomi PRs #205, #207, #208, #209, #233, #236, #237, #238, #243, #253, #254, #255, #259, #262, #265, #267, #425, #435, #448, #449, #466, #504, #506.
