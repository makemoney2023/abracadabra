/** Test helper: a throwaway RSA key generated in-process. Never a real Google key. */
export async function throwawayServiceAccount(): Promise<{ json: string; publicKey: CryptoKey; email: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let binary = "";
  for (const byte of der) binary += String.fromCharCode(byte);
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  const pem = `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
  const email = "hq-search-reader@test-project.iam.gserviceaccount.com";
  const json = JSON.stringify({
    type: "service_account",
    project_id: "test-project",
    private_key_id: "test-key-1",
    private_key: pem,
    client_email: email,
    token_uri: "https://oauth2.googleapis.com/token",
  });
  return { json, publicKey: pair.publicKey, email };
}
