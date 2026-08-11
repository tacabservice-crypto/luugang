export const isFullAdmin = (item: any): boolean => {
  if (!item) return false;

  const username = String(item.username || '').toLowerCase().trim();
  const role = String(item.role || '').toLowerCase().trim();
  const name = String(item.name || '').toLowerCase().trim();
  const permissions = Array.isArray(item.permissions) ? item.permissions : [];

  return (
    username === 'admin' ||
    username === 'superadmin' ||
    role === 'super admin' ||
    role === 'full admin' ||
    role === 'administrator' ||
    name === 'super admin' ||
    name === 'full admin' ||
    name === 'administrator' ||
    permissions.includes('all')
  );
};
