const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface OfflinePosEnvelope<TPayload = unknown> {
  schemaVersion: 1;
  clientItemId: string;
  idempotencyKey: string;
  queueSequence: number;
  configurationVersion: number;
  occurredAt: string;
  payload: TPayload;
}

export interface EncryptedOfflineRecord {
  schemaVersion: 1;
  keyVersion: number;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
  checksum: string;
  createdAt: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createDeviceQueueKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptOfflineEnvelope<TPayload>(
  envelope: OfflinePosEnvelope<TPayload>,
  key: CryptoKey,
  keyVersion = 1,
): Promise<EncryptedOfflineRecord> {
  const plaintext = canonicalJson(envelope);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`operix-pos:${keyVersion}`) },
    key,
    encoder.encode(plaintext),
  );
  return {
    schemaVersion: 1,
    keyVersion,
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    checksum: await sha256Hex(plaintext),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptOfflineEnvelope<TPayload>(
  record: EncryptedOfflineRecord,
  key: CryptoKey,
): Promise<OfflinePosEnvelope<TPayload>> {
  if (record.schemaVersion !== 1 || record.algorithm !== "AES-GCM") {
    throw new Error("Unsupported OperiX offline queue record");
  }
  let plaintext: string;
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(record.iv),
        additionalData: encoder.encode(`operix-pos:${record.keyVersion}`),
      },
      key,
      base64ToBytes(record.ciphertext),
    );
    plaintext = decoder.decode(decrypted);
  } catch {
    throw new Error("Offline queue record failed authenticated decryption");
  }
  if ((await sha256Hex(plaintext)) !== record.checksum) {
    throw new Error("Offline queue integrity validation failed");
  }
  return JSON.parse(plaintext) as OfflinePosEnvelope<TPayload>;
}

export class EncryptedIndexedDbQueue<TPayload> {
  constructor(
    private readonly databaseName = "operix-pos-secure",
    private readonly storeName = "encrypted-queue",
  ) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName, { keyPath: "clientItemId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open the encrypted POS queue"));
    });
  }

  async put(
    envelope: OfflinePosEnvelope<TPayload>,
    key: CryptoKey,
    keyVersion = 1,
  ): Promise<EncryptedOfflineRecord> {
    const encrypted = await encryptOfflineEnvelope(envelope, key, keyVersion);
    const database = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(this.storeName, "readwrite");
        transaction.objectStore(this.storeName).put({
          clientItemId: envelope.clientItemId,
          queueSequence: envelope.queueSequence,
          encrypted,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Unable to persist offline POS item"));
        transaction.onabort = () => reject(transaction.error ?? new Error("Offline POS queue transaction aborted"));
      });
      return encrypted;
    } finally {
      database.close();
    }
  }

  async list(key: CryptoKey): Promise<Array<OfflinePosEnvelope<TPayload>>> {
    const database = await this.open();
    try {
      const rows = await new Promise<Array<{ encrypted: EncryptedOfflineRecord }>>((resolve, reject) => {
        const request = database.transaction(this.storeName, "readonly")
          .objectStore(this.storeName)
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Unable to read offline POS queue"));
      });
      const values = await Promise.all(rows.map((row) => decryptOfflineEnvelope<TPayload>(row.encrypted, key)));
      return values.sort((left, right) => left.queueSequence - right.queueSequence);
    } finally {
      database.close();
    }
  }

  async remove(clientItemId: string): Promise<void> {
    const database = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(this.storeName, "readwrite");
        transaction.objectStore(this.storeName).delete(clientItemId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Unable to remove offline POS item"));
      });
    } finally {
      database.close();
    }
  }
}
