//calulating the hash of each function
import crypto from 'crypto';

export function hashBody(body: string): string{
    const normalized = body
    .replace(/\/\/.*$/gm, '')           //strip single line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // strip block comments
    .replace(/\s+/g, ' ')               //colapse white spaces
    .trim();
    return crypto.createHash('sha256').update(body).digest('hex');

}

