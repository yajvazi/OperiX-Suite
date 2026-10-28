import { getLocalStore } from './localStore';
import { getStorageMode } from './storageMode';
import type { LocalDataStore } from '@invoice-monorepo/data-store';

/** The on-device store when the app is in local mode, otherwise null (the screen keeps using the cloud). */
export async function activeLocalStore(): Promise<LocalDataStore | null> {
    return (await getStorageMode()) === 'local' ? getLocalStore() : null;
}

/** On-device contracts with the customer attached as `client` ({ id, name }), newest first unless `ascending`. */
export async function localContractRows(limit = 0, ascending = false): Promise<any[]> {
    const store = await activeLocalStore();
    if (!store) return [];
    const [contracts, clients] = await Promise.all([store.list('contracts', { orderBy: ascending ? 'created_at' : '-created_at', limit: limit || undefined }), store.list('clients')]);
    const byId = new Map(clients.map((client) => [String(client.id), client]));
    return contracts.map((contract) => {
        const client = contract.client_id ? byId.get(String(contract.client_id)) : null;
        return { ...contract, client: client ? { id: client.id, name: client.name } : null };
    });
}
