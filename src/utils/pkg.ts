export function mergePackageJson(base: any, delta: any) {
  const out = { ...base } as any;
  out.scripts = { ...(base.scripts || {}), ...(delta.scripts || {}) };
  out.devDependencies = { ...(base.devDependencies || {}), ...(delta.devDependencies || {}) };
  return out;
}