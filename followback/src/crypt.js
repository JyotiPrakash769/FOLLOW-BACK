/**
 * Password-protected backups, using only the browser's built-in Web Crypto:
 * PBKDF2-SHA256 stretches the password into an AES-GCM-256 key. A backup is a
 * list of usernames, so it should not sit unreadable-by-nobody in a downloads
 * folder or chat app. Nothing here touches the network.
 */

const ITER = 310000; // OWASP's 2023 guidance for PBKDF2-SHA256
const FORMAT = "followback-encrypted";

/** @param {Uint8Array} bytes */
const b64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
/** @param {string} text */
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** @param {string} password @param {BufferSource} salt @param {number} iter */
async function keyFrom(password, salt, iter) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** True when the Web Crypto API is there (it needs https or localhost). */
export const canEncrypt = () => typeof crypto !== "undefined" && !!crypto.subtle;

/** Is this text an encrypted backup (as opposed to a plain JSON one)? */
export function isEncrypted(text) {
  try {
    const j = JSON.parse(text);
    return !!j && j.format === FORMAT;
  } catch (e) {
    return false;
  }
}

/**
 * Encrypt a backup.
 * @param {string} text
 * @param {string} password
 * @returns {Promise<string>} a small JSON envelope
 */
export async function encryptText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, ITER);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text))
  );
  return JSON.stringify({
    format: FORMAT,
    v: 1,
    kdf: "PBKDF2-SHA256",
    iter: ITER,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(data)
  });
}

/**
 * Decrypt a backup. Resolves `{ok:false}` on a wrong password or a damaged
 * file, which AES-GCM cannot tell apart.
 * @param {string} text
 * @param {string} password
 * @returns {Promise<{ok: true, text: string} | {ok: false, reason: string}>}
 */
export async function decryptText(text, password) {
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: "not JSON" };
  }
  if (!j || j.format !== FORMAT || j.v !== 1) return { ok: false, reason: "not an encrypted backup" };
  try {
    const key = await keyFrom(password, unb64(j.salt), Number(j.iter) || ITER);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(j.iv) }, key, unb64(j.data));
    return { ok: true, text: new TextDecoder().decode(plain) };
  } catch (e) {
    return { ok: false, reason: "wrong password or damaged file" };
  }
}
