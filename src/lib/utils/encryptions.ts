import forge from 'node-forge';

export function encryptPassword(encryptionKey: string, timestamp: number, password: string): string {
    // 1. Prepare Payload: password + "|" + timestamp
    const payload = `${password}|${timestamp}`;

    // 2. Base64 Encode Payload
    // Java: input = Base64.encodeBase64(stringToBytes(payload))
    // We use forge to ensure correct UTF-8 handling before Base64
    const payloadBuffer = forge.util.createBuffer(payload, 'utf8');
    const payloadBase64 = forge.util.encode64(payloadBuffer.getBytes());

    // 3. Import Public Key
    // Java: X509EncodedKeySpec(Base64.decodeBase64(encryptionKey))
    const keyDer = forge.util.decode64(encryptionKey);
    const asn1 = forge.asn1.fromDer(keyDer);
    const publicKey = forge.pki.publicKeyFromAsn1(asn1);

    // 4. Encrypt with PKCS#1 v1.5 Padding
    // Java: Cipher.getInstance("RSA/ECB/PKCS1Padding")
    const encryptedBytes = publicKey.encrypt(payloadBase64, 'RSAES-PKCS1-V1_5');

    // 5. Final Base64 Encode
    // Java: return Base64.encodeBase64(output)
    return forge.util.encode64(encryptedBytes);
}