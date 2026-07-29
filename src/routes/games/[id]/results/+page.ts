// Dynamic [id] route — exclude from the prerender crawler (the layout
// enables prerender globally for the SPA shell) so the build doesn't
// fail trying to resolve [id] entries. Same convention as ../+page.ts.
export const prerender = false;
