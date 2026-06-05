// Dynamic route — game IDs are only known at runtime. Opt out of the
// prerender crawler (the layout enables prerender globally for the SPA
// shell) so the build doesn't fail trying to resolve [id] entries.
export const prerender = false;
