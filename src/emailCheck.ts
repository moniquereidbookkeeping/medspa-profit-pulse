/** Friendly email checks for the lead form. The server still makes the final decision. */

const DOMAIN_FIXES: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com',
  'gamil.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.comm': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outloook.com': 'outlook.com',
  'iclould.com': 'icloud.com', 'icloud.con': 'icloud.com', 'icoud.com': 'icloud.com', 'iclod.com': 'icloud.com',
  'aol.con': 'aol.com'
};
const TLD_FIXES: Record<string, string> = { con: 'com', cmo: 'com', ocm: 'com', coom: 'com', vom: 'com', xom: 'com', comm: 'com', 'c0m': 'com' };

/** Returns a plain-language problem with the address, or null when it looks usable. */
export function emailProblem(raw: string): string | null {
  const email = raw.trim();
  if (!email) return 'Please enter your email address.';
  if (/\s/.test(email)) return 'An email address cannot contain spaces.';
  const at = email.indexOf('@');
  if (at === -1) return 'An email address needs an @ sign, like name@example.com.';
  if (email.indexOf('@', at + 1) !== -1) return 'An email address can only have one @ sign.';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local) return 'Please type the part before the @ sign, like name@example.com.';
  if (!domain) return 'Please type the part after the @ sign, like gmail.com.';
  if (!domain.includes('.')) return 'After the @ there should be a website name that ends like .com, for example name@gmail.com.';
  if (/\.\./.test(email) || domain.startsWith('.') || domain.endsWith('.') || local.startsWith('.') || local.endsWith('.')) return 'This email address has a misplaced dot. Please check it.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'This does not look like a full email address. Please check it.';
  return null;
}

/** For a valid-looking address with a likely typo in the domain, returns the corrected address; otherwise null. */
export function suggestEmail(raw: string): string | null {
  const email = raw.trim();
  if (emailProblem(email)) return null;
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (DOMAIN_FIXES[domain]) return `${local}@${DOMAIN_FIXES[domain]}`;
  const dot = domain.lastIndexOf('.');
  const tld = domain.slice(dot + 1);
  if (TLD_FIXES[tld]) return `${local}@${domain.slice(0, dot)}.${TLD_FIXES[tld]}`;
  return null;
}
