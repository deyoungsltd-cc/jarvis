// Secret vault stub — uses Supabase Vault or encrypted env vars in production
const secrets = new Map<string, string>();

export const secretVault = {
  store(key: string, value: string) {
    secrets.set(key, value);
    return { key, stored: true };
  },
  retrieve(key: string) {
    const value = secrets.get(key);
    if (!value) throw new Error(`Secret not found: ${key}`);
    return { key, value };
  },
  delete(key: string) {
    const existed = secrets.delete(key);
    return { key, deleted: existed };
  },
  list() {
    return { keys: Array.from(secrets.keys()) };
  },
};
